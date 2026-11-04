'use client';

import type { Announcement, Booking, Complaint, EquipmentRequest, InstitutionalRecord, OperationalTask, RoleAssignment, Tournament } from '@sportsos/shared';
import { roleLabel } from '@sportsos/shared';
import { ArrowUpCircle, ClipboardList, DatabaseZap, DoorOpen, KeyRound, Megaphone, PackageSearch, Trophy, Users, Wallet, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '@/components/auth';
import { Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui';
import { fmtRelative, fmtTimeRange } from '@/lib/format';
import { useApi } from '@/lib/hooks';

/**
 * Role-specific work queue. Each card appears only when the active role holds
 * the permission behind it, and every number comes from the API — nothing is
 * estimated or hard-coded.
 */
export function WorkQueue() {
  const { can, roles } = useAuth();
  const hostels = roles.filter((r) => r.role === 'HOSTEL_SECRETARY' && r.scopeId).map((r) => r.scopeId);
  const cards: ReactNode[] = [];
  if (can('role.approve')) cards.push(<RoleApprovals key="roles" />);
  if (can('event.approve')) cards.push(<Proposals key="proposals" />);
  if (can('complaint.view_escalated') && !can('complaint.view_all')) cards.push(<Escalated key="escalated" />);
  if (can('announcement.approve')) cards.push(<AnnouncementQueue key="ann" />);
  if (can('inventory.approve_request')) cards.push(<EquipmentRequests key="eq" />);
  if (can('task.view_assigned')) cards.push(<MyTasks key="tasks" />);
  if (can('booking.verify') && !can('booking.approve')) cards.push(<EntryLog key="gate" />);
  if (can('complaint.resolve') && !can('complaint.view_all')) cards.push(<AssignedComplaints key="assigned" />);
  if (can('event.register_team') && hostels.length) cards.push(<HostelRegistrations key="hostel" hostels={hostels} />);
  if (can('institution.import')) cards.push(<InstitutionStatus key="inst" />);
  if (can('analytics.export') && can('role.approve')) cards.push(<BudgetNotice key="budget" />);
  if (!cards.length) return null;
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{cards}</div>;
}

function QueueCard({ title, icon: Icon, href, count, loading, children }: { title: string; icon: LucideIcon; href: string; count?: number; loading?: boolean; children?: ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={title}
        icon={<Icon className="size-4" />}
        actions={
          <Link href={href} className="text-xs font-medium text-accent-ink hover:underline">
            Open
          </Link>
        }
      />
      <CardBody>
        {loading ? (
          <Skeleton className="h-12" />
        ) : (
          <>
            {count !== undefined && <p className="text-2xl font-semibold text-text tabular">{count}</p>}
            {children}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function List({ items }: { items: { id: string; text: string; sub?: string }[] }) {
  if (!items.length) return <p className="text-xs text-muted">Nothing waiting.</p>;
  return (
    <ul className="mt-2 space-y-1.5">
      {items.slice(0, 4).map((i) => (
        <li key={i.id} className="text-xs">
          <span className="text-text">{i.text}</span>
          {i.sub && <span className="text-muted"> · {i.sub}</span>}
        </li>
      ))}
    </ul>
  );
}

function RoleApprovals() {
  const { data, isLoading } = useApi<RoleAssignment[]>('/rbac/assignments/pending');
  return (
    <QueueCard title="Role approvals" icon={KeyRound} href="/admin/roles" count={data?.length} loading={isLoading}>
      <List items={(data ?? []).map((a) => ({ id: a.id, text: `${roleLabel(a.role)} → ${a.user?.name ?? ''}`, sub: fmtRelative(a.createdAt) }))} />
    </QueueCard>
  );
}

function Proposals() {
  const { data, isLoading } = useApi<Tournament[]>('/tournaments', { status: 'PROPOSED' });
  return (
    <QueueCard title="Event proposals" icon={Trophy} href="/events" count={data?.length} loading={isLoading}>
      <List items={(data ?? []).map((t) => ({ id: t.id, text: t.name, sub: t.sport }))} />
    </QueueCard>
  );
}

function Escalated() {
  const { data, isLoading } = useApi<Complaint[]>('/complaints');
  const items = (data ?? []).filter((c) => c.escalated && c.status !== 'CLOSED');
  return (
    <QueueCard title="Escalated complaints" icon={ArrowUpCircle} href="/complaints" count={items.length} loading={isLoading}>
      <List items={items.map((c) => ({ id: c.id, text: c.subject, sub: c.status.toLowerCase().replace('_', ' ') }))} />
    </QueueCard>
  );
}

function AssignedComplaints() {
  const { data, isLoading } = useApi<Complaint[]>('/complaints');
  const items = (data ?? []).filter((c) => c.assignedToId && (c.status === 'OPEN' || c.status === 'IN_PROGRESS'));
  return (
    <QueueCard title="Complaints assigned to you" icon={ClipboardList} href="/complaints" count={items.length} loading={isLoading}>
      <List items={items.map((c) => ({ id: c.id, text: c.subject, sub: c.priority.toLowerCase() }))} />
    </QueueCard>
  );
}

function AnnouncementQueue() {
  const { data, isLoading } = useApi<Announcement[]>('/announcements');
  const items = (data ?? []).filter((a) => a.status === 'SUBMITTED');
  return (
    <QueueCard title="Announcements to review" icon={Megaphone} href="/announcements" count={items.length} loading={isLoading}>
      <List items={items.map((a) => ({ id: a.id, text: a.title, sub: a.author?.name }))} />
    </QueueCard>
  );
}

function EquipmentRequests() {
  const { data, isLoading } = useApi<EquipmentRequest[]>('/inventory/requests', { scope: 'all', status: 'PENDING' });
  return (
    <QueueCard title="Equipment requests" icon={PackageSearch} href="/inventory" count={data?.length} loading={isLoading}>
      <List items={(data ?? []).map((r) => ({ id: r.id, text: `${r.quantity} × ${r.itemName}`, sub: r.club?.name ?? r.requester?.name }))} />
    </QueueCard>
  );
}

function MyTasks() {
  const { data, isLoading } = useApi<OperationalTask[]>('/tasks');
  const open = (data ?? []).filter((t) => t.status !== 'DONE');
  return (
    <QueueCard title="My tasks" icon={ClipboardList} href="/tasks" count={open.length} loading={isLoading}>
      <List items={open.map((t) => ({ id: t.id, text: t.title, sub: t.facility?.name ?? t.kind.toLowerCase() }))} />
    </QueueCard>
  );
}

function EntryLog() {
  const { data, isLoading } = useApi<(Booking & { checkedInAt: string | null })[]>('/bookings/entry-log', undefined, { refreshInterval: 60000 });
  const inside = (data ?? []).filter((b) => b.checkedInAt).length;
  return (
    <QueueCard title="Today’s approved entries" icon={DoorOpen} href="/bookings" count={data?.length} loading={isLoading}>
      <p className="text-xs text-muted">{inside} checked in at the gate so far</p>
      <List items={(data ?? []).filter((b) => !b.checkedInAt && new Date(b.end).getTime() > Date.now()).map((b) => ({ id: b.id, text: b.facility?.name ?? '', sub: fmtTimeRange(b.start, b.end) }))} />
    </QueueCard>
  );
}

function HostelRegistrations({ hostels }: { hostels: string[] }) {
  const { data, isLoading } = useApi<Tournament[]>('/tournaments', { status: 'DRAFT' });
  return (
    <QueueCard title={`Open registrations · ${hostels.join(', ')}`} icon={Users} href="/events" count={data?.length} loading={isLoading}>
      <List items={(data ?? []).map((t) => ({ id: t.id, text: t.name, sub: t.sport }))} />
    </QueueCard>
  );
}

function InstitutionStatus() {
  const { data, isLoading } = useApi<InstitutionalRecord[]>('/institution/records');
  const verified = (data ?? []).filter((r) => r.dataStatus === 'VERIFIED').length;
  return (
    <QueueCard title="Institutional data" icon={DatabaseZap} href="/admin/institution" loading={isLoading}>
      {!data?.length ? (
        <p className="text-xs text-muted">No institutional records imported yet. Real personnel and facility data must be imported from an authorised IIT (ISM) source.</p>
      ) : (
        <p className="text-sm text-text">
          {verified} verified of {data.length} records
        </p>
      )}
    </QueueCard>
  );
}

/** Explicitly not a metric: SportsOS has no finance data source, so it says so instead of showing numbers. */
function BudgetNotice() {
  return (
    <Card>
      <CardHeader title="Budget & expenditure" icon={<Wallet className="size-4" />} />
      <CardBody>
        <EmptyState title="No finance data source connected" description="SportsOS does not hold budget or expenditure records. Connect an authorised DSW/SPEC finance export before reporting these figures." className="py-4" />
      </CardBody>
    </Card>
  );
}
