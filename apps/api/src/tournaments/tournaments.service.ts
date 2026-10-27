import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { MatchSpec, roundRobin, singleElimination, standings } from './bracket';
import { AddTeamDto, CreateTournamentDto, GenerateDto, UpdateMatchDto } from './tournaments.dto';

const matchInclude = { homeTeam: true, awayTeam: true } satisfies Prisma.MatchInclude;

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list() {
    const rows = await this.prisma.tournament.findMany({ include: { _count: { select: { teams: true } } }, orderBy: { startDate: 'desc' } });
    return rows.map(({ _count, ...t }) => ({ ...t, teamCount: _count.teams }));
  }

  async get(id: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        teams: { orderBy: [{ seed: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }] },
        matches: { include: matchInclude, orderBy: [{ round: 'asc' }, { position: 'asc' }] },
      },
    });
    if (!t) throw new NotFoundException('Tournament not found');
    const table =
      t.format === 'ROUND_ROBIN'
        ? standings(
            t.teams.map((x) => x.id),
            t.matches
              .filter((m) => m.status === 'COMPLETED' && m.homeTeamId && m.awayTeamId)
              .map((m) => ({ home: m.homeTeamId!, away: m.awayTeamId!, homeScore: m.homeScore ?? 0, awayScore: m.awayScore ?? 0 })),
          ).map((s) => ({ ...s, team: t.teams.find((x) => x.id === s.teamId)!.name }))
        : undefined;
    return { ...t, teamCount: t.teams.length, standings: table };
  }

  async create(actor: AuthUser, dto: CreateTournamentDto) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.tournament.create({ data: { ...dto, startDate: new Date(dto.startDate), organizerId: actor.id } });
      await this.audit.append(tx, { actorId: actor.id, action: 'tournament.create', entity: 'Tournament', entityId: t.id, payload: { ...dto } });
      return { ...t, teamCount: 0 };
    });
  }

  async addTeam(id: string, dto: AddTeamDto) {
    await this.draft(id);
    const clash = await this.prisma.team.findFirst({ where: { tournamentId: id, name: { equals: dto.name, mode: 'insensitive' } } });
    if (clash) throw new ConflictException('A team with this name is already registered');
    return this.prisma.team.create({ data: { ...dto, tournamentId: id } });
  }

  async removeTeam(id: string, teamId: string) {
    await this.draft(id);
    const { count } = await this.prisma.team.deleteMany({ where: { id: teamId, tournamentId: id } });
    if (!count) throw new NotFoundException('Team not found');
    return { ok: true };
  }

  /** Publishes fixtures: a seeded bracket (top seeds get byes) or a circle-method round robin. */
  async generate(actor: AuthUser, id: string, dto: GenerateDto) {
    const t = await this.draft(id);
    const teams = await this.prisma.team.findMany({
      where: { tournamentId: id },
      orderBy: [{ seed: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    });
    if (teams.length < 2) throw new BadRequestException('Register at least two teams first');
    const specs = t.format === 'SINGLE_ELIMINATION' ? singleElimination(teams.length) : roundRobin(teams.length);
    const startAt = dto.startAt ? new Date(dto.startAt) : t.startDate;
    const slot = (dto.matchMinutes ?? 60) * 60_000;

    const ids = new Map<string, string>(specs.map((s) => [`${s.round}:${s.position}`, randomUUID()]));
    let k = 0;
    const data = specs.map((s: MatchSpec) => ({
      id: ids.get(`${s.round}:${s.position}`)!,
      tournamentId: id,
      round: s.round,
      position: s.position,
      homeTeamId: s.home === null ? null : teams[s.home].id,
      awayTeamId: s.away === null ? null : teams[s.away].id,
      winnerId: s.winner === null ? null : teams[s.winner].id,
      status: s.bye ? ('BYE' as const) : ('SCHEDULED' as const),
      scheduledAt: s.bye ? null : new Date(startAt.getTime() + k++ * slot),
      facilityId: t.facilityId,
      nextMatchId: s.next ? ids.get(`${s.next.round}:${s.next.position}`)! : null,
      nextSlot: s.next ? s.next.slot : null,
    }));

    await this.prisma.$transaction(async (tx) => {
      await tx.match.createMany({ data });
      await tx.tournament.update({ where: { id }, data: { status: 'ONGOING' } });
      await this.audit.append(tx, {
        actorId: actor.id,
        action: 'tournament.generate',
        entity: 'Tournament',
        entityId: id,
        payload: { format: t.format, teams: teams.length, matches: data.length },
      });
    });
    await this.notifications.notifyRoles(['HOSTEL_SECRETARY', 'SPORT_COORDINATOR', 'MEDIA_NOMINEE'], {
      title: `Fixtures out: ${t.name}`,
      body: `${teams.length} teams, ${data.filter((d) => d.status !== 'BYE').length} matches. First match ${startAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`,
      type: 'INFO',
      link: `/events/${id}`,
    });
    return this.get(id);
  }

  /** Records a score. Completing an elimination match moves the winner into the next round. */
  async updateMatch(actor: AuthUser, matchId: string, dto: UpdateMatchDto) {
    return this.prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId }, include: { tournament: true } });
      if (!match) throw new NotFoundException('Match not found');
      if (match.status === 'BYE') throw new ConflictException('Byes have no score');
      if (match.tournament.status !== 'ONGOING') throw new ConflictException(`Tournament is ${match.tournament.status.toLowerCase()}`);

      const homeScore = dto.homeScore ?? match.homeScore;
      const awayScore = dto.awayScore ?? match.awayScore;
      const status = dto.status ?? match.status;
      let winnerId: string | null = null;
      if (status === 'COMPLETED') {
        if (!match.homeTeamId || !match.awayTeamId) throw new ConflictException('Both teams must be known before the result is entered');
        if (homeScore === null || awayScore === null) throw new BadRequestException('Enter both scores to complete the match');
        if (homeScore !== awayScore) winnerId = homeScore > awayScore ? match.homeTeamId : match.awayTeamId;
        else if (match.tournament.format === 'SINGLE_ELIMINATION') throw new BadRequestException('Knock-out matches need a winner (enter the tie-break result)');
      }

      if (match.nextMatchId && match.winnerId && match.winnerId !== winnerId) {
        const next = await tx.match.findUniqueOrThrow({ where: { id: match.nextMatchId } });
        if (next.status === 'COMPLETED' || next.status === 'LIVE') throw new ConflictException('The next-round match has already started; its result must be cleared first');
      }

      const updated = await tx.match.update({
        where: { id: matchId },
        data: {
          homeScore,
          awayScore,
          status,
          winnerId,
          ...(dto.scheduledAt ? { scheduledAt: new Date(dto.scheduledAt) } : {}),
          ...(dto.facilityId ? { facilityId: dto.facilityId } : {}),
        },
        include: matchInclude,
      });

      if (match.nextMatchId) {
        await tx.match.update({
          where: { id: match.nextMatchId },
          data: match.nextSlot === 0 ? { homeTeamId: winnerId } : { awayTeamId: winnerId },
        });
      }
      await this.audit.append(tx, {
        actorId: actor.id,
        action: 'match.update',
        entity: 'Match',
        entityId: matchId,
        payload: { homeScore, awayScore, status, winnerId },
      });
      await this.maybeComplete(tx, match.tournamentId);
      return updated;
    });
  }

  private async maybeComplete(tx: Tx, tournamentId: string) {
    const t = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId }, include: { matches: true, teams: true } });
    let championId: string | null = null;
    if (t.format === 'SINGLE_ELIMINATION') {
      const final = t.matches.find((m) => m.nextMatchId === null);
      if (final?.status === 'COMPLETED') championId = final.winnerId;
    } else if (t.matches.every((m) => m.status === 'COMPLETED' || m.status === 'BYE')) {
      const table = standings(
        t.teams.map((x) => x.id),
        t.matches.map((m) => ({ home: m.homeTeamId!, away: m.awayTeamId!, homeScore: m.homeScore ?? 0, awayScore: m.awayScore ?? 0 })),
      );
      championId = table[0]?.teamId ?? null;
    }
    if (championId) await tx.tournament.update({ where: { id: tournamentId }, data: { status: 'COMPLETED', championId } });
  }

  private async draft(id: string) {
    const t = await this.prisma.tournament.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tournament not found');
    if (t.status !== 'DRAFT') throw new ConflictException('Fixtures are already published');
    return t;
  }
}
