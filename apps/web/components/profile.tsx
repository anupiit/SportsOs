'use client';

import type { Achievement, AchievementLevel, Club, User } from '@sportsos/shared';
import { roleLabel } from '@sportsos/shared';
import { Award, BadgeCheck, CalendarCheck, Medal, Plus, ShieldCheck, Trophy, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/components/auth';
import { useToast } from '@/components/toast';
import {
  Avatar,
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
  Select,
  Skeleton,
  StatTile,
} from '@/components/ui';
import { api } from '@/lib/api';
import { ACHIEVEMENT_LEVEL_LABEL, SPORTS } from '@/lib/constants';
import { fmtDate, fmtNumber, todayIST } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

interface Profile {
  user: User;
  stats: { checkIns: number; bookings: number; tournaments: number };
  achievements: Achievement[];
  clubs: Club[];
}

function AddAchievementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', sport: SPORTS[0], level: 'INSTITUTE' as AchievementLevel, position: '', date: todayIST() });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (form.title.trim().length < 3) return toast.warning('Title needs at least 3 characters');
    setBusy(true);
    try {
      await api.post('/achievements', {
        title: form.title.trim(),
        sport: form.sport,
        level: form.level,
        position: form.position.trim() || undefined,
        date: new Date(`${form.date}T12:00:00+05:30`).toISOString(),
      });
      toast.success('Achievement submitted', 'A coach or the Sports Office will verify it.');
      setForm((f) => ({ ...f, title: '', position: '' }));
      await revalidate('/users', '/achievements');
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add an achievement"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Submit for verification
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="a-title" required className="sm:col-span-2">
          <Input id="a-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Inter-IIT Sports Meet — Athletics 400 m" />
        </Field>
        <Field label="Sport" htmlFor="a-sport">
          <Select id="a-sport" value={form.sport} onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value }))}>
            {SPORTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Level" htmlFor="a-level">
          <Select id="a-level" value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as AchievementLevel }))}>
            {(Object.keys(ACHIEVEMENT_LEVEL_LABEL) as AchievementLevel[]).map((l) => (
              <option key={l} value={l}>
                {ACHIEVEMENT_LEVEL_LABEL[l]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Position / result" htmlFor="a-pos">
          <Input id="a-pos" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} placeholder="Gold, Runner-up, Top 8…" />
        </Field>
        <Field label="Date" htmlFor="a-date">
          <Input id="a-date" type="date" value={form.date} max={todayIST()} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  );
}

export function AchievementList({ items, canVerify, showOwner }: { items: Achievement[]; canVerify: boolean; showOwner?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function verify(a: Achievement) {
    setBusy(a.id);
    try {
      await api.post(`/achievements/${a.id}/verify`);
      toast.success('Achievement verified', a.title);
      await revalidate('/users', '/achievements');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  if (!items.length) return <EmptyState icon={<Medal className="size-5" />} title="No achievements yet" className="py-6" />;
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => (
        <li key={a.id} className="flex items-center gap-3 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn-ink">
            <Award className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">{a.title}</p>
            <p className="text-xs text-muted">
              {showOwner && a.user ? (
                <>
                  <Link href={`/users/${a.userId}`} className="hover:text-accent-ink">
                    {a.user.name}
                  </Link>{' '}
                  ·{' '}
                </>
              ) : null}
              {a.sport} · {ACHIEVEMENT_LEVEL_LABEL[a.level]}
              {a.position ? ` · ${a.position}` : ''} · {fmtDate(a.date)}
            </p>
          </div>
          {a.verified ? (
            <Badge tone="green" icon={<BadgeCheck className="size-3" />}>
              Verified
            </Badge>
          ) : canVerify ? (
            <Button size="sm" variant="accent" loading={busy === a.id} onClick={() => verify(a)}>
              Verify
            </Button>
          ) : (
            <Badge tone="amber">Pending</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProfileView({ userId, self }: { userId: string; self: boolean }) {
  const { can } = useAuth();
  const { data, error, isLoading, mutate } = useApi<Profile>(`/users/${userId}/profile`);
  const [adding, setAdding] = useState(false);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading || !data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );

  const { user, stats, achievements, clubs } = data;
  const canVerify = can('achievement.verify') && !self;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-5 p-5">
          <Avatar name={user.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-text">{user.name}</h1>
            <p className="text-sm text-text-2">{user.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="navy">{roleLabel(user.role)}</Badge>
              {user.admissionNo && <Badge tone="neutral">{user.admissionNo}</Badge>}
              {user.hostel && <Badge tone="neutral">{user.hostel} Hostel</Badge>}
              {!user.isActive && <Badge tone="red">Deactivated</Badge>}
            </div>
          </div>
          <p className="text-xs text-muted">Member since {fmtDate(user.createdAt)}</p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Verified check-ins" value={fmtNumber(stats.checkIns)} icon={<ShieldCheck className="size-4" />} />
        <StatTile label="Bookings" value={fmtNumber(stats.bookings)} icon={<CalendarCheck className="size-4" />} />
        <StatTile label="Tournaments" value={fmtNumber(stats.tournaments)} icon={<Trophy className="size-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Clubs" icon={<Users className="size-4" />} />
          <CardBody>
            {!clubs.length ? (
              <EmptyState
                title="Not in any club"
                className="py-6"
                action={
                  self ? (
                    <Link href="/clubs">
                      <Button size="sm">Browse clubs</Button>
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <ul className="space-y-2">
                {clubs.map((c) => (
                  <li key={c.id}>
                    <Link href={`/clubs/${c.id}`} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-surface-2">
                      <span className="text-sm font-medium text-text">{c.name}</span>
                      <span className="text-xs text-muted">{c.sport}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader
            title="Achievements"
            icon={<Medal className="size-4" />}
            actions={
              self && (
                <Button size="sm" variant="accent" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
                  Add
                </Button>
              )
            }
          />
          <CardBody>
            <AchievementList items={achievements} canVerify={canVerify} />
          </CardBody>
        </Card>
      </div>
      {self && <AddAchievementModal open={adding} onClose={() => setAdding(false)} />}
    </div>
  );
}
