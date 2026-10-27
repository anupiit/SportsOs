import { Injectable } from '@nestjs/common';
import type { AttemptOutcome } from '@prisma/client';
import type {
  EquipmentInsight,
  ForecastReport,
  IntegrityReport,
  OverviewKpis,
  ParticipationPoint,
  UtilizationReport,
} from '@sportsos/shared';
import { addDays, IST_OFFSET_MIN, istDateString, istMidnight, istWeekday, todayIst } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { fitHoltWinters, forecastHoltWinters } from './forecast';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const IST_OFFSET_MS = IST_OFFSET_MIN * 60_000;
const round2 = (x: number) => Math.round(x * 100) / 100;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<OverviewKpis> {
    const now = new Date();
    const today = istMidnight(todayIst());
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const twoWeeksAgo = new Date(now.getTime() - 14 * DAY);
    const [
      activeUsers,
      facilityStatus,
      bookingsToday,
      pendingApprovals,
      attendanceThisWeek,
      attendanceLastWeek,
      issued,
      lowStockItems,
      overdueIssues,
      openComplaints,
      liveTournaments,
      rejectedCheckInsThisWeek,
    ] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.facility.groupBy({ by: ['status'], _count: true }),
      this.prisma.booking.count({ where: { status: { in: ['PENDING', 'APPROVED', 'COMPLETED'] }, start: { gte: today, lt: addDays(today, 1) } } }),
      this.prisma.booking.count({ where: { status: 'PENDING', end: { gt: now } } }),
      this.prisma.attendanceRecord.count({ where: { checkedInAt: { gte: weekAgo } } }),
      this.prisma.attendanceRecord.count({ where: { checkedInAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      this.prisma.equipmentIssue.aggregate({ where: { status: { in: ['ISSUED', 'OVERDUE'] } }, _sum: { quantity: true } }),
      this.prisma.equipment.count({ where: { availableQty: { lte: this.prisma.equipment.fields.minStock } } }),
      this.prisma.equipmentIssue.count({ where: { OR: [{ status: 'OVERDUE' }, { status: 'ISSUED', dueAt: { lt: now } }] } }),
      this.prisma.complaint.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.tournament.count({ where: { status: 'ONGOING' } }),
      this.prisma.attendanceAttempt.count({ where: { createdAt: { gte: weekAgo }, outcome: { not: 'ACCEPTED' } } }),
    ]);
    const byStatus = Object.fromEntries(facilityStatus.map((f) => [f.status, f._count])) as Record<string, number>;
    return {
      activeUsers,
      facilities: {
        total: facilityStatus.reduce((a, f) => a + f._count, 0),
        open: byStatus.OPEN ?? 0,
        maintenance: byStatus.MAINTENANCE ?? 0,
        closed: byStatus.CLOSED ?? 0,
      },
      bookingsToday,
      pendingApprovals,
      attendanceThisWeek,
      attendanceChangePct: attendanceLastWeek ? round2(((attendanceThisWeek - attendanceLastWeek) / attendanceLastWeek) * 100) : null,
      equipmentIssued: issued._sum.quantity ?? 0,
      lowStockItems,
      overdueIssues,
      openComplaints,
      liveTournaments,
      rejectedCheckInsThisWeek,
    };
  }

  /** Weekly check-ins, distinct participants and bookings, weeks starting Monday (IST). */
  async participation(weeks: number): Promise<ParticipationPoint[]> {
    const thisMonday = addDays(istMidnight(todayIst()), -istWeekday(new Date()));
    const from = addDays(thisMonday, -7 * (weeks - 1));
    const [records, bookings] = await Promise.all([
      this.prisma.attendanceRecord.findMany({ where: { checkedInAt: { gte: from } }, select: { checkedInAt: true, userId: true } }),
      this.prisma.booking.findMany({ where: { start: { gte: from, lt: addDays(thisMonday, 7) }, status: { in: ['APPROVED', 'COMPLETED'] } }, select: { start: true } }),
    ]);
    const buckets = Array.from({ length: weeks }, (_, i) => ({ start: addDays(from, 7 * i), checkIns: 0, users: new Set<string>(), bookings: 0 }));
    const idx = (d: Date) => Math.floor((d.getTime() - from.getTime()) / (7 * DAY));
    for (const r of records) {
      const b = buckets[idx(r.checkedInAt)];
      if (b) {
        b.checkIns++;
        b.users.add(r.userId);
      }
    }
    for (const bk of bookings) {
      const b = buckets[idx(bk.start)];
      if (b) b.bookings++;
    }
    return buckets.map((b) => ({ weekStart: istDateString(b.start), checkIns: b.checkIns, uniqueParticipants: b.users.size, bookings: b.bookings }));
  }

  /** Booked vs. bookable hours per facility, and a weekday × hour heatmap of booked hours (IST). */
  async utilization(days: number): Promise<UtilizationReport> {
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY);
    const [facilities, bookings] = await Promise.all([
      this.prisma.facility.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.booking.findMany({
        where: { status: { in: ['APPROVED', 'COMPLETED'] }, start: { lt: to }, end: { gt: from } },
        select: { facilityId: true, start: true, end: true },
      }),
    ]);
    const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    const booked = new Map<string, number>();
    for (const b of bookings) {
      const s = Math.max(b.start.getTime(), from.getTime());
      const e = Math.min(b.end.getTime(), to.getTime());
      if (e <= s) continue;
      booked.set(b.facilityId, (booked.get(b.facilityId) ?? 0) + (e - s) / HOUR);
      // split the booking across IST clock-hour cells
      for (let t = s; t < e; ) {
        const local = t + IST_OFFSET_MS;
        const cellEnd = Math.min(e, t + HOUR - (local % HOUR));
        heatmap[istWeekday(new Date(t))][new Date(local).getUTCHours()] += (cellEnd - t) / HOUR;
        t = cellEnd;
      }
    }
    return {
      days,
      facilities: facilities.map((f) => {
        const availableHours = (days * (f.closeMinute - f.openMinute)) / 60;
        const bookedHours = booked.get(f.id) ?? 0;
        return {
          facilityId: f.id,
          name: f.name,
          bookedHours: round2(bookedHours),
          availableHours: round2(availableHours),
          utilizationPct: availableHours ? round2((bookedHours / availableHours) * 100) : 0,
        };
      }),
      heatmap: heatmap.map((row) => row.map(round2)),
    };
  }

  /** Daily booked-hours demand forecast (Holt-Winters, weekly season) with 95% intervals. */
  async forecast(facilityId: string | undefined, horizon: number, history: number): Promise<ForecastReport> {
    const today = istMidnight(todayIst());
    const from = addDays(today, -history);
    const bookings = await this.prisma.booking.findMany({
      where: { status: { in: ['APPROVED', 'COMPLETED'] }, start: { gte: from, lt: today }, ...(facilityId ? { facilityId } : {}) },
      select: { start: true, end: true },
    });
    const series = new Array<number>(history).fill(0);
    for (const b of bookings) {
      const i = Math.floor((b.start.getTime() - from.getTime()) / DAY);
      if (i >= 0 && i < history) series[i] += (b.end.getTime() - b.start.getTime()) / HOUR;
    }
    const fit = fitHoltWinters(series, 7);
    const ahead = forecastHoltWinters(fit, horizon);
    const points = [
      ...series.map((actual, i) => ({
        date: istDateString(addDays(from, i)),
        actual: round2(actual),
        forecast: fit.fitted[i] === null ? null : round2(Math.max(0, fit.fitted[i]!)),
        lower: null,
        upper: null,
      })),
      ...ahead.map((s, h) => ({
        date: istDateString(addDays(today, h)),
        actual: null,
        forecast: round2(s.value),
        lower: round2(s.lower),
        upper: round2(s.upper),
      })),
    ];
    return {
      facilityId: facilityId ?? null,
      metric: 'booked_hours',
      model: {
        name: 'holt-winters-additive',
        alpha: fit.alpha,
        beta: fit.beta,
        gamma: fit.gamma,
        seasonLength: fit.seasonLength,
        mape: fit.mape === null ? null : round2(fit.mape),
        rmse: round2(fit.rmse),
      },
      points,
    };
  }

  /**
   * Equipment wear: issue rate over 30 days, damage rate over 90 days, and days
   * until the store runs dry at the current rate of damage + loss.
   */
  async equipment(): Promise<EquipmentInsight[]> {
    const now = Date.now();
    const [items, recent, returns] = await Promise.all([
      this.prisma.equipment.findMany(),
      this.prisma.equipmentIssue.groupBy({ by: ['equipmentId'], where: { issuedAt: { gte: new Date(now - 30 * DAY) } }, _sum: { quantity: true } }),
      this.prisma.equipmentIssue.groupBy({
        by: ['equipmentId'],
        where: { returnedAt: { gte: new Date(now - 90 * DAY) } },
        _sum: { quantity: true, returnedQty: true, damagedQty: true },
      }),
    ]);
    return items
      .map((item) => {
        const issued30 = recent.find((r) => r.equipmentId === item.id)?._sum.quantity ?? 0;
        const r = returns.find((x) => x.equipmentId === item.id)?._sum;
        const lent = r?.quantity ?? 0;
        const damaged = r?.damagedQty ?? 0;
        const lost = lent - (r?.returnedQty ?? 0);
        const lossPerDay = (damaged + lost) / 90;
        return {
          equipmentId: item.id,
          name: item.name,
          availableQty: item.availableQty,
          avgDailyIssues: round2(issued30 / 30),
          damageRatePct: lent ? round2(((damaged + lost) / lent) * 100) : 0,
          daysToStockout: lossPerDay > 0 ? Math.floor(item.availableQty / lossPerDay) : null,
        };
      })
      .sort((a, b) => (a.daysToStockout ?? Infinity) - (b.daysToStockout ?? Infinity) || b.damageRatePct - a.damageRatePct);
  }

  async integrity(days: number): Promise<IntegrityReport> {
    const rows = await this.prisma.attendanceAttempt.groupBy({
      by: ['outcome'],
      where: { createdAt: { gte: new Date(Date.now() - days * DAY) } },
      _count: true,
    });
    const count = (o: AttemptOutcome) => rows.find((r) => r.outcome === o)?._count ?? 0;
    return {
      days,
      accepted: count('ACCEPTED'),
      rejected: {
        BAD_OTP: count('BAD_OTP'),
        OUT_OF_GEOFENCE: count('OUT_OF_GEOFENCE'),
        LOW_ACCURACY: count('LOW_ACCURACY'),
        DUPLICATE: count('DUPLICATE'),
        DEVICE_REUSED: count('DEVICE_REUSED'),
        SESSION_CLOSED: count('SESSION_CLOSED'),
        NOT_ELIGIBLE: count('NOT_ELIGIBLE'),
      },
    };
  }
}
