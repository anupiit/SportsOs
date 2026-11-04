'use client';

import type { AvailabilitySlot, Booking, BookingType, Club, FacilityAvailability } from '@sportsos/shared';
import clsx from 'clsx';
import { ArrowLeft, CalendarPlus, ChevronLeft, ChevronRight, ExternalLink, Pencil, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth, useUser } from '@/components/auth';
import { FacilityFormModal, FacilityStatusModal } from '@/components/facilities';
import { FacilityStatusBadge } from '@/components/status';
import { useToast } from '@/components/toast';
import {
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
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api';
import { BOOKING_TYPE_LABEL, FACILITY_TYPE_LABEL } from '@/lib/constants';
import { fmtDate, fmtTime, fmtTimeRange, minutesToHHMM, shiftDate, todayIST } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

interface Selection {
  start: number;
  end: number;
}

export default function FacilityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const user = useUser();
  const toast = useToast();
  const [date, setDate] = useState(todayIST());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const { data, error, isLoading, mutate } = useApi<FacilityAvailability>(`/facilities/${id}/availability`, { date }, { refreshInterval: 30000 });
  const { data: clubs } = useApi<Club[]>('/clubs');

  const facility = data?.facility;
  const slots = useMemo(() => data?.slots ?? [], [data]);
  const now = Date.now();

  useEffect(() => setSelection(null), [date]);

  const myClubs = useMemo(
    () =>
      (clubs ?? []).filter(
        (c) => c.myMembership?.role === 'CAPTAIN' || c.myMembership?.role === 'VICE_CAPTAIN' || c.coachId === user.id || c.canManage,
      ),
    [clubs, user.id],
  );

  const typeOptions = useMemo(() => {
    const opts: BookingType[] = ['CASUAL'];
    if (myClubs.length) opts.push('CLUB_PRACTICE');
    if (can('event.create') || can('booking.manage')) opts.push('EVENT');
    if (can('facility.update_status')) opts.push('MAINTENANCE');
    return opts;
  }, [myClubs.length, can]);

  const [type, setType] = useState<BookingType>('CASUAL');
  const [clubId, setClubId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [participants, setParticipants] = useState('1');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (type === 'CLUB_PRACTICE' && !clubId && myClubs[0]) setClubId(myClubs[0].id);
  }, [type, clubId, myClubs]);

  const isPast = (s: AvailabilitySlot) => new Date(s.end).getTime() <= now;
  const selectable = (s: AvailabilitySlot) => s.available && !isPast(s) && facility?.status === 'OPEN';

  function onSlotClick(i: number) {
    const slot = slots[i];
    if (!selectable(slot)) return;
    if (!selection || selection.start !== selection.end || i < selection.start) {
      setSelection({ start: i, end: i });
      return;
    }
    if (i === selection.start) {
      setSelection(null);
      return;
    }
    // Extend the range only if every slot in between is free.
    for (let k = selection.start; k <= i; k++) {
      if (!selectable(slots[k])) {
        setSelection({ start: i, end: i });
        return;
      }
    }
    setSelection({ start: selection.start, end: i });
  }

  async function book() {
    if (!selection || !facility) return;
    if (purpose.trim().length < 3) return toast.warning('Add a purpose', 'e.g. "Evening practice" or "Friendly match"');
    if (type === 'CLUB_PRACTICE' && !clubId) return toast.warning('Choose the club for this practice');
    const start = slots[selection.start].start;
    const end = slots[selection.end].end;
    setBusy(true);
    try {
      const booking = await api.post<Booking>('/bookings', {
        facilityId: facility.id,
        start,
        end,
        purpose: purpose.trim(),
        type,
        clubId: type === 'CLUB_PRACTICE' ? clubId : undefined,
        participants: Math.max(1, Number(participants) || 1),
      });
      if (booking.status === 'APPROVED') toast.success('Booking confirmed', `${facility.name} · ${fmtTimeRange(start, end)}`);
      else toast.info('Request sent for approval', 'You will be notified when the Sports Office decides.');
      setSelection(null);
      setPurpose('');
      await Promise.all([mutate(), revalidate('/bookings', '/analytics')]);
    } catch (err) {
      toast.error(err);
      void mutate();
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState error={error} onRetry={() => mutate()} />
      </div>
    );
  }

  return (
    <div>
      <BackLink />
      {isLoading || !facility ? (
        <div className="mt-4 space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <>
          <div className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-wider text-accent-ink uppercase">
                {facility.code} · {FACILITY_TYPE_LABEL[facility.type]}
              </p>
              <h1 className="mt-0.5 flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight text-text">
                {facility.name} <FacilityStatusBadge status={facility.status} />
              </h1>
              <p className="mt-1 text-sm text-text-2">
                {facility.sports.join(' · ')} · open {minutesToHHMM(facility.openMinute)}–{minutesToHHMM(facility.closeMinute)} ·{' '}
                {facility.slotMinutes}-minute slots · capacity {facility.capacity}
              </p>
            </div>
            <div className="flex gap-2">
              {can('facility.update_status') && (
                <Button icon={<Wrench className="size-3.5" />} onClick={() => setStatusOpen(true)}>
                  Update status
                </Button>
              )}
              {can('facility.manage') && (
                <Button icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
            </div>
          </div>

          {facility.status !== 'OPEN' && (
            <Notice tone="amber" title={`This facility is ${facility.status.toLowerCase()}`} className="mb-5">
              {facility.statusNote ?? 'Bookings are paused until ground staff reopen it.'}
            </Notice>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Availability"
                description="Select a free slot; select a later slot to extend the booking."
                actions={
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" aria-label="Previous day" onClick={() => setDate((d) => shiftDate(d, -1))} disabled={date <= todayIST()}>
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Input
                      type="date"
                      value={date}
                      min={todayIST()}
                      max={todayIST(30)}
                      onChange={(e) => e.target.value && setDate(e.target.value)}
                      className="h-8 w-40"
                      aria-label="Booking date"
                    />
                    <Button size="sm" variant="ghost" aria-label="Next day" onClick={() => setDate((d) => shiftDate(d, 1))} disabled={date >= todayIST(30)}>
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                }
              />
              <CardBody>
                {!slots.length ? (
                  <EmptyState title="No slots on this day" />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {slots.map((s, i) => {
                        const inSel = selection && i >= selection.start && i <= selection.end;
                        const past = isPast(s);
                        const ok = selectable(s);
                        return (
                          <button
                            key={s.start}
                            type="button"
                            onClick={() => onSlotClick(i)}
                            disabled={!ok}
                            aria-pressed={!!inSel}
                            className={clsx(
                              'rounded-lg border px-3 py-2 text-left transition-colors',
                              inSel
                                ? 'border-accent bg-accent text-white'
                                : ok
                                  ? 'border-border bg-surface hover:border-accent hover:bg-accent-soft'
                                  : 'cursor-not-allowed border-transparent bg-surface-2',
                            )}
                          >
                            <span className={clsx('block text-sm font-semibold whitespace-nowrap tabular', !inSel && !ok && 'text-muted')}>
                              {fmtTime(s.start)}
                            </span>
                            <span className={clsx('block truncate text-[11px]', inSel ? 'text-white/85' : 'text-muted')}>
                              to {fmtTime(s.end)} ·{' '}
                              {s.booking
                                ? `${BOOKING_TYPE_LABEL[s.booking.type]} · ${s.booking.status === 'PENDING' ? 'pending' : 'booked'}`
                                : past
                                  ? 'Past'
                                  : s.available
                                    ? 'Free'
                                    : 'Unavailable'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-muted">
                      <span className="flex items-center gap-1.5">
                        <span className="size-3 rounded border border-border bg-surface" /> Free
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="size-3 rounded bg-accent" /> Selected
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="size-3 rounded bg-surface-2" /> Booked / past
                      </span>
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader title="Book this facility" icon={<CalendarPlus className="size-4" />} />
                <CardBody>
                  {!selection ? (
                    <p className="text-sm text-muted">Pick a free slot on {fmtDate(date + 'T06:00:00+05:30')} to start a booking.</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-lg bg-accent-soft px-3 py-2.5 text-sm text-accent-ink">
                        <span className="font-semibold">{fmtDate(slots[selection.start].start)}</span> ·{' '}
                        {fmtTime(slots[selection.start].start)} – {fmtTime(slots[selection.end].end)}
                        <span className="ml-1 text-xs opacity-80">
                          ({selection.end - selection.start + 1} slot{selection.end > selection.start ? 's' : ''})
                        </span>
                      </div>
                      <Field label="Booking type" htmlFor="b-type">
                        <Select id="b-type" value={type} onChange={(e) => setType(e.target.value as BookingType)}>
                          {typeOptions.map((t) => (
                            <option key={t} value={t}>
                              {BOOKING_TYPE_LABEL[t]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      {type === 'CLUB_PRACTICE' && (
                        <Field label="Club" htmlFor="b-club">
                          <Select id="b-club" value={clubId} onChange={(e) => setClubId(e.target.value)}>
                            {myClubs.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      )}
                      <Field label="Purpose" htmlFor="b-purpose" required>
                        <Textarea
                          id="b-purpose"
                          value={purpose}
                          onChange={(e) => setPurpose(e.target.value)}
                          placeholder="e.g. 3v3 practice with hostel team"
                          className="min-h-[64px]"
                        />
                      </Field>
                      <Field label="Participants" htmlFor="b-part" hint={`Facility capacity: ${facility.capacity}`}>
                        <Input
                          id="b-part"
                          type="number"
                          min={1}
                          max={facility.capacity}
                          value={participants}
                          onChange={(e) => setParticipants(e.target.value)}
                        />
                      </Field>
                      <p className="text-xs text-muted">
                        {type === 'CASUAL' && !facility.requiresApproval
                          ? 'Casual bookings on this facility are confirmed instantly.'
                          : 'This booking will be sent to the Sports Office for approval.'}
                      </p>
                      <Button variant="primary" className="w-full" loading={busy} onClick={book}>
                        Confirm booking
                      </Button>
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Location & geofence" />
                <CardBody className="space-y-2 text-sm">
                  <p className="text-text-2">
                    <span className="tabular">
                      {facility.latitude.toFixed(5)}, {facility.longitude.toFixed(5)}
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    Attendance check-ins must be within <Badge tone="blue">{facility.geofenceRadiusM} m</Badge> of this point.
                  </p>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${facility.latitude}&mlon=${facility.longitude}#map=18/${facility.latitude}/${facility.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline"
                  >
                    Open in OpenStreetMap <ExternalLink className="size-3" />
                  </a>
                </CardBody>
              </Card>
            </div>
          </div>

          <FacilityFormModal open={editing} onClose={() => setEditing(false)} facility={facility} />
          <FacilityStatusModal
            facility={statusOpen ? facility : null}
            onClose={() => {
              setStatusOpen(false);
              void mutate();
            }}
          />
        </>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/facilities" className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text">
      <ArrowLeft className="size-4" /> All facilities
    </Link>
  );
}
