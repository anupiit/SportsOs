import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Team, Tournament, TournamentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { can, norm, permissionScope } from '../rbac/access';
import { userSummary } from '../common/selects';
import { MatchSpec, roundRobin, singleElimination, standings } from './bracket';
import { AddTeamDto, CreateTournamentDto, GenerateDto, UpdateMatchDto, UpdateTournamentDto } from './tournaments.dto';

const matchInclude = { homeTeam: true, awayTeam: true } satisfies Prisma.MatchInclude;

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Proposals and rejected proposals are visible only to their organiser and reviewers. */
  private visibility(user: AuthUser): Prisma.TournamentWhereInput {
    if (can(user, 'event.approve') || can(user, 'event.update')) return {};
    return { OR: [{ status: { notIn: ['PROPOSED', 'REJECTED'] } }, { organizerId: user.id }] };
  }

  async list(user: AuthUser, status?: string) {
    const rows = await this.prisma.tournament.findMany({
      where: { AND: [this.visibility(user), status ? { status: status as TournamentStatus } : {}] },
      include: { _count: { select: { teams: true } } },
      orderBy: { startDate: 'desc' },
    });
    return rows.map(({ _count, ...t }) => ({ ...t, teamCount: _count.teams }));
  }

  async get(user: AuthUser, id: string) {
    const t = await this.prisma.tournament.findFirst({
      where: { AND: [{ id }, this.visibility(user)] },
      include: {
        teams: { orderBy: [{ seed: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }], include: { members: { include: { user: { select: { id: true, name: true, hostel: true } } } } } },
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

  /** Organisers without event.approve create a PROPOSED tournament that a reviewer must approve. */
  async create(actor: AuthUser, dto: CreateTournamentDto) {
    const approver = can(actor, 'event.approve');
    const t = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tournament.create({
        data: { ...dto, startDate: new Date(dto.startDate), organizerId: actor.id, status: approver ? 'DRAFT' : 'PROPOSED', ...(approver ? { approvedById: actor.id, approvedAt: new Date() } : {}) },
      });
      await this.audit.append(tx, { actorId: actor.id, action: approver ? 'tournament.create' : 'tournament.propose', entity: 'Tournament', entityId: created.id, payload: { ...dto } });
      return created;
    });
    if (!approver) {
      await this.notifications.notifyPermission('event.approve', { title: 'Tournament proposal', body: `${actor.name} proposed “${dto.name}” (${dto.sport}).`, type: 'APPROVAL', link: `/events/${t.id}` }, undefined, [actor.id]);
    }
    return { ...t, teamCount: 0 };
  }

  async update(actor: AuthUser, id: string, dto: UpdateTournamentDto) {
    const t = await this.mustGet(id);
    const organiser = t.organizerId === actor.id && (t.status === 'PROPOSED' || t.status === 'DRAFT');
    if (!can(actor, 'event.update') && !organiser) throw new ForbiddenException('Only the organiser (before fixtures) or event managers can edit this tournament');
    if (t.status === 'COMPLETED') throw new ConflictException('Completed tournaments cannot be edited');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.tournament.update({ where: { id }, data: { ...dto, ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}) } });
      await this.audit.append(tx, { actorId: actor.id, action: 'tournament.update', entity: 'Tournament', entityId: id, payload: { ...dto } });
      return u;
    });
  }

  async review(actor: AuthUser, id: string, approve: boolean, note?: string) {
    const t = await this.mustGet(id);
    if (t.status !== 'PROPOSED') throw new ConflictException(`Tournament is ${t.status.toLowerCase()}, not a pending proposal`);
    if (t.organizerId === actor.id) throw new ForbiddenException('You cannot approve your own proposal');
    const u = await this.prisma.$transaction(async (tx) => {
      const r = await tx.tournament.update({ where: { id }, data: { status: approve ? 'DRAFT' : 'REJECTED', approvedById: actor.id, approvedAt: new Date(), reviewNote: note ?? null } });
      await this.audit.append(tx, { actorId: actor.id, action: approve ? 'tournament.approve' : 'tournament.reject', entity: 'Tournament', entityId: id, payload: { note: note ?? null } });
      return r;
    });
    await this.notifications.notifyUsers([t.organizerId], { title: `Proposal ${approve ? 'approved' : 'declined'}: ${t.name}`, body: note ?? (approve ? 'Team registration is open.' : 'See the reviewer’s note.'), type: 'APPROVAL', link: `/events/${id}` });
    return u;
  }

  /**
   * event.manage_participants registers any team. event.register_team (hostel
   * sports secretaries) registers teams only for their own hostel(s).
   */
  async addTeam(actor: AuthUser, id: string, dto: AddTeamDto) {
    await this.draft(id);
    if (!can(actor, 'event.manage_participants')) {
      const hostels = permissionScope(actor, 'event.register_team').hostels;
      if (!dto.hostel || !hostels.has(norm(dto.hostel))) throw new ForbiddenException('You can only register teams for your own hostel');
    }
    const clash = await this.prisma.team.findFirst({ where: { tournamentId: id, name: { equals: dto.name, mode: 'insensitive' } } });
    if (clash) throw new ConflictException('A team with this name is already registered');
    return this.prisma.$transaction(async (tx) => {
      const team = await tx.team.create({ data: { ...dto, tournamentId: id, registeredById: actor.id } });
      await this.audit.append(tx, { actorId: actor.id, action: 'tournament.team.add', entity: 'Team', entityId: team.id, payload: { tournamentId: id, name: dto.name, hostel: dto.hostel ?? null } });
      return team;
    });
  }

  async removeTeam(actor: AuthUser, id: string, teamId: string) {
    await this.draft(id);
    const team = await this.prisma.team.findFirst({ where: { id: teamId, tournamentId: id } });
    if (!team) throw new NotFoundException('Team not found');
    this.assertTeamControl(actor, team);
    await this.prisma.$transaction(async (tx) => {
      await tx.team.delete({ where: { id: teamId } });
      await this.audit.append(tx, { actorId: actor.id, action: 'tournament.team.remove', entity: 'Team', entityId: teamId, payload: { tournamentId: id, name: team.name } });
    });
    return { ok: true };
  }

  /** Adds a player. Hostel teams accept only residents of that hostel; a player can be in one team per tournament. */
  async addMember(actor: AuthUser, id: string, teamId: string, student: string) {
    await this.draft(id);
    const team = await this.prisma.team.findFirst({ where: { id: teamId, tournamentId: id } });
    if (!team) throw new NotFoundException('Team not found');
    this.assertTeamControl(actor, team);
    const key = student.trim();
    const user = await this.prisma.user.findFirst({
      where: { isActive: true, OR: [{ id: key }, { email: { equals: key, mode: 'insensitive' } }, { admissionNo: { equals: key, mode: 'insensitive' } }] },
      select: { id: true, name: true, hostel: true },
    });
    if (!user) throw new NotFoundException('No active user with that id, email or admission number');
    if (team.hostel && norm(user.hostel ?? '') !== norm(team.hostel)) throw new ConflictException(`${user.name} is not a resident of ${team.hostel}`);
    const elsewhere = await this.prisma.teamMember.findFirst({ where: { userId: user.id, team: { tournamentId: id } }, include: { team: { select: { name: true } } } });
    if (elsewhere) throw new ConflictException(`${user.name} is already registered with ${elsewhere.team.name}`);
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.teamMember.create({ data: { teamId, userId: user.id }, include: { user: { select: userSummary } } });
      await this.audit.append(tx, { actorId: actor.id, action: 'tournament.member.add', entity: 'TeamMember', entityId: m.id, payload: { tournamentId: id, teamId, userId: user.id } });
      return m;
    });
  }

  async removeMember(actor: AuthUser, id: string, teamId: string, memberId: string) {
    await this.draft(id);
    const team = await this.prisma.team.findFirst({ where: { id: teamId, tournamentId: id } });
    if (!team) throw new NotFoundException('Team not found');
    this.assertTeamControl(actor, team);
    const m = await this.prisma.teamMember.findFirst({ where: { id: memberId, teamId } });
    if (!m) throw new NotFoundException('Player not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.teamMember.delete({ where: { id: memberId } });
      await this.audit.append(tx, { actorId: actor.id, action: 'tournament.member.remove', entity: 'TeamMember', entityId: memberId, payload: { tournamentId: id, teamId, userId: m.userId } });
    });
    return { ok: true };
  }

  /** Championships and match wins by team name / hostel across completed matches. */
  async leaderboard(sport?: string) {
    const where: Prisma.TournamentWhereInput = { status: { in: ['ONGOING', 'COMPLETED'] }, ...(sport ? { sport: { equals: sport, mode: 'insensitive' } } : {}) };
    const tournaments = await this.prisma.tournament.findMany({ where, include: { teams: true, matches: { where: { status: 'COMPLETED' } } } });
    const board = new Map<string, { name: string; hostel: string | null; titles: number; played: number; wins: number }>();
    for (const t of tournaments) {
      for (const team of t.teams) {
        const key = norm(team.hostel ?? team.name);
        const row = board.get(key) ?? { name: team.hostel ?? team.name, hostel: team.hostel, titles: 0, played: 0, wins: 0 };
        if (t.championId === team.id) row.titles++;
        for (const m of t.matches) {
          if (m.homeTeamId === team.id || m.awayTeamId === team.id) row.played++;
          if (m.winnerId === team.id) row.wins++;
        }
        board.set(key, row);
      }
    }
    return [...board.values()].sort((a, b) => b.titles - a.titles || b.wins - a.wins || a.name.localeCompare(b.name));
  }

  private assertTeamControl(actor: AuthUser, team: Team) {
    if (can(actor, 'event.manage_participants')) return;
    const hostels = permissionScope(actor, 'event.register_team').hostels;
    if (team.registeredById === actor.id && team.hostel && hostels.has(norm(team.hostel))) return;
    throw new ForbiddenException('You can only manage teams you registered for your hostel');
  }

  private async mustGet(id: string): Promise<Tournament> {
    const t = await this.prisma.tournament.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
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
    await this.notifications.notifyRoles(['HOSTEL_SECRETARY', 'SPORT_COORDINATOR', 'MEDIA_NOMINEE', 'EVENT_COMMITTEE'], {
      title: `Fixtures out: ${t.name}`,
      body: `${teams.length} teams, ${data.filter((d) => d.status !== 'BYE').length} matches. First match ${startAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`,
      type: 'INFO',
      link: `/events/${id}`,
    });
    return this.get(actor, id);
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
    if (t.status === 'PROPOSED') throw new ConflictException('This tournament is still awaiting approval');
    if (t.status === 'REJECTED') throw new ConflictException('This proposal was rejected');
    if (t.status !== 'DRAFT') throw new ConflictException('Fixtures are already published');
    return t;
  }
}
