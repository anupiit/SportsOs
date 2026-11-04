'use client';

import type {
  AttendanceSession,
  Booking,
  Facility,
  InventoryAlerts,
  Notification,
  OverviewKpis,
} from '@sportsos/shared';
import { roleLabel } from '@sportsos/shared';
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  CalendarPlus,
  ClipboardCheck,
  MapPin,
  MessageSquareWarning,
  Package,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth, useUser } from '@/components/auth';
import { ApprovalQueue, PassModal } from '@/components/bookings';
import { WorkQueue } from '@/components/role-dashboard';
import { BookingStatusBadge, FacilityStatusBadge, SessionBadge } from '@/components/status';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton, SkeletonRows, StatTile } from '@/components/ui';
import { fmtDateTime, fmtNumber, fmtRelative, fmtTime, fmtTimeRange, fmtWeekday, minutesToHHMM } from '@/lib/format';
import { useApi } from '@/lib/hooks';

const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' });
const dayOfMonth = (iso: string) => dayFmt.format(new Date(iso));

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function KpiRow() {
  const { data, error, isLoading, mutate } = useApi<OverviewKpis>('/analytics/overview', undefined, { refreshInterval: 60000 });
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px]" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Bookings today" value={fmtNumber(data.bookingsToday)} icon={<CalendarCheck className="size-4" />} href="/bookings" />
      <StatTile
        label="Pending approvals"
        value={fmtNumber(data.pendingApprovals)}
        icon={<ClipboardCheck className="size-4" />}
        tone={data.pendingApprovals > 0 ? 'warn' : 'neutral'}
        href="/bookings"
      />
      <StatTile
        label="Check-ins this week"
        value={fmtNumber(data.attendanceThisWeek)}
        icon={<ShieldCheck className="size-4" />}
        delta={{ value: data.attendanceChangePct, goodWhenUp: true, period: 'vs last week' }}
      />
      <StatTile
        label="Facilities open"
        value={`${data.facilities.open}/${data.facilities.total}`}
        sub={
          data.facilities.maintenance + data.facilities.closed > 0
            ? `${data.facilities.maintenance} maintenance · ${data.facilities.closed} closed`
            : 'All operational'
        }
        icon={<MapPin className="size-4" />}
        href="/facilities"
      />
      <StatTile
        label="Equipment out"
        value={fmtNumber(data.equipmentIssued)}
        sub={`${data.lowStockItems} low stock · ${data.overdueIssues} overdue`}
        icon={<Package className="size-4" />}
        tone={data.overdueIssues > 0 || data.lowStockItems > 0 ? 'warn' : 'neutral'}
        href="/inventory"
      />
      <StatTile
        label="Rejected check-ins"
        value={fmtNumber(data.rejectedCheckInsThisWeek)}
        sub="this week · proxy attempts blocked"
        icon={<ShieldAlert className="size-4" />}
        href="/analytics"
      />
      <StatTile
        label="Open complaints"
        value={fmtNumber(data.openComplaints)}
        icon={<MessageSquareWarning className="size-4" />}
        tone={data.openComplaints > 0 ? 'warn' : 'neutral'}
        href="/complaints"
      />
      <StatTile label="Live tournaments" value={fmtNumber(data.liveTournaments)} icon={<Trophy className="size-4" />} href="/events" />
    </div>
  );
}

