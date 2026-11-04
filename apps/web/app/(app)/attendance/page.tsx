'use client';

import type {
  AttendanceRecord,
  AttendanceSession,
  CheckInResult,
  Club,
  Facility,
} from '@sportsos/shared';
import clsx from 'clsx';
import {
  CheckCircle2,
  History,
  LocateFixed,
  MonitorPlay,
  Play,
  Power,
  ShieldCheck,
  ShieldX,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ProjectorView } from '@/components/attendance/projector';
import { useAuth, useUser } from '@/components/auth';
import { AttendanceCorrections } from '@/components/club-extra';
import { SessionBadge } from '@/components/status';
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
  Modal,
  Notice,
  PageHeader,
  Select,
  SkeletonRows,
  Tabs,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { ATTEMPT_OUTCOME_LABEL } from '@/lib/constants';
import { getDeviceId, getPosition, type GeoFix } from '@/lib/device';
import { fmtDateTime, fmtTime, fmtWeekday } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

type Tab = 'run' | 'checkin' | 'history';

// ---------------------------------------------------------------- manager

function StartSessionCard({ onStarted }: { onStarted: (s: AttendanceSession) => void }) {
  const user = useUser();
  const { can } = useAuth();
  const toast = useToast();
  const { data: facilities } = useApi<Facility[]>('/facilities');
  const { data: clubs } = useApi<Club[]>('/clubs');
  const myClubs = useMemo(
    () => (clubs ?? []).filter((c) => c.coachId === user.id || c.canManage),
    [clubs, user.id, can],
  );
  const openFacilities = (facilities ?? []).filter((f) => f.status === 'OPEN');
  const [title, setTitle] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [clubId, setClubId] = useState('');
  const [duration, setDuration] = useState('90');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!clubId && myClubs.length === 1) setClubId(myClubs[0].id);
  }, [myClubs, clubId]);

  useEffect(() => {
    if (!title && clubId) {
      const club = myClubs.find((c) => c.id === clubId);
      if (club) setTitle(`${club.name} practice`);
    }
  }, [clubId, myClubs, title]);

  async function start(e: FormEvent) {
    e.preventDefault();
    if (!facilityId) return toast.warning('Choose the facility', 'Its location defines the attendance geofence.');
    if (title.trim().length < 3) return toast.warning('Give the session a title (3+ characters)');
    setBusy(true);
    try {
      const now = new Date();
      const session = await api.post<AttendanceSession>('/attendance/sessions', {
        title: title.trim(),
        facilityId,
        clubId: clubId || undefined,
        startsAt: now.toISOString(),
        endsAt: new Date(now.getTime() + Number(duration) * 60000).toISOString(),
      });
      toast.success('Session started', 'Project the code so students can check in.');
      await revalidate('/attendance');
      setTitle('');
      onStarted(session);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Start a session" description="Generates a rotating 6-digit code bound to the facility geofence." icon={<Play className="size-4" />} />
      <CardBody>
        <form onSubmit={start} className="space-y-4">
          <Field label="Facility" htmlFor="s-fac" required>
            <Select id="s-fac" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
              <option value="">Select a facility…</option>
              {openFacilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.geofenceRadiusM} m geofence)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Club" htmlFor="s-club" hint="Club sessions only accept active members of that club">
            <Select id="s-club" value={clubId} onChange={(e) => setClubId(e.target.value)}>
              <option value="">Open session (any student)</option>
              {myClubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" htmlFor="s-title" required>
            <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Evening football practice" />
          </Field>
          <Field label="Duration" htmlFor="s-dur">
            <Select id="s-dur" value={duration} onChange={(e) => setDuration(e.target.value)}>
              {[30, 45, 60, 90, 120, 180].map((m) => (
                <option key={m} value={m}>
                  {m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}${m % 60 ? ` ${m % 60} min` : ''}` : `${m} minutes`}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={busy} icon={<Play className="size-4" />}>
            Start &amp; show code
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function SessionRecordsModal({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const { can } = useAuth();
  const { data, isLoading, mutate } = useApi<AttendanceSession>(sessionId ? `/attendance/sessions/${sessionId}` : null);
  return (
    <Modal open={!!sessionId} onClose={onClose} title={data?.title ?? 'Session roster'} description={data ? `${data.facility?.name ?? ''} · ${fmtDateTime(data.startsAt)}` : undefined} size="lg">
      {isLoading || !data ? (
        <SkeletonRows rows={4} />
      ) : !data.records?.length ? (
        <EmptyState title="No verified check-ins" />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Admission no.</th>
                <th>Time</th>
                <th className="num">Distance</th>
                <th className="num">GPS accuracy</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-text">{r.user?.name ?? '—'}</td>
                  <td className="tabular">{r.user?.admissionNo ?? '—'}</td>
                  <td className="tabular">{fmtTime(r.checkedInAt)}</td>
                  <td className="num">{r.distanceM === null ? <span className="text-muted">manual</span> : `${Math.round(r.distanceM)} m`}</td>
                  <td className="num">{r.accuracyM === null ? '—' : `±${Math.round(r.accuracyM)} m`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && can('attendance.manage') && <AttendanceCorrections sessionId={data.id} onChanged={() => mutate()} />}
    </Modal>
  );
}

function ManagerView({ onProject }: { onProject: (id: string) => void }) {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<AttendanceSession[]>('/attendance/sessions', undefined, { refreshInterval: 15000 });
  const [rosterFor, setRosterFor] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const sessions = [...(data ?? [])].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const live = sessions.filter((s) => s.status === 'ACTIVE');
  const past = sessions.filter((s) => s.status !== 'ACTIVE');

  async function close(s: AttendanceSession) {
    if (!window.confirm(`Close "${s.title}"?`)) return;
    setClosingId(s.id);
    try {
      await api.post(`/attendance/sessions/${s.id}/close`);
      toast.success('Session closed');
      await revalidate('/attendance');
    } catch (err) {
      toast.error(err);
    } finally {
      setClosingId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <StartSessionCard onStarted={(s) => onProject(s.id)} />
      <Card className="xl:col-span-2">
        <CardHeader title="My sessions" description="Live sessions accept check-ins until closed or until they end." icon={<Users className="size-4" />} />
        <CardBody>
          {error ? (
            <ErrorState error={error} onRetry={() => mutate()} />
          ) : isLoading ? (
            <SkeletonRows rows={4} />
          ) : !sessions.length ? (
            <EmptyState icon={<ShieldCheck className="size-5" />} title="No sessions yet" description="Start a session to replace the paper sign-in register." />
          ) : (
            <div className="space-y-5">
              {live.length > 0 && (
                <ul className="space-y-2">
                  {live.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-good/40 bg-good-soft/40 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-text">{s.title}</span>
                          <SessionBadge status={s.status} />
                        </div>
                        <p className="text-xs text-text-2">
                          {s.facility?.name}
                          {s.club ? ` · ${s.club.name}` : ''} · {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-text tabular">{s.attendeeCount} in</span>
                      <Button size="sm" variant="primary" icon={<MonitorPlay className="size-3.5" />} onClick={() => onProject(s.id)}>
                        Show code
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Power className="size-3.5" />} loading={closingId === s.id} onClick={() => close(s)}>
                        Close
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {past.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Session</th>
                        <th>Facility</th>
                        <th>Date</th>
                        <th className="num">Verified</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {past.slice(0, 20).map((s) => (
                        <tr key={s.id}>
                          <td>
                            <div className="font-medium text-text">{s.title}</div>
                            {s.club && <div className="text-xs text-muted">{s.club.name}</div>}
                          </td>
                          <td>{s.facility?.name ?? '—'}</td>
                          <td className="whitespace-nowrap">{fmtWeekday(s.startsAt)}</td>
                          <td className="num">{s.attendeeCount}</td>
                          <td className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => setRosterFor(s.id)}>
                              Roster
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>
      <SessionRecordsModal sessionId={rosterFor} onClose={() => setRosterFor(null)} />
    </div>
  );
}

// ---------------------------------------------------------------- student

type Phase = 'idle' | 'locating' | 'submitting';

function CheckInView({ initialSessionId }: { initialSessionId: string | null }) {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<AttendanceSession[]>('/attendance/sessions', { status: 'ACTIVE' }, { refreshInterval: 15000 });
  const [selectedId, setSelectedId] = useState<string | null>(initialSessionId);
  const [otp, setOtp] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const sessions = data ?? [];
  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && sessions.length === 1) setSelectedId(sessions[0].id);
  }, [sessions, selectedId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return toast.warning('Pick the session you are attending');
    if (!/^\d{6}$/.test(otp)) return toast.warning('Enter the 6-digit code shown by your coach');
    setResult(null);
    setGeoError(null);
    setPhase('locating');
    let position: GeoFix;
    try {
      position = await getPosition();
      setFix(position);
    } catch (err) {
      setGeoError(errorMessage(err));
      setPhase('idle');
      return;
    }
    setPhase('submitting');
    try {
      const res = await api.post<CheckInResult>('/attendance/check-in', {
        sessionId: selectedId,
        otp,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracyM: position.accuracyM,
        deviceId: getDeviceId(),
      });
      setResult(res);
      if (res.outcome === 'ACCEPTED') {
        setOtp('');
        await Promise.all([mutate(), revalidate('/attendance/me')]);
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setPhase('idle');
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      <Card className="xl:col-span-2">
        <CardHeader title="Live sessions" description="Sessions you can check in to right now" icon={<Users className="size-4" />} />
        <CardBody>
          {error ? (
            <ErrorState error={error} onRetry={() => mutate()} />
          ) : isLoading ? (
            <SkeletonRows rows={3} />
          ) : !sessions.length ? (
            <EmptyState icon={<ShieldCheck className="size-5" />} title="No live sessions" description="When your coach starts practice, it shows up here." />
          ) : (
            <ul className="space-y-2" role="radiogroup" aria-label="Session">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedId === s.id}
                    onClick={() => {
                      setSelectedId(s.id);
                      setResult(null);
                    }}
                    className={clsx(
                      'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                      selectedId === s.id ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-text">{s.title}</span>
                      <SessionBadge status={s.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-text-2">
                      {s.facility?.name}
                      {s.club ? ` · ${s.club.name}` : ''} · until {fmtTime(s.endsAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="xl:col-span-3">
        <CardHeader title="Check in" description="Your code and live GPS position are verified together — proxies are rejected." icon={<LocateFixed className="size-4" />} />
        <CardBody>
          <form onSubmit={submit} className="space-y-4">
            {selected ? (
              <div className="rounded-lg bg-surface-2 px-3.5 py-2.5 text-sm">
                <p className="font-semibold text-text">{selected.title}</p>
                <p className="text-xs text-text-2">
                  Be within {selected.facility?.geofenceRadiusM ?? '—'} m of {selected.facility?.name ?? 'the facility'}.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">Select a live session first.</p>
            )}
            <Field label="6-digit code" htmlFor="otp" hint="Shown on your coach's screen; it changes every 30 seconds.">
              <Input
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                className="h-14 max-w-xs text-center font-mono text-3xl tracking-[0.4em]"
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={phase !== 'idle'}
              disabled={!selected}
              icon={<LocateFixed className="size-4" />}
            >
              {phase === 'locating' ? 'Getting your location…' : phase === 'submitting' ? 'Verifying…' : 'Verify & check in'}
            </Button>
            {fix && (
              <p className="text-xs text-muted tabular">
                Last GPS fix: {fix.latitude.toFixed(5)}, {fix.longitude.toFixed(5)} (±{Math.round(fix.accuracyM)} m)
              </p>
            )}
            {geoError && (
              <Notice tone="amber" title="Location needed">
                {geoError}
              </Notice>
            )}
            {result && <CheckInOutcome result={result} />}
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

function CheckInOutcome({ result }: { result: CheckInResult }) {
  const label = ATTEMPT_OUTCOME_LABEL[result.outcome];
  const ok = result.outcome === 'ACCEPTED';
  return (
    <div
      role="status"
      className={clsx('flex gap-3 rounded-xl px-4 py-3.5', ok ? 'bg-good-soft text-good-ink' : 'bg-danger-soft text-danger-ink')}
    >
      {ok ? <CheckCircle2 className="mt-0.5 size-6 shrink-0" /> : <ShieldX className="mt-0.5 size-6 shrink-0" />}
      <div>
        <p className="font-semibold">{label.title}</p>
        <p className="text-sm opacity-90">{result.message || label.help}</p>
        {result.distanceM !== null && (
          <p className="mt-1 text-xs opacity-80 tabular">Distance from facility centre: {Math.round(result.distanceM)} m</p>
        )}
      </div>
    </div>
  );
}

function HistoryView() {
  const { data, error, isLoading, mutate } = useApi<AttendanceRecord[]>('/attendance/me');
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading) return <SkeletonRows rows={5} />;
  if (!data?.length) return <EmptyState icon={<History className="size-5" />} title="No verified attendance yet" />;
  return (
    <Card>
      <CardHeader title="My verified attendance" description={`${data.length} sessions`} icon={<History className="size-4" />} />
      <CardBody>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Checked in</th>
                <th className="num">Distance</th>
                <th className="num">GPS accuracy</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-text">{r.session?.title ?? 'Session'}</td>
                  <td className="whitespace-nowrap">{fmtDateTime(r.checkedInAt)}</td>
                  <td className="num">{r.distanceM === null ? <span className="text-muted">manual</span> : `${Math.round(r.distanceM)} m`}</td>
                  <td className="num">{r.accuracyM === null ? '—' : `±${Math.round(r.accuracyM)} m`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- page

export default function AttendancePage() {
  const { can } = useAuth();
  const manager = can('attendance.manage');
  const [tab, setTab] = useState<Tab>(manager ? 'run' : 'checkin');
  const [projecting, setProjecting] = useState<string | null>(null);
  const [linkedSession, setLinkedSession] = useState<string | null>(null);

  // Deep link from the dashboard: /attendance?session=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('session');
    if (!id) return;
    if (manager) setProjecting(id);
    else {
      setLinkedSession(id);
      setTab('checkin');
    }
  }, [manager]);

  const tabs: { value: Tab; label: string }[] = [
    ...(manager ? [{ value: 'run' as Tab, label: 'Run sessions' }] : []),
    { value: 'checkin', label: 'Check in' },
    { value: 'history', label: 'My history' },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="High-fidelity tracking"
        title="Verified attendance"
        description="OTP + GPS geofenced check-ins replace paper registers: every record carries the distance and accuracy it was verified with."
        actions={
          <Badge tone="blue" icon={<ShieldCheck className="size-3" />}>
            One device · one student · one session
          </Badge>
        }
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-6" />
      {tab === 'run' && manager && <ManagerView onProject={setProjecting} />}
      {tab === 'checkin' && <CheckInView initialSessionId={linkedSession} />}
      {tab === 'history' && <HistoryView />}
      {projecting && <ProjectorView sessionId={projecting} onExit={() => setProjecting(null)} />}
    </div>
  );
}
