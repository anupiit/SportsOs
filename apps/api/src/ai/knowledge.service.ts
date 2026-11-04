import { Injectable } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { addDays, istMidnight, todayIst } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import type { KnowledgeDoc } from './vector-store';

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const time = (d: Date) => d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
const date = (d: Date) => d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Turns live ERP state into retrieval documents for the assistant. Documents
 * hold operational aggregates only — no student names, emails or locations.
 */
@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  async build(): Promise<KnowledgeDoc[]> {
    const docs: KnowledgeDoc[] = [POLICIES];
    const now = new Date();
    const today = istMidnight(todayIst());
    const tomorrowEnd = addDays(today, 2);

    const facilities = await this.prisma.facility.findMany({
      include: {
        bookings: {
          where: { status: { in: ['APPROVED', 'PENDING'] }, start: { gte: today, lt: tomorrowEnd } },
          select: { start: true, end: true, type: true, status: true },
          orderBy: { start: 'asc' },
        },
      },
    });
    for (const f of facilities) {
      const upcoming = f.bookings.filter((b) => b.end > now);
      docs.push({
        id: `facility-${f.code}`,
        kind: 'facility',
        title: `${f.name} (${f.code})`,
        text: [
          `${f.name} is a ${f.type.toLowerCase().replace('_', ' ')} for ${f.sports.join(', ')}.`,
          `Current status: ${f.status}${f.statusNote ? ` — ${f.statusNote}` : ''}.`,
          `Open ${hhmm(f.openMinute)}–${hhmm(f.closeMinute)} IST in ${f.slotMinutes}-minute slots; capacity ${f.capacity}.`,
          f.requiresApproval ? 'Casual bookings need approval.' : 'Casual bookings are confirmed instantly when the slot is free.',
          upcoming.length
            ? `Booked slots today and tomorrow: ${upcoming.map((b) => `${date(b.start)} ${time(b.start)}–${time(b.end)} (${b.type.toLowerCase().replace('_', ' ')}${b.status === 'PENDING' ? ', pending' : ''})`).join('; ')}.`
            : 'No bookings today or tomorrow — all slots are free.',
        ].join(' '),
      });
    }

    const items = await this.prisma.equipment.findMany({ orderBy: { sport: 'asc' } });
    const bySport = new Map<string, typeof items>();
    items.forEach((i) => bySport.set(i.sport, [...(bySport.get(i.sport) ?? []), i]));
    for (const [sport, list] of bySport) {
      docs.push({
        id: `equipment-${sport.toLowerCase().replace(/\W+/g, '-')}`,
        kind: 'equipment',
        title: `${sport} equipment stock`,
        text: list
          .map((i) => {
            const issued = i.totalQty - i.availableQty - i.damagedQty;
            return `${i.name} (${i.category}): ${i.availableQty} available, ${issued} issued, ${i.damagedQty} damaged of ${i.totalQty}; reorder level ${i.minStock}${i.availableQty <= i.minStock ? ' — LOW STOCK' : ''}${i.location ? `; kept at ${i.location}` : ''}.`;
          })
          .join(' '),
      });
    }

    const clubs = await this.prisma.club.findMany({
      include: { coach: { select: { name: true } }, _count: { select: { members: { where: { status: 'ACTIVE' } } } } },
    });
    docs.push({
      id: 'clubs',
      kind: 'clubs',
      title: 'Sports clubs',
      text: clubs.map((c) => `${c.name} (${c.sport}): ${c._count.members} active members${c.coach ? `, coached by ${c.coach.name}` : ''}.`).join(' '),
    });

    const tournaments = await this.prisma.tournament.findMany({
      // proposals are visible only to their organiser and reviewers, so they never enter the shared index
      where: { status: { in: ['DRAFT', 'ONGOING', 'COMPLETED'] } },
      orderBy: { startDate: 'desc' },
      take: 10,
      include: { teams: true, matches: { where: { status: 'COMPLETED' }, include: { homeTeam: true, awayTeam: true }, orderBy: { scheduledAt: 'desc' }, take: 6 } },
    });
    for (const t of tournaments) {
      const champion = t.teams.find((x) => x.id === t.championId);
      docs.push({
        id: `tournament-${t.id}`,
        kind: 'tournament',
        title: t.name,
        text: [
          `${t.name}: ${t.sport}, ${t.format.toLowerCase().replace('_', ' ')}, status ${t.status}, starting ${date(t.startDate)}.`,
          `Teams: ${t.teams.map((x) => x.name).join(', ') || 'none registered yet'}.`,
          t.matches.length ? `Recent results: ${t.matches.map((m) => `${m.homeTeam?.name} ${m.homeScore}–${m.awayScore} ${m.awayTeam?.name}`).join('; ')}.` : '',
          champion ? `Champion: ${champion.name}.` : '',
        ].join(' '),
      });
    }

    const [kpis, participation, utilization, forecast, wear, integrity, complaints] = await Promise.all([
      this.analytics.overview(),
      this.analytics.participation(8),
      this.analytics.utilization(30),
      this.analytics.forecast(undefined, 7, 56),
      this.analytics.equipment(),
      this.analytics.integrity(30),
      this.prisma.complaint.groupBy({ by: ['category', 'status'], _count: true }),
    ]);
    docs.push(
      {
        id: 'kpi-overview',
        kind: 'analytics',
        title: 'Operational snapshot (today)',
        text: `${kpis.activeUsers} active users. Facilities: ${kpis.facilities.open} open, ${kpis.facilities.maintenance} under maintenance, ${kpis.facilities.closed} closed. ${kpis.bookingsToday} bookings today, ${kpis.pendingApprovals} awaiting approval. ${kpis.attendanceThisWeek} verified check-ins in the last 7 days${kpis.attendanceChangePct === null ? '' : ` (${kpis.attendanceChangePct >= 0 ? '+' : ''}${kpis.attendanceChangePct}% vs the week before)`}. ${kpis.equipmentIssued} equipment units out on loan, ${kpis.overdueIssues} overdue loans, ${kpis.lowStockItems} items at or below reorder level. ${kpis.openComplaints} open complaints. ${kpis.liveTournaments} tournaments in progress. ${kpis.rejectedCheckInsThisWeek} rejected check-in attempts this week.`,
      },
      {
        id: 'participation-trend',
        kind: 'analytics',
        title: 'Weekly participation trend',
        text: participation.map((p) => `Week of ${p.weekStart}: ${p.checkIns} check-ins by ${p.uniqueParticipants} students, ${p.bookings} bookings.`).join(' '),
      },
      {
        id: 'facility-utilization',
        kind: 'analytics',
        title: 'Facility utilisation (last 30 days)',
        text: [...utilization.facilities]
          .sort((a, b) => b.utilizationPct - a.utilizationPct)
          .map((f) => `${f.name}: ${f.utilizationPct}% utilised (${f.bookedHours} of ${f.availableHours} bookable hours).`)
          .join(' ') + ` Busiest hours: ${busiest(utilization.heatmap)}.`,
      },
      {
        id: 'demand-forecast',
        kind: 'analytics',
        title: 'Facility demand forecast (next 7 days)',
        text: `Holt-Winters forecast of total booked hours per day across all facilities (α=${forecast.model.alpha}, β=${forecast.model.beta}, γ=${forecast.model.gamma}, in-sample MAPE ${forecast.model.mape ?? 'n/a'}%): ${forecast.points
          .filter((p) => p.actual === null)
          .map((p) => `${p.date}: ${p.forecast} h (95% interval ${p.lower}–${p.upper})`)
          .join('; ')}.`,
      },
      {
        id: 'equipment-wear',
        kind: 'analytics',
        title: 'Equipment wear and stock-out risk',
        text: wear
          .slice(0, 12)
          .map((w) => `${w.name}: ${w.avgDailyIssues} issued per day, ${w.damageRatePct}% damaged or lost, ${w.daysToStockout === null ? 'no stock-out risk at current wear' : `runs out in about ${w.daysToStockout} days at current wear`}.`)
          .join(' '),
      },
      {
        id: 'attendance-integrity',
        kind: 'analytics',
        title: 'Attendance integrity (last 30 days)',
        text: `${integrity.accepted} accepted check-ins. Rejected: ${Object.entries(integrity.rejected).map(([k, v]) => `${k.toLowerCase().replace(/_/g, ' ')} ${v}`).join(', ')}.`,
      },
      {
        id: 'complaints',
        kind: 'analytics',
        title: 'Complaints by category and status',
        text: complaints.map((c) => `${c.category.toLowerCase()} / ${c.status.toLowerCase().replace('_', ' ')}: ${c._count}`).join('; ') || 'No complaints recorded.',
      },
    );
    return docs;
  }
}

