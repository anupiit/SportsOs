'use client';

import type { Facility, Tournament, TournamentFormat } from '@sportsos/shared';
import { Crown, Plus, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/components/auth';
import { TournamentStatusBadge } from '@/components/status';
import { useToast } from '@/components/toast';
import { Badge, Button, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Segmented, Select, Skeleton, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { SPORTS } from '@/lib/constants';
import { fmtDate, todayIST } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

function CreateTournamentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { data: facilities } = useApi<Facility[]>(open ? '/facilities' : null);
  const [form, setForm] = useState({
    name: '',
    sport: 'Football',
    format: 'SINGLE_ELIMINATION' as TournamentFormat,
    startDate: todayIST(7),
    description: '',
    facilityId: '',
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (form.name.trim().length < 3) return toast.warning('Tournament name needs at least 3 characters');
    setBusy(true);
    try {
      const t = await api.post<Tournament>('/tournaments', {
        name: form.name.trim(),
        sport: form.sport,
        format: form.format,
        startDate: new Date(`${form.startDate}T09:00:00+05:30`).toISOString(),
        description: form.description.trim() || undefined,
        facilityId: form.facilityId || undefined,
      });
      toast.success('Tournament created', 'Add teams, then generate fixtures.');
      await revalidate('/tournaments');
      onClose();
      window.location.href = `/events/${t.id}`;
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
      title="New tournament"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="t-name" required>
          <Input id="t-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Inter-Hostel Football Cup 2026" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sport" htmlFor="t-sport">
            <Select id="t-sport" value={form.sport} onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value }))}>
              {SPORTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Starts" htmlFor="t-start">
            <Input id="t-start" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          </Field>
        </div>
        <Field label="Format">
          <Segmented<TournamentFormat>
            ariaLabel="Format"
            value={form.format}
            onChange={(v) => setForm((f) => ({ ...f, format: v }))}
            options={[
              { value: 'SINGLE_ELIMINATION', label: 'Knockout bracket' },
              { value: 'ROUND_ROBIN', label: 'Round robin (league)' },
            ]}
          />
        </Field>
        <Field label="Venue" htmlFor="t-venue">
          <Select id="t-venue" value={form.facilityId} onChange={(e) => setForm((f) => ({ ...f, facilityId: e.target.value }))}>
            <option value="">Decide later</option>
            {(facilities ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" htmlFor="t-desc">
          <Textarea id="t-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  );
}

export default function EventsPage() {
  const { can } = useAuth();
  const { data, error, isLoading, mutate } = useApi<Tournament[]>('/tournaments');
  const [creating, setCreating] = useState(false);
  const sorted = [...(data ?? [])].sort((a, b) => {
    const order = { ONGOING: 0, DRAFT: 1, COMPLETED: 2 };
    return order[a.status] - order[b.status] || b.startDate.localeCompare(a.startDate);
  });

  return (
    <div>
      <PageHeader
        eyebrow="Intelligent automation"
        title="Tournaments"
        description="Inter-hostel and institute events with seeded brackets, round-robin leagues and live results."
        actions={
          can('events:manage') && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New tournament
            </Button>
          )
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : !sorted.length ? (
        <div className="card">
          <EmptyState icon={<Trophy className="size-5" />} title="No tournaments yet" description="Event Committee members can create one." />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((t) => (
            <Link key={t.id} href={`/events/${t.id}`} className="card flex flex-col p-5 transition-colors hover:border-accent">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">{t.sport}</p>
                <TournamentStatusBadge status={t.status} />
              </div>
              <h2 className="mt-1 text-base font-semibold text-text">{t.name}</h2>
              {t.description && <p className="mt-1 line-clamp-2 text-sm text-text-2">{t.description}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs text-muted">
                <Badge tone="neutral">{t.format === 'SINGLE_ELIMINATION' ? 'Knockout' : 'Round robin'}</Badge>
                <span>{t.teamCount} teams</span>
                <span>· starts {fmtDate(t.startDate)}</span>
              </div>
              {t.status === 'COMPLETED' && t.championId && (
                <p className="mt-2 flex items-center gap-1 text-xs font-medium text-warn-ink">
                  <Crown className="size-3.5" /> Champion decided
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
      <CreateTournamentModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
