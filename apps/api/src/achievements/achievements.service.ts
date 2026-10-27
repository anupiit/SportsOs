import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Achievement } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { userSummary } from '../common/selects';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAchievementDto } from './achievements.controller';

const shape = <T extends Achievement>(a: T) => ({ ...a, verified: !!a.verifiedById });

@Injectable()
export class AchievementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId?: string, verified?: boolean) {
    const rows = await this.prisma.achievement.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(verified === undefined ? {} : verified ? { verifiedById: { not: null } } : { verifiedById: null }),
      },
      include: { user: { select: userSummary } },
      orderBy: { date: 'desc' },
      take: 300,
    });
    return rows.map(shape);
  }

  async create(user: AuthUser, dto: CreateAchievementDto) {
    if (new Date(dto.date) > new Date()) throw new BadRequestException('Achievement date cannot be in the future');
    const a = await this.prisma.achievement.create({ data: { ...dto, date: new Date(dto.date), userId: user.id }, include: { user: { select: userSummary } } });
    return shape(a);
  }

  async verify(actor: AuthUser, id: string) {
    const a = await this.prisma.achievement.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Achievement not found');
    if (a.userId === actor.id) throw new ConflictException('You cannot verify your own achievement');
    if (a.verifiedById) throw new ConflictException('Already verified');
    const updated = await this.prisma.$transaction(async (tx) => {
      const v = await tx.achievement.update({ where: { id }, data: { verifiedById: actor.id }, include: { user: { select: userSummary } } });
      await this.audit.append(tx, { actorId: actor.id, action: 'achievement.verify', entity: 'Achievement', entityId: id });
      return v;
    });
    await this.notifications.notifyUsers([a.userId], { title: 'Achievement verified', body: a.title, type: 'INFO', link: '/profile' });
    return shape(updated);
  }
}
