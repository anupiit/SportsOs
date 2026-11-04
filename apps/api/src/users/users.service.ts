import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import type { AuthUser } from '../common/auth-user';
import { userDirectory, userFull, userSummary } from '../common/selects';
import { PrismaService } from '../prisma/prisma.service';
import { can, holdsRole } from '../rbac/access';
import type { CreateUserDto, UpdateUserDto } from './users.controller';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(viewer: AuthUser, q: string | undefined, role: Role | undefined) {
    const where: Prisma.UserWhereInput = {
      // filter by any role held, not just the display role
      ...(role ? { roleAssignments: { some: { role, status: 'ACTIVE' } } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { admissionNo: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const select = can(viewer, 'user.update') ? userFull : userDirectory;
    return this.prisma.user.findMany({ where, select, orderBy: { name: 'asc' }, take: 200 });
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    const email = dto.email.toLowerCase();
    const admissionNo = dto.admissionNo?.toUpperCase();
    const clash = await this.prisma.user.findFirst({ where: { OR: [{ email }, ...(admissionNo ? [{ admissionNo }] : [])] }, select: { id: true } });
    if (clash) throw new ConflictException('An account with this email or admission number already exists');
    const passwordHash = await bcrypt.hash(dto.temporaryPassword, BCRYPT_ROUNDS);
    return this.prisma.$transaction(async (tx) => {
      // new accounts start as casual students; staff roles are granted through the assignment workflow
      const user = await tx.user.create({
        data: {
          name: dto.name.trim(),
          email,
          admissionNo,
          hostel: dto.hostel,
          phone: dto.phone,
          passwordHash,
          role: 'STUDENT',
          roleAssignments: { create: { role: 'STUDENT', reason: 'Account created by administrator', requestedById: actor.id, decidedById: actor.id, decidedAt: new Date() } },
        },
        select: userFull,
      });
      await this.audit.append(tx, { actorId: actor.id, action: 'user.create', entity: 'User', entityId: user.id, payload: { email, admissionNo: admissionNo ?? null } });
      return user;
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const self = actor.id === id;
    if (dto.isActive !== undefined) {
      if (!can(actor, 'user.deactivate')) throw new ForbiddenException('Requires permission: user.deactivate');
      if (self) throw new BadRequestException('You cannot deactivate yourself');
    }
    const profileFields = dto.hostel !== undefined || dto.phone !== undefined || dto.name !== undefined;
    if (profileFields && !self && !can(actor, 'user.update')) throw new ForbiddenException('Requires permission: user.update');
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, isActive: true, roleAssignments: { where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } } },
    });
    if (!target) throw new NotFoundException('User not found');
    const targetIsAdmin = target.roleAssignments.length > 0;
    if (targetIsAdmin && !self && !holdsRole(actor, 'ADMIN')) throw new ForbiddenException('Only a System Administrator can manage administrator accounts');

    return this.prisma.$transaction(async (tx) => {
      if (dto.isActive === false && targetIsAdmin) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rbac:admins'))`;
        const others = await tx.roleAssignment.count({ where: { role: 'ADMIN', status: 'ACTIVE', userId: { not: id }, user: { isActive: true } } });
        if (!others) throw new ConflictException('Cannot deactivate the last active System Administrator');
      }
      const user = await tx.user.update({ where: { id }, data: dto, select: userFull });
      await this.audit.append(tx, {
        actorId: actor.id,
        action: dto.isActive === undefined ? 'user.update' : dto.isActive ? 'user.reactivate' : 'user.deactivate',
        entity: 'User',
        entityId: id,
        // contact details are not copied into the permanent ledger
        payload: { fields: Object.keys(dto), isActive: dto.isActive ?? null },
      });
      return user;
    });
  }

  /**
   * Profiles: yourself; anyone with user.view; or a coach / coordinator whose
   * club the person is an active member of. Phone numbers only for yourself or user.update.
   */
  async profile(viewer: AuthUser, id: string) {
    const self = viewer.id === id;
    if (!self && !can(viewer, 'user.view')) {
      const shared = viewer.coachedClubIds.length
        ? await this.prisma.clubMembership.count({ where: { userId: id, status: 'ACTIVE', clubId: { in: viewer.coachedClubIds } } })
        : 0;
      if (!shared) throw new ForbiddenException('You can only view your own profile or those of players in clubs you coach');
    }
    const select = self || can(viewer, 'user.update') ? userFull : userDirectory;
    const user = await this.prisma.user.findUnique({ where: { id }, select });
    if (!user) throw new NotFoundException('User not found');
    const [checkIns, bookings, achievements, memberships, tournaments, roles] = await Promise.all([
      this.prisma.attendanceRecord.count({ where: { userId: id } }),
      this.prisma.booking.count({ where: { userId: id, status: { in: ['APPROVED', 'COMPLETED'] } } }),
      this.prisma.achievement.findMany({ where: { userId: id }, orderBy: { date: 'desc' }, include: { user: { select: userSummary } } }),
      this.prisma.clubMembership.findMany({
        where: { userId: id, status: 'ACTIVE' },
        include: { club: { include: { coach: { select: userSummary }, _count: { select: { members: { where: { status: 'ACTIVE' } } } } } } },
      }),
      this.prisma.tournament.count({
        where: { OR: [{ organizerId: id }, { teams: { some: { members: { some: { userId: id } } } } }] },
      }),
      this.prisma.roleAssignment.findMany({ where: { userId: id, status: 'ACTIVE' }, select: { role: true, scopeType: true, scopeId: true, validUntil: true } }),
    ]);
    return {
      user,
      roles,
      stats: { checkIns, bookings, tournaments },
      achievements: achievements.map((a) => ({ ...a, verified: !!a.verifiedById })),
      clubs: memberships.map(({ club }) => {
        const { _count, ...rest } = club;
        return { ...rest, memberCount: _count.members };
      }),
    };
  }
}
