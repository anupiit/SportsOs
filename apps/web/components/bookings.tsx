'use client';

import type { Booking, BookingPass } from '@sportsos/shared';
import { Check, Printer, X } from 'lucide-react';
import { useState } from 'react';
import { BookingStatusBadge } from '@/components/status';
import { useToast } from '@/components/toast';
import { Badge, Button, EmptyState, Field, Modal, SkeletonRows, Spinner, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { BOOKING_TYPE_LABEL } from '@/lib/constants';
import { fmtDate, fmtTimeRange, fmtWeekday } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

export function PassModal({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const { data, error, isLoading } = useApi<BookingPass>(booking ? `/bookings/${booking.id}/pass` : null);
  return (
    <Modal open={!!booking} onClose={onClose} title="Gate pass" description="Show this QR code to security at the facility entrance." size="sm">
      {booking && (
        <div className="print-area flex flex-col items-center text-center">
          <p className="text-base font-semibold text-text">{booking.facility?.name ?? 'Facility'}</p>
          <p className="text-sm text-text-2">
            {fmtWeekday(booking.start)} · {fmtTimeRange(booking.start, booking.end)}
          </p>
          <div className="my-4 flex size-56 items-center justify-center rounded-xl border border-border bg-white p-2">
            {isLoading && <Spinner />}
            {error && <p className="px-4 text-xs text-danger-ink">{error.message}</p>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {data && <img src={data.qrDataUrl} alt="Booking pass QR code" className="size-full" />}
          </div>
          {data && (
            <p className="font-mono text-[11px] break-all text-muted">
              Token: <span className="text-text-2">{data.token}</span>
            </p>
          )}
          <div className="mt-2">
            <BookingStatusBadge status={booking.status} />
          </div>
          <Button className="no-print mt-4" size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()} disabled={!data}>
            Print pass
          </Button>
        </div>
      )}
    </Modal>
  );
}

export function RejectModal({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!booking) return;
    if (reason.trim().length < 3) {
      toast.warning('Add a reason', 'The requester will see this reason.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/bookings/${booking.id}/reject`, { reason: reason.trim() });
      toast.success('Booking rejected');
      setReason('');
      await revalidate('/bookings', '/analytics', '/facilities');
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
      title="Reject booking"
      description={booking ? `${booking.facility?.name ?? ''} · ${fmtDate(booking.start)} ${fmtTimeRange(booking.start, booking.end)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={submit}>
            Reject booking
          </Button>
        </>
      }
    >
      <Field label="Reason" htmlFor="reject-reason" required>
        <Textarea
          id="reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Ground reserved for inter-hostel finals"
          autoFocus
        />
      </Field>
    </Modal>
  );
}

/** Pending approval queue (perm: bookings:approve). */
export function ApprovalQueue({ limit, compact }: { limit?: number; compact?: boolean }) {
  const toast = useToast();
  const { data, error, isLoading } = useApi<Booking[]>('/bookings', { scope: 'all', status: 'PENDING' }, { refreshInterval: 30000 });
  const [rejecting, setRejecting] = useState<Booking | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function approve(b: Booking) {
    setBusyId(b.id);
    try {
      await api.post(`/bookings/${b.id}/approve`);
      toast.success('Booking approved', `${b.facility?.name ?? 'Facility'} · ${fmtTimeRange(b.start, b.end)}`);
      await revalidate('/bookings', '/analytics', '/facilities');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) return <SkeletonRows rows={3} />;
  if (error) return <p className="text-sm text-danger-ink">{error.message}</p>;
  const items = (data ?? []).slice(0, limit ?? Infinity);
  if (!items.length) return <EmptyState icon={<Check className="size-5" />} title="No pending approvals" description="All booking requests have been handled." />;

  return (
    <>
      <ul className="divide-y divide-border">
        {items.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-text">{b.facility?.name ?? 'Facility'}</span>
                <Badge tone="blue">{BOOKING_TYPE_LABEL[b.type]}</Badge>
                {b.club && <Badge tone="neutral">{b.club.name}</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-text-2">
                {fmtWeekday(b.start)} · {fmtTimeRange(b.start, b.end)} · {b.participants} participant{b.participants === 1 ? '' : 's'}
              </p>
              {!compact && (
                <p className="mt-0.5 truncate text-xs text-muted">
                  {b.user?.name ?? 'Requester'}
                  {b.user?.admissionNo ? ` (${b.user.admissionNo})` : ''} — “{b.purpose}”
                </p>
              )}
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => setRejecting(b)}>
                Reject
              </Button>
              <Button size="sm" variant="accent" loading={busyId === b.id} icon={<Check className="size-3.5" />} onClick={() => approve(b)}>
                Approve
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <RejectModal booking={rejecting} onClose={() => setRejecting(null)} />
    </>
  );
}
