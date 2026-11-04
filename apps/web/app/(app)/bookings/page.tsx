'use client';

import type { Booking, BookingStatus, Facility } from '@sportsos/shared';
import { CalendarCheck, CalendarPlus, CheckCircle2, DoorOpen, QrCode, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '@/components/auth';
import { ApprovalQueue, PassModal } from '@/components/bookings';
import { QrScanner } from '@/components/qr-scanner';
import { BookingStatusBadge } from '@/components/status';
import { useToast } from '@/components/toast';
import {
  Modal,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  SkeletonRows,
  Tabs,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { BOOKING_TYPE_LABEL } from '@/lib/constants';
import { fmtDateTime, fmtTimeRange, fmtWeekday, humanize, shiftDate, todayIST } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

type Tab = 'mine' | 'approvals' | 'all' | 'gate';

function BookingTable({
  bookings,
  showUser,
  actions,
}: {
  bookings: Booking[];
  showUser?: boolean;
  actions?: (b: Booking) => ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Facility</th>
            {showUser && <th>Booked by</th>}
            <th>Type</th>
            <th>Purpose</th>
            <th>Status</th>
            {actions && <th className="text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              <td className="whitespace-nowrap">
                <div className="font-medium text-text">{fmtWeekday(b.start)}</div>
                <div className="text-xs text-muted tabular">{fmtTimeRange(b.start, b.end)}</div>
              </td>
              <td>
                {b.facility ? (
                  <Link href={`/facilities/${b.facility.id}`} className="font-medium text-text hover:text-accent-ink">
                    {b.facility.name}
                  </Link>
                ) : (
                  '—'
                )}
              </td>
              {showUser && (
                <td>
                  <div className="text-text">{b.user?.name ?? '—'}</div>
                  <div className="text-xs text-muted">{b.user?.admissionNo ?? b.user?.email}</div>
                </td>
              )}
              <td>
                <div className="flex flex-wrap gap-1">
                  <Badge tone="neutral">{BOOKING_TYPE_LABEL[b.type]}</Badge>
                  {b.club && <Badge tone="blue">{b.club.name}</Badge>}
                </div>
              </td>
              <td className="max-w-[240px]">
                <span className="line-clamp-2 text-text-2">{b.purpose}</span>
                {b.rejectionReason && <span className="block text-xs text-danger-ink">Reason: {b.rejectionReason}</span>}
              </td>
              <td>
                <div className="flex flex-col items-start gap-1">
                  <BookingStatusBadge status={b.status} />
                  {b.checkedInAt && <span className="text-[11px] text-good-ink">Checked in {fmtDateTime(b.checkedInAt)}</span>}
                </div>
              </td>
              {actions && <td className="text-right whitespace-nowrap">{actions(b)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MyBookings() {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<Booking[]>('/bookings', { scope: 'mine' });
  const [pass, setPass] = useState<Booking | null>(null);
  const [moving, setMoving] = useState<Booking | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const list = [...(data ?? [])].sort((a, b) => b.start.localeCompare(a.start));
    return {
      upcoming: list.filter((b) => new Date(b.end).getTime() > now && ['PENDING', 'APPROVED'].includes(b.status)).reverse(),
      past: list.filter((b) => !(new Date(b.end).getTime() > now && ['PENDING', 'APPROVED'].includes(b.status))),
    };
  }, [data]);

  async function cancel(b: Booking) {
    if (!window.confirm(`Cancel your booking at ${b.facility?.name ?? 'this facility'}?`)) return;
    setBusyId(b.id);
    try {
      await api.post(`/bookings/${b.id}/cancel`);
      toast.success('Booking cancelled');
      await revalidate('/bookings', '/facilities');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading) return <SkeletonRows rows={5} />;
  if (!data?.length) {
    return (
      <EmptyState
        icon={<CalendarCheck className="size-5" />}
        title="No bookings yet"
        description="Pick a facility and a free slot to make your first booking."
        action={
          <Link href="/facilities">
            <Button variant="accent" icon={<CalendarPlus className="size-4" />}>
              Book a facility
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-text">Upcoming</h3>
        {upcoming.length ? (
          <BookingTable
            bookings={upcoming}
            actions={(b) => (
              <div className="flex justify-end gap-1.5">
                {b.status === 'APPROVED' && (
                  <Button size="sm" icon={<QrCode className="size-3.5" />} onClick={() => setPass(b)}>
                    Pass
                  </Button>
                )}
                {new Date(b.start).getTime() > Date.now() && (
                  <Button size="sm" variant="ghost" onClick={() => setMoving(b)}>
                    Reschedule
                  </Button>
                )}
                <Button size="sm" variant="ghost" loading={busyId === b.id} onClick={() => cancel(b)}>
                  Cancel
                </Button>
              </div>
            )}
          />
        ) : (
          <p className="text-sm text-muted">No upcoming bookings.</p>
        )}
      </section>
      {past.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-text">History</h3>
          <BookingTable bookings={past.slice(0, 30)} />
        </section>
      )}
      <PassModal booking={pass} onClose={() => setPass(null)} />
      <RescheduleModal booking={moving} onClose={() => setMoving(null)} />
    </div>
  );
}

/** Same facility, new slot; the API re-checks hours, capacity, conflicts and (if needed) re-queues for approval. */
function RescheduleModal({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(todayIST(1));
  const [time, setTime] = useState('17:00');
  const [busy, setBusy] = useState(false);
  const minutes = booking ? Math.round((new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 60000) : 60;

  async function save() {
    if (!booking) return;
    const start = new Date(`${date}T${time}:00+05:30`);
    if (Number.isNaN(start.getTime())) return toast.warning('Pick a valid date and time');
    setBusy(true);
    try {
      const res = await api.post<Booking>(`/bookings/${booking.id}/reschedule`, { start: start.toISOString(), end: new Date(start.getTime() + minutes * 60000).toISOString() });
      toast.success('Booking moved', res.status === 'PENDING' ? 'The new slot needs approval again.' : 'Your pass stays valid for the new slot.');
      await revalidate('/bookings', '/facilities');
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!booking}
      onClose={onClose}
      title="Reschedule booking"
      description={booking ? `${booking.facility?.name ?? 'Facility'} · same duration (${minutes} min), up to 3 times` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Move booking
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="rs-date">
          <Input id="rs-date" type="date" value={date} min={todayIST(0)} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Start (IST)" htmlFor="rs-time">
          <Input id="rs-time" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function AllBookings() {
  const { can } = useAuth();
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [facilityId, setFacilityId] = useState('');
  const [from, setFrom] = useState(todayIST(-7));
  const [to, setTo] = useState(todayIST(7));
  const { data: facilities } = useApi<Facility[]>('/facilities');
  const { data, error, isLoading, mutate } = useApi<Booking[]>('/bookings', {
    scope: 'all',
    status,
    facilityId,
    from: from ? new Date(`${from}T00:00:00+05:30`).toISOString() : undefined,
    to: to ? new Date(`${shiftDate(to, 1)}T00:00:00+05:30`).toISOString() : undefined,
  });
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function cancel(b: Booking) {
    const reason = window.prompt(`Reason for cancelling ${b.user?.name ?? 'this'}'s booking (they will be notified):`);
    if (!reason || reason.trim().length < 3) return;
    setBusyId(b.id);
    try {
      await api.post(`/bookings/${b.id}/cancel`, { reason: reason.trim() });
      toast.success('Booking cancelled');
      await revalidate('/bookings');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Status" htmlFor="all-status">
          <Select id="all-status" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')} className="w-40">
            <option value="">Any status</option>
            {(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'] as BookingStatus[]).map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Facility" htmlFor="all-fac">
          <Select id="all-fac" value={facilityId} onChange={(e) => setFacilityId(e.target.value)} className="w-52">
            <option value="">All facilities</option>
            {(facilities ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="all-from">
          <Input id="all-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </Field>
        <Field label="To" htmlFor="all-to">
          <Input id="all-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </Field>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading ? (
        <SkeletonRows rows={6} />
      ) : !data?.length ? (
        <EmptyState title="No bookings in this range" />
      ) : (
        <BookingTable
          bookings={[...data].sort((a, b) => a.start.localeCompare(b.start))}
          showUser
          actions={
            can('booking.cancel')
              ? (b) =>
                  ['PENDING', 'APPROVED'].includes(b.status) && new Date(b.end).getTime() > Date.now() ? (
                    <Button size="sm" variant="ghost" loading={busyId === b.id} onClick={() => cancel(b)}>
                      Cancel
                    </Button>
                  ) : null
              : undefined
          }
        />
      )}
    </div>
  );
}

function GateCheckIn() {
  const toast = useToast();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; booking: Booking } | { ok: false; message: string } | null>(null);

  const verify = useCallback(
    async (value: string) => {
      const scanned = value.trim();
      if (!scanned) return;
      setBusy(true);
      try {
        // The API accepts the raw token or the full sportsos://pass/<token> URI.
        const booking = await api.post<Booking>('/bookings/check-in', { token: scanned });
        setResult({ ok: true, booking });
        setToken('');
        toast.success('Entry verified', booking.user?.name);
        void revalidate('/bookings');
      } catch (err) {
        setResult({ ok: false, message: errorMessage(err) });
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void verify(token);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <p className="text-sm text-text-2">
          Scan the QR on a student&apos;s gate pass, or type the token printed under it. Only approved bookings for the current
          slot are admitted.
        </p>
        <QrScanner onScan={(v) => void verify(v)} paused={busy} />
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <Field label="Pass token" htmlFor="gate-token" className="flex-1">
            <Input
              id="gate-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="sportsos://pass/… or token"
              autoComplete="off"
              className="font-mono"
            />
          </Field>
          <Button type="submit" variant="primary" loading={busy} icon={<DoorOpen className="size-4" />}>
            Verify
          </Button>
        </form>
      </div>
      <div>
        {!result ? (
          <div className="card">
            <EmptyState icon={<QrCode className="size-5" />} title="Waiting for a pass" description="The verification result appears here." />
          </div>
        ) : result.ok ? (
          <div className="card border-good p-5">
            <div className="flex items-center gap-2 text-good-ink">
              <CheckCircle2 className="size-6" />
              <span className="text-lg font-semibold">Entry allowed</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Student</dt>
                <dd className="font-medium text-text">{result.booking.user?.name ?? '—'}</dd>
                <dd className="text-xs text-muted">{result.booking.user?.admissionNo ?? result.booking.user?.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Facility</dt>
                <dd className="font-medium text-text">{result.booking.facility?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Slot</dt>
                <dd className="font-medium text-text">
                  {fmtWeekday(result.booking.start)} · {fmtTimeRange(result.booking.start, result.booking.end)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Party size</dt>
                <dd className="font-medium text-text">{result.booking.participants}</dd>
              </div>
            </dl>
            {result.booking.checkedInAt && (
              <p className="mt-3 text-xs text-muted">Checked in at {fmtDateTime(result.booking.checkedInAt)}</p>
            )}
          </div>
        ) : (
          <Notice tone="red" icon={<XCircle className="size-5" />} title="Entry refused">
            {result.message}
          </Notice>
        )}
      </div>
    </div>
  );
}

export default function BookingsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('mine');
  const { data: pending } = useApi<Booking[]>(can('booking.approve') ? '/bookings' : null, { scope: 'all', status: 'PENDING' });

  const tabs: { value: Tab; label: string; count?: number }[] = [{ value: 'mine', label: 'My bookings' }];
  if (can('booking.approve')) tabs.push({ value: 'approvals', label: 'Approvals', count: pending?.length });
  if (can('booking.view_all')) tabs.push({ value: 'all', label: 'All bookings' });
  if (can('booking.verify')) tabs.push({ value: 'gate', label: 'Gate check-in' });

  return (
    <div>
      <PageHeader
        eyebrow="Asset & Club Hub"
        title="Bookings"
        description="Reserve facilities, track approvals and verify gate passes."
        actions={
          <Link href="/facilities">
            <Button variant="accent" icon={<CalendarPlus className="size-4" />}>
              New booking
            </Button>
          </Link>
        }
      />
      <Card>
        <div className="px-5 pt-2">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
        </div>
        <CardBody className="pt-5">
          {tab === 'mine' && <MyBookings />}
          {tab === 'approvals' && (
            <>
              <CardHeader title="Pending requests" description="Approving notifies the requester and reserves the slot." className="px-0 pt-0" />
              <ApprovalQueue />
            </>
          )}
          {tab === 'all' && <AllBookings />}
          {tab === 'gate' && <GateCheckIn />}
        </CardBody>
      </Card>
    </div>
  );
}
