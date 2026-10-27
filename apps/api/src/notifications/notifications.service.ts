import { Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationType, Role } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';

export interface NotificationInput {
  title: string;
  body: string;
  type?: NotificationType;
  link?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyUsers(userIds: string[], n: NotificationInput, db: Tx = this.prisma) {
    const unique = [...new Set(userIds)];
    if (!unique.length) return 0;
    const { count } = await db.notification.createMany({
      data: unique.map((userId) => ({ userId, title: n.title, body: n.body, type: n.type ?? 'INFO', link: n.link })),
    });
    return count;
  }

  /** Notify every active user holding one of `roles` (all active users when `roles` is empty). */
  async notifyRoles(roles: Role[], n: NotificationInput, db: Tx = this.prisma) {
    const users = await db.user.findMany({
      where: { isActive: true, ...(roles.length ? { role: { in: roles } } : {}) },
      select: { id: true },
    });
    return this.notifyUsers(users.map((u) => u.id), n, db);
  }

  list(userId: string) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async unreadCount(userId: string) {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!n) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id }, data: { readAt: n.readAt ?? new Date() } });
  }

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: count };
  }
}