function busiest(heatmap: number[][]) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const cells = heatmap.flatMap((row, d) => row.map((v, h) => ({ v, label: `${days[d]} ${String(h).padStart(2, '0')}:00` })));
  return cells
    .sort((a, b) => b.v - a.v)
    .slice(0, 5)
    .map((c) => `${c.label} (${c.v} h)`)
    .join(', ');
}

const POLICIES: KnowledgeDoc = {
  id: 'policies',
  kind: 'policy',
  title: 'SportsOS rules and how-to',
  text: [
    'Booking rules: a booking lasts at most 4 hours, can be made up to 30 days ahead, must fall within the facility’s opening hours (IST), and a student may hold at most 3 upcoming casual bookings.',
    'Casual bookings at facilities that do not require approval are confirmed instantly; club practice and event bookings are approved by the Sports Officer, General Secretary or operations staff.',
    'Show the booking’s QR gate pass to security; entry opens 15 minutes before the slot.',
    'Verified attendance: the coach opens a session and projects a 6-digit code that changes every 30 seconds. Students check in from the SportsOS app with the code while physically inside the facility’s GPS geofence; fixes worse than 100 m accuracy are rejected, one device per student per session.',
    'Equipment: the equipment manager issues items by scanning their QR label; default loan is 4 hours; damaged or missing items are recorded on return. Overdue loans trigger reminders.',
    'Complaints about facilities, equipment, staff or bookings can be raised from the Complaints page and are tracked to resolution.',
  ].join(' '),
};
