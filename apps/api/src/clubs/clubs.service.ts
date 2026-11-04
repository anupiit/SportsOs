import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Club, MembershipRole, MembershipStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { userSummary } from '../common/selects';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { can, canIn } from '../rbac/access';
import { RoleAssignmentsService } from '../rbac/role-assignments.service';
import type { ClubAnnouncementDto, CreateClubDto, UpdateClubDto } from './clubs.controller';

const memberCount = { _count: { select: { members: { where: { status: 'ACTIVE' as const } } } } };

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly assignments: RoleAssignmentsService,
  ) {}

  /** Coach of this club, a coordinator for its sport, or a holder of club.manage. */
  leads(user: AuthUser, club: Pick<Club, 'id' | 'sport' | 'coachId'>) {
    return club.coachId === user.id || can(user, 'club.manage') || canIn(user, 'club.manage_own', { clubId: club.id, sport: club.sport });
  }

  private isMember(user: AuthUser, clubId: string) {
    return user.memberships.some((m) => m.clubId === clubId);
  }

  async list(user: AuthUser) {
    const clubs = await this.prisma.club.findMany({
      orderBy: { name: 'asc' },
      include: { coach: { select: { id: true, name: true } }, members: { where: { userId: user.id } }, ...memberCount },
    });
    return clubs.map(({ _count, members, ...club }) => ({ ...club, memberCount: _count.members, myMembership: members[0] ?? null, canManage: this.leads(user, club) }));
  }

  async get(user: AuthUser, id: string) {
    const club = await this.prisma.club.findUnique({
      where: { id },
      include: {
        coach: { select: { id: true, name: true } },
        members: { include: { user: { select: userSummary } }, orderBy: [{ status: 'asc' }, { joinedAt: 'asc' }] },
      },
    });
    if (!club) throw new NotFoundException('Club not found');
    const leader = this.leads(user, club);
    const member = this.isMember(user, id);
    // leaders see the full roster incl. pending requests; members see active team-mates' names; others see the count only
    const members = leader
      ? club.members
      : member
        ? club.members.filter((m) => m.status === 'ACTIVE').map((m) => ({ ...m, user: { id: m.user.id, name: m.user.name, role: m.user.role, email: '', admissionNo: null, hostel: null } }))
        : club.members.filter((m) => m.userId === user.id);
    return {
      ...club,
      members,
      memberCount: club.members.filter((m) => m.status === 'ACTIVE').length,
      myMembership: club.members.find((m) => m.userId === user.id) ?? null,
      canManage: leader,
    };
  }

  async create(actor: AuthUser, dto: CreateClubDto) {
    if (dto.coachId) await this.assertCoach(dto.coachId);
    return this.prisma.$transaction(async (tx) => {
      const club = await tx.club.create({ data: dto, include: { coach: { select: { id: true, name: true } } } });
      await this.audit.append(tx, { actorId: actor.id, action: 'club.create', entity: 'Club', entityId: club.id, payload: { ...dto } });
      return { ...club, memberCount: 0, myMembership: null, canManage: true };
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateClubDto) {
    const club = await this.prisma.club.findUnique({ where: { id } });
    if (!club) throw new NotFoundException('Club not found');
    const coachId = dto.coachId === undefined ? undefined : dto.coachId || null;
    if (coachId) await this.assertCoach(coachId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.club.update({ where: { id }, data: { name: dto.name, description: dto.description, coachId }, include: { coach: { select: { id: true, name: true } } } });
      await this.audit.append(tx, { actorId: actor.id, action: 'club.update', entity: 'Club', entityId: id, payload: { ...dto, previousCoachId: club.coachId } });
      return c;
    });
    if (coachId && coachId !== club.coachId) {
      await this.notifications.notifyUsers([coachId], { title: `You now coach ${updated.name}`, body: 'You can manage its roster and attendance.', type: 'INFO', link: `/clubs/${id}` });
    }
    return updated;
  }

  async join(user: AuthUser, clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club not found');
    const existing = await this.prisma.clubMembership.findUnique({ where: { clubId_userId: { clubId, userId: user.id } } });
    if (existing && (existing.status === 'ACTIVE' || existing.status === 'PENDING')) {
      throw new ConflictException(existing.status === 'ACTIVE' ? 'You are already a member' : 'Your request is pending');
    }
    const membership = existing
      ? await this.prisma.clubMembership.update({ where: { id: existing.id }, data: { status: 'PENDING', role: 'MEMBER', joinedAt: new Date() } })
      : await this.prisma.clubMembership.create({ data: { clubId, userId: user.id } });
    if (club.coachId) {
      await this.notifications.notifyUsers([club.coachId], {
        title: `Join request: ${club.name}`,
        body: `${user.name} asked to join ${club.name}.`,
        type: 'APPROVAL',
        link: `/clubs/${clubId}`,
      });
    }
    return membership;
  }

  async leave(user: AuthUser, clubId: string) {
    const m = await this.prisma.clubMembership.findUnique({ where: { clubId_userId: { clubId, userId: user.id } } });
    if (!m || (m.status !== 'ACTIVE' && m.status !== 'PENDING')) throw new NotFoundException('You are not a member of this club');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.clubMembership.update({ where: { id: m.id }, data: { status: 'LEFT', role: 'MEMBER' } });
      await this.assignments.syncClubMemberRole(tx, user.id, user.id, clubId, false);
      await this.audit.append(tx, { actorId: user.id, action: 'club.member.leave', entity: 'ClubMembership', entityId: m.id, payload: { clubId } });
      return u;
    });
  }

  /** Approve/reject/promote a member. Activation grants the club-scoped CLUB_MEMBER role; leaving revokes it. */
  async updateMember(actor: AuthUser, clubId: string, membershipId: string, dto: { status?: MembershipStatus; role?: MembershipRole }) {
    const membership = await this.prisma.clubMembership.findFirst({ where: { id: membershipId, clubId }, include: { club: true } });
    if (!membership) throw new NotFoundException('Membership not found');
    if (!this.leads(actor, membership.club)) throw new ForbiddenException('Only this club’s coach, its sport coordinator or sports administrators can manage the roster');
    if (membership.userId === actor.id && dto.status) throw new ForbiddenException('You cannot approve or change your own membership');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.clubMembership.update({ where: { id: membershipId }, data: dto, include: { user: { select: userSummary } } });
      if (dto.status && dto.status !== membership.status) {
        await this.assignments.syncClubMemberRole(tx, actor.id, membership.userId, clubId, dto.status === 'ACTIVE');
      }
      await this.audit.append(tx, { actorId: actor.id, action: 'club.member.update', entity: 'ClubMembership', entityId: membershipId, payload: { ...dto, clubId } });
      if (dto.status && dto.status !== membership.status) {
        await this.notifications.notifyUsers(
          [membership.userId],
          {
            title: `${membership.club.name}: ${dto.status === 'ACTIVE' ? 'welcome aboard' : dto.status.toLowerCase()}`,
            body: dto.status === 'ACTIVE' ? `You are now a member of ${membership.club.name}.` : `Your membership status is now ${dto.status.toLowerCase()}.`,
            type: 'INFO',
            link: `/clubs/${clubId}`,
          },
          tx,
        );
      }
      return updated;
    });
  }

  async announcements(user: AuthUser, clubId: string) {
    const club = await this.mustGet(clubId);
    if (!this.leads(user, club) && !this.isMember(user, clubId)) throw new ForbiddenException('Club announcements are visible to members only');
    return this.prisma.announcement.findMany({
      where: { clubId, status: 'PUBLISHED' },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
  }

  async announce(user: AuthUser, clubId: string, dto: ClubAnnouncementDto) {
    const club = await this.mustGet(clubId);
    const allowed = can(user, 'club.manage') || canIn(user, 'club.announce', { clubId, sport: club.sport });
    if (!allowed) throw new ForbiddenException('Only the club’s coach or sports administrators can post club announcements');
    const members = await this.prisma.clubMembership.findMany({ where: { clubId, status: 'ACTIVE' }, select: { userId: true } });
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.announcement.create({
        data: { title: dto.title, body: dto.body, clubId, authorId: user.id, status: 'PUBLISHED', publishedById: user.id, publishedAt: new Date() },
        include: { author: { select: { id: true, name: true } } },
      });
      await this.audit.append(tx, { actorId: user.id, action: 'club.announce', entity: 'Announcement', entityId: a.id, payload: { clubId, title: dto.title } });
      await this.notifications.notifyUsers(members.map((m) => m.userId), { title: `${club.name}: ${dto.title}`, body: dto.body, type: 'INFO', link: `/clubs/${clubId}` }, tx);
      return a;
    });
  }

  /** Club practice bookings and attendance sessions in a window (default: next 30 days). */
  async calendar(user: AuthUser, clubId: string, from?: string, to?: string) {
    const club = await this.mustGet(clubId);
    if (!this.leads(user, club) && !this.isMember(user, clubId) && !can(user, 'booking.view_all')) throw new ForbiddenException('The club calendar is visible to members only');
    const start = from ? new Date(from) : new Date();
    const end = to ? new Date(to) : new Date(start.getTime() + 30 * 86_400_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new BadRequestException('Invalid date range');
    const [bookings, sessions] = await Promise.all([
      this.prisma.booking.findMany({
        where: { clubId, status: { in: ['APPROVED', 'PENDING', 'COMPLETED'] }, start: { lt: end }, end: { gt: start } },
        select: { id: true, start: true, end: true, purpose: true, status: true, facility: { select: { id: true, name: true } } },
        orderBy: { start: 'asc' },
      }),
      this.prisma.attendanceSession.findMany({
        where: { clubId, startsAt: { lt: end }, endsAt: { gt: start } },
        select: { id: true, title: true, startsAt: true, endsAt: true, status: true, facility: { select: { id: true, name: true } } },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    return { clubId, from: start.toISOString(), to: end.toISOString(), bookings, sessions };
  }

  private async mustGet(id: string) {
    const club = await this.prisma.club.findUnique({ where: { id } });
    if (!club) throw new NotFoundException('Club not found');
    return club;
  }

  private async assertCoach(userId: string) {
    const coach = await this.prisma.roleAssignment.findFirst({ where: { userId, role: 'COACH', status: 'ACTIVE' }, select: { id: true } });
    if (!coach) throw new ConflictException('coachId must belong to a user holding the COACH role');
  }
}
