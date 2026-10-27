'use client';

import { roleLabel, type Role } from '@sportsos/shared';
import { LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth';
import { AuthLayout } from '@/components/auth-layout';
import { Button, Field, Input, Notice } from '@/components/ui';
import { errorMessage } from '@/lib/api';

const DEMO_PASSWORD = 'sportsos123';

const DEMO_ACCOUNTS: { role: Role; email: string }[] = [
  { role: 'ADMIN', email: 'admin@iitism.ac.in' },
  { role: 'DIRECTOR', email: 'director@iitism.ac.in' },
  { role: 'DEAN_SW', email: 'dean.sw@iitism.ac.in' },
  { role: 'SPEC_PRESIDENT', email: 'spec.president@iitism.ac.in' },
  { role: 'SPORTS_OFFICER', email: 'peso@iitism.ac.in' },
  { role: 'GENERAL_SECRETARY', email: 'gsec.sports@iitism.ac.in' },
  { role: 'EVENT_COMMITTEE', email: 'events@iitism.ac.in' },
  { role: 'COACH', email: 'coach.football@iitism.ac.in' },
  { role: 'GROUND_STAFF', email: 'ground@iitism.ac.in' },
  { role: 'EQUIPMENT_MANAGER', email: 'equipment@iitism.ac.in' },
  { role: 'SECURITY_STAFF', email: 'security@iitism.ac.in' },
  { role: 'OPERATIONS_STAFF', email: 'operations@iitism.ac.in' },
  { role: 'SPORTS_COUNCIL', email: 'council@iitism.ac.in' },
  { role: 'SPORT_COORDINATOR', email: 'coord.cricket@iitism.ac.in' },
  { role: 'HOSTEL_SECRETARY', email: 'hostelsec.jasper@iitism.ac.in' },
  { role: 'MEDIA_NOMINEE', email: 'media@iitism.ac.in' },
  { role: 'CLUB_MEMBER', email: '22je0143@iitism.ac.in' },
  { role: 'STUDENT', email: 'student@iitism.ac.in' },
];

function nextPath(): string {
  if (typeof window === 'undefined') return '/dashboard';
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/dashboard';
}

export default function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace(nextPath());
  }, [status, router]);

  async function signIn(e: string, p: string) {
    setBusy(true);
    setError(null);
    try {
      await login(e.trim(), p);
      router.replace(nextPath());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn(email, password);
  }

  return (
    <AuthLayout>
      <h2 className="text-2xl font-bold text-text">Sign in</h2>
      <p className="mt-1 text-sm text-text-2">Use your institute email to access SportsOS.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {error && <Notice tone="red">{error}</Notice>}
        <Field label="Institute email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="22je0143@iitism.ac.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={<LogIn className="size-4" />}>
          Sign in
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-text-2">
        New student?{' '}
        <Link href="/register" className="font-medium text-accent-ink hover:underline">
          Create an account
        </Link>
      </p>

      <div className="mt-8 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-text">Demo accounts</h3>
          <span className="text-[11px] text-muted">
            password <code className="rounded bg-surface-2 px-1 py-0.5">{DEMO_PASSWORD}</code>
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">One per stakeholder role — click to sign in as that role.</p>
        <div className="mt-3 grid max-h-64 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              disabled={busy}
              onClick={() => {
                setEmail(a.email);
                setPassword(DEMO_PASSWORD);
                void signIn(a.email, DEMO_PASSWORD);
              }}
              className="rounded-lg border border-transparent px-2.5 py-1.5 text-left transition-colors hover:border-border hover:bg-surface-2 disabled:opacity-50"
            >
              <span className="block truncate text-xs font-semibold text-text">{roleLabel(a.role)}</span>
              <span className="block truncate text-[11px] text-muted">{a.email}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