function FacilityBoard() {
  const { data, error, isLoading } = useApi<Facility[]>('/facilities', undefined, { refreshInterval: 60000 });
  return (
    <Card>
      <CardHeader
        title="Facility status"
        description="Live ground and court status, updated by ground staff"
        icon={<MapPin className="size-4" />}
        actions={
          <Link href="/facilities" className="text-xs font-medium text-accent-ink hover:underline">
            All facilities
          </Link>
        }
      />
      <CardBody>
        {isLoading ? (
          <SkeletonRows rows={4} />
        ) : error ? (
          <p className="text-sm text-danger-ink">{error.message}</p>
        ) : !data?.length ? (
          <EmptyState title="No facilities yet" />
        ) : (
          <ul className="divide-y divide-border">
            {data.slice(0, 8).map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/facilities/${f.id}`} className="text-sm font-medium text-text hover:text-accent-ink">
                    {f.name}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {f.statusNote ? f.statusNote : `${minutesToHHMM(f.openMinute)}–${minutesToHHMM(f.closeMinute)} · ${f.sports.join(', ')}`}
                  </p>
                </div>
                <FacilityStatusBadge status={f.status} />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function MyUpcomingBookings() {
  const [fromIso] = useState(() => new Date().toISOString());
  const { data, error, isLoading } = useApi<Booking[]>('/bookings', { scope: 'mine', from: fromIso });
  const [pass, setPass] = useState<Booking | null>(null);
  const upcoming = (data ?? [])
    .filter((b) => ['PENDING', 'APPROVED'].includes(b.status) && new Date(b.end).getTime() > Date.now())
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 5);
  return (
    <Card>
      <CardHeader
        title="My upcoming bookings"
        icon={<CalendarCheck className="size-4" />}
        actions={
          <Link href="/facilities">
            <Button size="sm" variant="accent" icon={<CalendarPlus className="size-3.5" />}>
              Book a slot
            </Button>
          </Link>
        }
      />
      <CardBody>
        {isLoading ? (
          <SkeletonRows rows={3} />
        ) : error ? (
          <p className="text-sm text-danger-ink">{error.message}</p>
        ) : !upcoming.length ? (
          <EmptyState
            icon={<CalendarCheck className="size-5" />}
            title="Nothing booked"
            description="Reserve a court or ground — casual slots on open facilities are approved instantly."
          />
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2.5">
                <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-surface-2 py-1 text-center">
                  <span className="text-[10px] font-semibold text-muted uppercase">{fmtWeekday(b.start).split(',')[0]}</span>
                  <span className="text-lg leading-tight font-bold text-text">{dayOfMonth(b.start)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{b.facility?.name ?? 'Facility'}</p>
                  <p className="truncate text-xs text-muted">
                    {fmtWeekday(b.start)} · {fmtTimeRange(b.start, b.end)} · {b.purpose}
                  </p>
                </div>
                <BookingStatusBadge status={b.status} />
                {b.status === 'APPROVED' && (
                  <Button size="sm" variant="ghost" onClick={() => setPass(b)}>
                    Pass
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <PassModal booking={pass} onClose={() => setPass(null)} />
    </Card>
  );
}

function ActiveSessions() {
  const { can } = useAuth();
  const { data, error, isLoading } = useApi<AttendanceSession[]>('/attendance/sessions', { status: 'ACTIVE' }, { refreshInterval: 20000 });
  return (
    <Card>
      <CardHeader
        title={can('attendance.manage') ? 'My live sessions' : 'Sessions open for check-in'}
        description="OTP + GPS verified attendance"
        icon={<ShieldCheck className="size-4" />}
        actions={
          <Link href="/attendance" className="text-xs font-medium text-accent-ink hover:underline">
            Open attendance
          </Link>
        }
      />
      <CardBody>
        {isLoading ? (
          <SkeletonRows rows={2} />
        ) : error ? (
          <p className="text-sm text-danger-ink">{error.message}</p>
        ) : !data?.length ? (
          <EmptyState title="No live sessions" description="When a coach starts a session, it appears here." />
        ) : (
          <ul className="divide-y divide-border">
            {data.slice(0, 5).map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{s.title}</p>
                  <p className="truncate text-xs text-muted">
                    {s.facility?.name ?? 'Facility'}
                    {s.club ? ` · ${s.club.name}` : ''} · until {fmtTime(s.endsAt)} · {s.attendeeCount} checked in
                  </p>
                </div>
                <SessionBadge status={s.status} />
                <Link href={`/attendance?session=${s.id}`}>
                  <Button size="sm" variant="secondary">
                    {can('attendance.manage') ? 'Open' : 'Check in'}
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function InventoryAlertCard() {
  const { data, error, isLoading } = useApi<InventoryAlerts>('/inventory/alerts', undefined, { refreshInterval: 60000 });
  const total = (data?.lowStock.length ?? 0) + (data?.overdue.length ?? 0);
  return (
    <Card>
      <CardHeader
        title="Inventory alerts"
        icon={<AlertTriangle className="size-4" />}
        actions={total > 0 ? <Badge tone="terracotta">{total}</Badge> : undefined}
      />
      <CardBody>
        {isLoading ? (
          <SkeletonRows rows={2} />
        ) : error ? (
          <p className="text-sm text-danger-ink">{error.message}</p>
        ) : !total ? (
          <EmptyState title="Stock levels healthy" description="No low-stock items or overdue returns." />
        ) : (
          <ul className="space-y-2 text-sm">
            {data!.lowStock.slice(0, 4).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-text">{i.name}</span>
                <Badge tone="amber" icon={<AlertTriangle className="size-3" />}>
                  {i.availableQty} left · min {i.minStock}
                </Badge>
              </li>
            ))}
            {data!.overdue.slice(0, 4).map((iss) => (
              <li key={iss.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-text">
                  {iss.equipment?.name ?? 'Item'} — {iss.borrower?.name ?? 'borrower'}
                </span>
                <Badge tone="red">due {fmtRelative(iss.dueAt)}</Badge>
              </li>
            ))}
          </ul>
        )}
        <Link href="/inventory" className="mt-3 inline-block text-xs font-medium text-accent-ink hover:underline">
          Go to inventory
        </Link>
      </CardBody>
    </Card>
  );
}

function RecentNotifications() {
  const { data, isLoading } = useApi<Notification[]>('/notifications');
  const items = (data ?? []).slice(0, 5);
  return (
    <Card>
      <CardHeader
        title="Notifications"
        icon={<Bell className="size-4" />}
        actions={
          <Link href="/notifications" className="text-xs font-medium text-accent-ink hover:underline">
            View all
          </Link>
        }
      />
      <CardBody>
        {isLoading ? (
          <SkeletonRows rows={3} />
        ) : !items.length ? (
          <EmptyState title="You're all caught up" />
        ) : (
          <ul className="space-y-3">
            {items.map((n) => (
              <li key={n.id} className="flex gap-2.5">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-border-strong' : 'bg-accent'}`} aria-hidden />
                <div className="min-w-0">
                  <p className={`text-sm ${n.readAt ? 'text-text-2' : 'font-medium text-text'}`}>{n.title}</p>
                  <p className="line-clamp-2 text-xs text-muted">{n.body}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{fmtRelative(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function QuickActions({ narrow }: { narrow?: boolean }) {
  const { can } = useAuth();
  // only actions the current role can actually perform
  const actions = [
    { href: '/facilities', label: 'Book a facility', icon: CalendarPlus, ok: can('booking.create') },
    { href: '/attendance', label: can('attendance.manage') ? 'Run attendance' : 'Mark attendance', icon: ShieldCheck, ok: can('attendance.mark') || can('attendance.manage') },
    { href: '/complaints', label: 'Raise a complaint', icon: MessageSquareWarning, ok: can('complaint.create') },
    { href: '/assistant', label: 'Ask SportsOS AI', icon: Sparkles, ok: can('ai.use') },
  ].filter((a) => a.ok);
  return (
    <div className={narrow ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-2 sm:grid-cols-4'}>
      {actions.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="card flex items-center gap-2.5 px-3.5 py-3 text-sm font-medium text-text transition-colors hover:border-accent"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
            <Icon className="size-4" />
          </span>
          {label}
        </Link>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const user = useUser();
  const { can, activeRole, heldRoles } = useAuth();
  // personal accounts get a first name; office accounts ("Sports Officer (PESO)") keep their full title
  const plainName = user.name.replace(/^\[DEMO\]\s*/, '');
  const firstName = user.admissionNo && !user.isDemo ? plainName.split(' ')[0] : plainName;
  const isExecutive = can('analytics.view');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wider text-accent-ink uppercase">
            {activeRole ? roleLabel(activeRole) : heldRoles.map(roleLabel).join(' · ') || roleLabel(user.role)}
            {user.isDemo && <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-[10px] text-warn-ink">DEMO DATA</span>}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-text">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-text-2">{fmtDateTime(new Date())} · IST</p>
        </div>
      </div>

      {isExecutive ? <KpiRow /> : <QuickActions />}

      <WorkQueue />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {can('booking.approve') && (
            <Card>
              <CardHeader
                title="Pending approvals"
                description="Club, event and approval-required bookings awaiting a decision"
                icon={<ClipboardCheck className="size-4" />}
                actions={
                  <Link href="/bookings" className="text-xs font-medium text-accent-ink hover:underline">
                    Open approvals
                  </Link>
                }
              />
              <CardBody>
                <ApprovalQueue limit={5} compact />
              </CardBody>
            </Card>
          )}
          <MyUpcomingBookings />
          <FacilityBoard />
        </div>
        <div className="space-y-6">
          <ActiveSessions />
          {(can('inventory.issue') || can('inventory.audit')) && <InventoryAlertCard />}
          <RecentNotifications />
          {isExecutive && <QuickActions narrow />}
        </div>
      </div>
    </div>
  );
}
