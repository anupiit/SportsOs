import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { MembershipRole, MembershipStatus } from '@prisma/client';
import { hasPermission } from '@sportsos/shared';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { userSummary } from '../common/selects';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const memberCount = { _count: { select: { members: { where: { status: 'ACTIVE' as const } } } } };

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser) {
    const clubs = await this.prisma.club.findMany({
      orderBy: { name: 'asc' },
      include: { coach: { select: userSummary }, members: { where: { userId: user.id } }, ...memberCount },
    });
    return clubs.map(({ _count, members, ...club }) => ({ ...club, memberCount: _count.members, myMembership: members[0] ?? null }));
  }

  async get(user: AuthUser, id: string) {
    const club = await this.prisma.club.findUnique({
      where: { id },
      include: {
        coach: { select: userSummary },
        members: { include: { user: { select: userSummary } }, orderBy: [{ status: 'asc' }, { joinedAt: 'asc' }] },
      },
    });
    if (!club) throw new NotFoundException('Club not found');
    const canSeePending = club.coachId === user.id || hasPermission(user.role, 'clubs:roster');
    const members = canSeePending ? club.members : club.members.filter((m) => m.status === 'ACTIVE');
    return {
      ...club,
      members,
      memberCount: club.members.filter((m) => m.status === 'ACTIVE').length,
      myMembership: club.members.find((m) => m.userId === user.id) ?? null,
    };
  }

  async create(actor: AuthUser, dto: { name: string; sport: string; description?: string; coachId?: string }) {
    if (dto.coachId) {
      const coach = await this.prisma.user.findUnique({ where: { id: dto.coachId }, select: { role: true } });
      if (coach?.role !== 'COACH') throw new ConflictException('coachId must belong to a user with the COACH role');
    }
    return this.prisma.$transaction(async (tx) => {
      const club = await tx.club.create({ data: dto, include: { coach: { select: userSummary } } });
      await this.audit.append(tx, { actorId: actor.id, action: 'club.create', entity: 'Club', entityId: club.id, payload: { ...dto } });
      return { ...club, memberCount: 0, myMembership: null };
    });
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

  /** Approve/reject/promote a member. Activating a casual STUDENT upgrades them to CLUB_MEMBER (representational access). */
  async updateMember(actor: AuthUser, clubId: string, membershipId: string, dto: { status?: MembershipStatus; role?: MembershipRole }) {
    const membership = await this.prisma.clubMembership.findFirst({ where: { id: membershipId, clubId }, include: { club: true, user: { select: { id: true, role: true } } } });
    if (!membership) throw new NotFoundException('Membership not found');
    const isCoach = membership.club.coachId === actor.id;
    if (!isCoach && !hasPermission(actor.role, 'clubs:manage') && !(actor.role === 'SPORT_COORDINATOR')) {
      throw new ForbiddenException('Only this club’s coach or sports administrators can manage the roster');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.clubMembership.update({ where: { id: membershipId }, data: dto, include: { user: { select: userSummary } } });
      if (dto.status === 'ACTIVE' && membership.user.role === 'STUDENT') {
        await tx.user.update({ where: { id: membership.userId }, data: { role: 'CLUB_MEMBER' } });
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
}
