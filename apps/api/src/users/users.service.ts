import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { userFull, userSummary } from '../common/selects';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(q: string | undefined, role: Role | undefined) {
    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
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
    return this.prisma.user.findMany({ where, select: userFull, orderBy: { name: 'asc' }, take: 200 });
  }

  async update(actor: AuthUser, id: string, dto: { role?: Role; isActive?: boolean; hostel?: string; phone?: string }) {
    if (actor.id === id && (dto.role || dto.isActive === false)) {
      throw new BadRequestException('You cannot change your own role or deactivate yourself');
    }
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: { role: true } });
    // only the system administrator may grant or revoke ADMIN
    if ((dto.role === 'ADMIN' || target.role === 'ADMIN') && actor.role !== 'ADMIN') {
      throw new ForbiddenException('Only a system administrator can manage administrator accounts');
    }
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: dto, select: userFull });
      await this.audit.append(tx, {
        actorId: actor.id,
        action: 'user.update',
        entity: 'User',
        entityId: id,
        payload: { ...dto, previousRole: target.role },
      });
      return user;
    });
  }

  async profile(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: userFull });
    const [checkIns, bookings, achievements, memberships, tournaments] = await Promise.all([
      this.prisma.attendanceRecord.count({ where: { userId: id } }),
      this.prisma.booking.count({ where: { userId: id, status: { in: ['APPROVED', 'COMPLETED'] } } }),
      this.prisma.achievement.findMany({ where: { userId: id }, orderBy: { date: 'desc' }, include: { user: { select: userSummary } } }),
      this.prisma.clubMembership.findMany({
        where: { userId: id, status: 'ACTIVE' },
        include: { club: { include: { coach: { select: userSummary }, _count: { select: { members: { where: { status: 'ACTIVE' } } } } } } },
      }),
      // tournaments organised, plus those the student's hostel entered
      this.prisma.tournament.count({
        where: { OR: [{ organizerId: id }, ...(user.hostel ? [{ teams: { some: { hostel: user.hostel } } }] : [])] },
      }),
    ]);
    return {
      user,
      stats: { checkIns, bookings, tournaments },
      achievements: achievements.map((a) => ({ ...a, verified: !!a.verifiedById })),
      clubs: memberships.map(({ club }) => {
        const { _count, ...rest } = club;
        return { ...rest, memberCount: _count.members };
      }),
    };
  }
}
