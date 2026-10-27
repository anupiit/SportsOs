'use client';

import type { Club, ClubMembership, User } from '@sportsos/shared';
import { Plus, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth, useUser } from '@/components/auth';
import { MembershipBadge } from '@/components/status';
import { useToast } from '@/components/toast';
import { Badge, Button, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { SPORTS } from '@/lib/constants';
import { revalidate, useApi } from '@/lib/hooks';

function CreateClubModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: coaches } = useApi<User[]>(open && can('users:read') ? '/users' : null, { role: 'COACH' });
  const [form, setForm] = useState({ name: '', sport: SPORTS[0], description: '', coachId: '' });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.name.trim()) return toast.warning('Club name is required');
    setBusy(true);
    try {
      await api.post('/clubs', {
        name: form.name.trim(),
        sport: form.sport,
        description: form.description.trim() || undefined,
        coachId: form.coachId || undefined,
      });
      toast.success('Club created', form.name);
      setForm({ name: '', sport: SPORTS[0], description: '', coachId: '' });
      await revalidate('/clubs');
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
      title="New club"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Create club
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Club name" htmlFor="club-name" required>
          <Input id="club-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Sport" htmlFor="club-sport">
          <Select id="club-sport" value={form.sport} onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value }))}>
            {SPORTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Coach" htmlFor="club-coach" hint="Coaches run verified-attendance sessions for the club">
          <Select id="club-coach" value={form.coachId} onChange={(e) => setForm((f) => ({ ...f, coachId: e.target.value }))}>
            <option value="">No coach assigned</option>
            {(coaches ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" htmlFor="club-desc">
          <Textarea id="club-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  );
}

export default function ClubsPage() {
  const { can } = useAuth();
  const user = useUser();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<Club[]>('/clubs');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  async function join(club: Club) {
    setJoining(club.id);
    try {
      await api.post<ClubMembership>(`/clubs/${club.id}/join`);
      toast.success('Request sent', `The ${club.name} roster managers will review it.`);
      await revalidate('/clubs');
    } catch (err) {
      toast.error(err);
    } finally {
      setJoining(null);
    }
  }

  const mine = (data ?? []).filter((c) => c.myMembership?.status === 'ACTIVE' || c.coachId === user.id);

  return (
    <div>
      <PageHeader
        eyebrow="Asset & Club Hub"
        title="Clubs"
        description="Join a club for representational access: practice sessions, verified attendance and tournament rosters."
        actions={
          can('clubs:manage') && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New club
            </Button>
          )
        }
      />

      {mine.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-text-2">
          <span className="font-medium">Your clubs:</span>
          {mine.map((c) => (
            <Link key={c.id} href={`/clubs/${c.id}`}>
              <Badge tone="blue">{c.name}</Badge>
            </Link>
          ))}
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : !data?.length ? (
        <div className="card">
          <EmptyState icon={<Users className="size-5" />} title="No clubs yet" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((club) => {
            const m = club.myMembership;
            const canJoin = (!m || m.status === 'LEFT' || m.status === 'REJECTED') && club.coachId !== user.id;
            return (
              <article key={club.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">{club.sport}</p>
                    <h2 className="truncate text-base font-semibold text-text">{club.name}</h2>
                  </div>
                  {m && <MembershipBadge status={m.status} />}
                  {club.coachId === user.id && <Badge tone="navy">You coach</Badge>}
                </div>
                {club.description && <p className="mt-2 line-clamp-2 text-sm text-text-2">{club.description}</p>}
                <dl className="mt-4 flex gap-6 text-xs">
                  <div>
                    <dt className="text-muted">Members</dt>
                    <dd className="mt-0.5 text-base font-semibold text-text">{club.memberCount}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted">Coach</dt>
                    <dd className="mt-0.5 truncate font-medium text-text">{club.coach?.name ?? 'Unassigned'}</dd>
                  </div>
                </dl>
                <div className="mt-auto flex gap-2 pt-4">
                  <Link href={`/clubs/${club.id}`} className="flex-1">
                    <Button className="w-full">View roster</Button>
                  </Link>
                  {canJoin && (
                    <Button
                      variant="accent"
                      icon={<UserPlus className="size-3.5" />}
                      loading={joining === club.id}
                      onClick={() => join(club)}
                    >
                      Join
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <CreateClubModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
