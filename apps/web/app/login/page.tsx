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
/** The synthetic-account panel is for demos only; set NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false in production. */
const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS !== 'false';

const DEMO_ACCOUNTS: { role: Role; email: string }[] = [
  { role: 'ADMIN', email: 'admin@sportsos.demo' },
  { role: 'DIRECTOR', email: 'director@sportsos.demo' },
  { role: 'DEAN_SW', email: 'dean.sw@sportsos.demo' },
  { role: 'SPEC_PRESIDENT', email: 'spec.president@sportsos.demo' },
  { role: 'SPORTS_OFFICER', email: 'peso@sportsos.demo' },
  { role: 'GENERAL_SECRETARY', email: 'gsec.sports@sportsos.demo' },
  { role: 'EVENT_COMMITTEE', email: 'events@sportsos.demo' },
  { role: 'COACH', email: 'coach.football@sportsos.demo' },
  { role: 'GROUND_STAFF', email: 'ground@sportsos.demo' },
  { role: 'EQUIPMENT_MANAGER', email: 'equipment@sportsos.demo' },
  { role: 'SECURITY_STAFF', email: 'security@sportsos.demo' },
  { role: 'OPERATIONS_STAFF', email: 'operations@sportsos.demo' },
  { role: 'SPORTS_COUNCIL', email: 'council@sportsos.demo' },
  { role: 'SPORT_COORDINATOR', email: 'coord.cricket@sportsos.demo' },
  { role: 'HOSTEL_SECRETARY', email: 'hostelsec.a@sportsos.demo' },
  { role: 'MEDIA_NOMINEE', email: 'media@sportsos.demo' },
  { role: 'CLUB_MEMBER', email: 'club.member@sportsos.demo' },
  { role: 'STUDENT', email: 'student@sportsos.demo' },
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
            placeholder="you@iitism.ac.in"
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

      {SHOW_DEMO && (
      <div className="mt-8 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-text">Demo accounts (synthetic data)</h3>
          <span className="text-[11px] text-muted">
            password <code className="rounded bg-surface-2 px-1 py-0.5">{DEMO_PASSWORD}</code>
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">One synthetic account per role, for a seeded DEMO database only. These are not real IIT (ISM) people.</p>
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
      )}
    </AuthLayout>
  );
}
