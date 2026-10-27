import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** Housekeeping that keeps records truthful without anyone having to remember it. */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async closeExpiredSessions() {
    const { count } = await this.prisma.attendanceSession.updateMany({ where: { status: 'ACTIVE', endsAt: { lte: new Date() } }, data: { status: 'CLOSED' } });
    if (count) this.logger.log(`Closed ${count} expired attendance sessions`);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async completePastBookings() {
    const now = new Date();
    const { count } = await this.prisma.booking.updateMany({ where: { status: 'APPROVED', end: { lte: now } }, data: { status: 'COMPLETED' } });
    // requests nobody acted on before the slot started can no longer be honoured
    const stale = await this.prisma.booking.findMany({ where: { status: 'PENDING', start: { lte: now } }, include: { facility: { select: { name: true } } } });
    if (stale.length) {
      await this.prisma.booking.updateMany({ where: { id: { in: stale.map((b) => b.id) } }, data: { status: 'REJECTED', rejectionReason: 'Not reviewed before the slot started' } });
      for (const b of stale) {
        await this.notifications.notifyUsers([b.userId], { title: 'Booking request lapsed', body: `${b.facility.name}: the request was not reviewed in time.`, type: 'APPROVAL', link: '/bookings' });
      }
    }
    if (count || stale.length) this.logger.log(`Completed ${count} bookings, lapsed ${stale.length} unreviewed requests`);
  }

  @Cron('0 */15 * * * *')
  async flagOverdueLoans() {
    const n = await this.inventory.flagOverdue();
    if (n) this.logger.log(`Flagged ${n} overdue equipment loans`);
  }

  /** 07:00 IST daily: remind people of today's bookings. */
  @Cron('0 30 1 * * *')
  async morningReminders() {
    const start = new Date();
    const end = new Date(start.getTime() + 16 * 3_600_000);
    const bookings = await this.prisma.booking.findMany({ where: { status: 'APPROVED', start: { gte: start, lt: end } }, include: { facility: { select: { name: true } } } });
    for (const b of bookings) {
      await this.notifications.notifyUsers([b.userId], {
        title: `Today: ${b.facility.name}`,
        body: `Your slot starts at ${b.start.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} IST. Keep your gate pass ready.`,
        type: 'REMINDER',
        link: '/bookings',
      });
    }
  }
}
