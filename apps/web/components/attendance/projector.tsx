'use client';

import type { AttendanceSession, SessionOtp } from '@sportsos/shared';
import { Maximize2, Minimize2, Power, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

function useRotatingOtp(sessionId: string, enabled: boolean) {
  const [otp, setOtp] = useState<SessionOtp | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: number | undefined;
    const load = async () => {
      try {
        const o = await api.get<SessionOtp>(`/attendance/sessions/${sessionId}/otp`);
        if (cancelled) return;
        setOtp(o);
        setFetchedAt(Date.now());
        setError(null);
        // Refetch just after the current step expires.
        timer = window.setTimeout(load, Math.max(1, o.expiresInSec) * 1000 + 300);
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err));
        timer = window.setTimeout(load, 5000);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [sessionId, enabled]);

  return { otp, fetchedAt, error };
}

function CountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const urgent = remaining <= 5;
  return (
    <svg viewBox="0 0 120 120" className="size-28" role="img" aria-label={`${Math.ceil(remaining)} seconds until the code changes`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={urgent ? '#e08f75' : '#6d8ef0'}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform="rotate(-90 60 60)"
        style={{ transition: 'stroke-dashoffset 250ms linear' }}
      />
      <text x="60" y="58" textAnchor="middle" fill="#fff" fontSize="30" fontWeight="700" fontFamily="system-ui">
        {Math.ceil(remaining)}
      </text>
      <text x="60" y="80" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="11" fontFamily="system-ui">
        seconds
      </text>
    </svg>
  );
}

/** Full-screen view a coach projects at the ground: rotating OTP, session QR, live roster. */
export function ProjectorView({ sessionId, onExit }: { sessionId: string; onExit: () => void }) {
  const toast = useToast();
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: session, mutate } = useApi<AttendanceSession>(`/attendance/sessions/${sessionId}`, undefined, {
    refreshInterval: 4000,
  });
  const live = session?.status === 'ACTIVE';
  const { otp, fetchedAt, error } = useRotatingOtp(sessionId, session ? live : true);
  const [now, setNow] = useState(() => Date.now());
  const [fullscreen, setFullscreen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) onExit();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onExit]);

  const step = session?.otpStepSeconds ?? 30;
  const remaining = otp ? Math.max(0, otp.expiresInSec - (now - fetchedAt) / 1000) : 0;
  const code = otp?.code ?? '······';
  const records = [...(session?.records ?? [])].sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt));

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      /* not allowed — ignore */
    }
  }

  async function close() {
    if (!window.confirm('Close this session? Students will no longer be able to check in.')) return;
    setClosing(true);
    try {
      await api.post(`/attendance/sessions/${sessionId}/close`);
      toast.success('Session closed', `${session?.attendeeCount ?? records.length} students verified`);
      await Promise.all([mutate(), revalidate('/attendance', '/analytics')]);
    } catch (err) {
      toast.error(err);
    } finally {
      setClosing(false);
    }
  }

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#0f1530] text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] text-[#e9a58f] uppercase">Verified attendance</p>
          <h2 className="truncate text-xl font-bold">{session?.title ?? 'Loading session…'}</h2>
          {session && (
            <p className="text-sm text-white/70">
              {session.facility?.name}
              {session.club ? ` · ${session.club.name}` : ''} · ends {fmtTime(session.endsAt)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            icon={fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            onClick={toggleFullscreen}
          >
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </Button>
          {live && (
            <Button variant="warn" icon={<Power className="size-4" />} loading={closing} onClick={close}>
              Close session
            </Button>
          )}
          <Button
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            icon={<X className="size-4" />}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              onExit();
            }}
          >
            Exit
          </Button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-8 p-6 lg:grid-cols-[1.4fr_1fr] lg:p-10">
        <div className="flex flex-col items-center justify-center gap-8">
          {live ? (
            <>
              <p className="text-center text-lg text-white/80">
                Open SportsOS → <span className="font-semibold text-white">Attendance</span> and enter this code at the ground
              </p>
              <div
                className="font-mono text-[clamp(56px,11vw,140px)] leading-none font-bold tracking-[0.12em] tabular"
                aria-live="polite"
                aria-label={`Current code ${code.split('').join(' ')}`}
              >
                {code.slice(0, 3)}
                <span className="text-white/40"> </span>
                {code.slice(3)}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-10">
                <CountdownRing remaining={remaining} total={step} />
                {otp?.qrDataUrl && (
                  <div className="text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={otp.qrDataUrl} alt="Session QR code for the mobile app" className="size-36 rounded-xl bg-white p-2" />
                    <p className="mt-1.5 text-xs text-white/60">Scan in the mobile app</p>
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-[#f0b39f]">{error}</p>}
              <p className="max-w-lg text-center text-xs text-white/50">
                Codes rotate every {step} seconds and only work inside the {session?.facility?.geofenceRadiusM ?? '—'} m geofence
                around {session?.facility?.name ?? 'the facility'}, from one device per student.
              </p>
            </>
          ) : session ? (
            <div className="text-center">
              <p className="text-3xl font-bold">Session closed</p>
              <p className="mt-2 text-white/70">{session.attendeeCount} students were verified.</p>
            </div>
          ) : null}
        </div>

        <div className="flex min-h-[320px] flex-col rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Users className="size-4" /> Checked in
            </h3>
            <span className="text-3xl font-bold tabular">{session?.attendeeCount ?? records.length}</span>
          </div>
          <ul className="mt-4 flex-1 space-y-1.5 overflow-y-auto">
            {records.length === 0 && <li className="text-sm text-white/50">Waiting for the first check-in…</li>}
            {records.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.user?.name ?? 'Student'}</p>
                  <p className="text-[11px] text-white/50">{r.user?.admissionNo ?? ''}</p>
                </div>
                <div className="text-right text-[11px] text-white/60 tabular">
                  <p>{fmtTime(r.checkedInAt)}</p>
                  <p>{r.distanceM === null ? 'manual entry' : `${Math.round(r.distanceM)} m · ±${Math.round(r.accuracyM ?? 0)} m`}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
