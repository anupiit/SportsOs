'use client';

import type { Match, Team, Tournament } from '@sportsos/shared';
import { ArrowLeft, Crown, Shuffle, Trash2, Trophy, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth';
import { Bracket, Fixtures, ScoreModal, StandingsTable } from '@/components/events';
import { TournamentStatusBadge } from '@/components/status';
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
  PageHeader,
  Select,
  Skeleton,
} from '@/components/ui';
import { api } from '@/lib/api';
import { HOSTELS } from '@/lib/constants';
import { fmtDate, fromLocalInput, toLocalInput } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

function TeamsCard({ tournament, editable, onChanged }: { tournament: Tournament; editable: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [hostel, setHostel] = useState('');
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const teams = [...(tournament.teams ?? [])].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || a.name.localeCompare(b.name));

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post<Team>(`/tournaments/${tournament.id}/teams`, {
        name: name.trim(),
        hostel: hostel || undefined,
        seed: seed ? Number(seed) : undefined,
      });
      setName('');
      setSeed('');
      onChanged();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: Team) {
    setRemoving(t.id);
    try {
      await api.del(`/tournaments/${tournament.id}/teams/${t.id}`);
      onChanged();
    } catch (err) {
      toast.error(err);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card>
      <CardHeader title="Teams" description={`${teams.length} registered`} icon={<Users className="size-4" />} />
      <CardBody>
        {editable && (
          <form onSubmit={add} className="mb-4 space-y-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name, e.g. Jasper Hostel" aria-label="Team name" />
            <div className="flex gap-2">
              <Select value={hostel} onChange={(e) => setHostel(e.target.value)} aria-label="Hostel" className="flex-1">
                <option value="">Hostel (optional)</option>
                {HOSTELS.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </Select>
              <Input type="number" min={1} value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Seed" aria-label="Seed" className="w-20" />
              <Button type="submit" variant="accent" loading={busy}>
                Add
              </Button>
            </div>
            <p className="text-[11px] text-muted">Seeds are optional; top seeds receive byes when the field isn&apos;t a power of two.</p>
          </form>
        )}
        {!teams.length ? (
          <EmptyState title="No teams yet" className="py-6" />
        ) : (
          <ul className="divide-y divide-border">
            {teams.map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-2">
                <span className="w-6 text-right text-xs text-muted tabular">{t.seed ?? '–'}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-text">{t.name}</span>
                {t.hostel && <Badge tone="neutral">{t.hostel}</Badge>}
                {editable && (
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    disabled={removing === t.id}
                    className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger-ink disabled:opacity-50"
                    aria-label={`Remove ${t.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function GenerateModal({ tournament, open, onClose, onDone }: { tournament: Tournament; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [startAt, setStartAt] = useState(() => {
    const d = new Date(tournament.startDate);
    if (d.getTime() < Date.now()) d.setTime(Date.now() + 86400000);
    d.setHours(16, 0, 0, 0);
    return toLocalInput(d);
  });
  const [matchMinutes, setMatchMinutes] = useState('60');
  const [busy, setBusy] = useState(false);
  const n = tournament.teams?.length ?? 0;
  const knockout = tournament.format === 'SINGLE_ELIMINATION';
  const size = 2 ** Math.ceil(Math.log2(Math.max(n, 2)));
  const matchesCount = knockout ? n - 1 : (n * (n - 1)) / 2;

  async function generate() {
    setBusy(true);
    try {
      await api.post(`/tournaments/${tournament.id}/generate`, {
        startAt: startAt ? fromLocalInput(startAt) : undefined,
        matchMinutes: Number(matchMinutes),
      });
      toast.success('Fixtures generated', `${matchesCount} matches scheduled`);
      await revalidate('/tournaments', '/analytics');
      onDone();
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
      title="Generate fixtures"
      description="Locks the team list and starts the tournament."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={generate} icon={<Shuffle className="size-4" />}>
            Generate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-2 px-3.5 py-3 text-sm text-text-2">
          {knockout ? (
            <>
              {n} teams → a {size}-slot seeded bracket with {size - n} bye{size - n === 1 ? '' : 's'} for the top seeds and {matchesCount} matches.
            </>
          ) : (
            <>
              {n} teams → circle-method round robin: {n % 2 === 0 ? n - 1 : n} matchdays, {matchesCount} matches; every team meets every other once.
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="First match" htmlFor="g-start">
            <Input id="g-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </Field>
          <Field label="Slot per match" htmlFor="g-min">
            <Select id="g-min" value={matchMinutes} onChange={(e) => setMatchMinutes(e.target.value)}>
              {[30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const { data: t, error, isLoading, mutate } = useApi<Tournament>(`/tournaments/${id}`, undefined, { refreshInterval: 20000 });
  const [editing, setEditing] = useState<Match | null>(null);
  const [generating, setGenerating] = useState(false);

  const back = (
    <Link href="/events" className="mb-3 inline-flex items-center gap-1 text-sm text-text-2 hover:text-text">
      <ArrowLeft className="size-4" /> All tournaments
    </Link>
  );

  if (error)
    return (
      <div>
        {back}
        <ErrorState error={error} onRetry={() => mutate()} />
      </div>
    );
  if (isLoading || !t)
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );

  const manage = can('events:manage');
  const score = can('events:score');
  const draft = t.status === 'DRAFT';
  const champion = t.championId ? t.teams?.find((x) => x.id === t.championId) : null;
  const matches = t.matches ?? [];
  const knockout = t.format === 'SINGLE_ELIMINATION';

  return (
    <div>
      {back}
      <PageHeader
        eyebrow={`${t.sport} · ${knockout ? 'Knockout' : 'Round robin'}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t.name} <TournamentStatusBadge status={t.status} />
          </span>
        }
        description={t.description ?? `Starts ${fmtDate(t.startDate)}`}
        actions={
          manage &&
          draft && (
            <Button variant="primary" icon={<Shuffle className="size-4" />} disabled={(t.teams?.length ?? 0) < 2} onClick={() => setGenerating(true)}>
              Generate fixtures
            </Button>
          )
        }
      />

      {t.status === 'COMPLETED' && champion && (
        <div className="mb-6 flex items-center gap-4 rounded-2xl bg-primary px-6 py-5 text-primary-fg">
          <span className="flex size-12 items-center justify-center rounded-full bg-white/15">
            <Crown className="size-6 text-[#e9a58f]" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-widest text-white/70 uppercase">Champion</p>
            <p className="text-2xl font-bold">{champion.name}</p>
            {champion.hostel && <p className="text-sm text-white/75">{champion.hostel} Hostel</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className="xl:col-span-1">
          <TeamsCard tournament={t} editable={manage && draft} onChanged={() => mutate()} />
        </div>
        <div className="space-y-6 xl:col-span-3">
          {!matches.length ? (
            <Card>
              <EmptyState
                icon={<Trophy className="size-5" />}
                title="Fixtures not generated yet"
                description={
                  manage ? 'Add at least two teams, then generate the bracket or league.' : 'The organisers will publish fixtures soon.'
                }
              />
            </Card>
          ) : knockout ? (
            <Card>
              <CardHeader
                title="Bracket"
                description={score ? 'Click a match to enter the score — winners advance automatically.' : 'Live knockout bracket'}
              />
              <CardBody>
                <Bracket matches={matches} canScore={score} onEdit={setEditing} />
              </CardBody>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader title="Standings" description="3 points for a win, 1 for a draw; ties broken by score difference" />
                <CardBody>
                  <StandingsTable rows={t.standings ?? []} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Fixtures" />
                <CardBody>
                  <Fixtures matches={matches} canScore={score} onEdit={setEditing} />
                </CardBody>
              </Card>
            </>
          )}
        </div>
      </div>

      <ScoreModal match={editing} format={t.format} onClose={() => setEditing(null)} onSaved={() => mutate()} />
      {draft && <GenerateModal tournament={t} open={generating} onClose={() => setGenerating(false)} onDone={() => mutate()} />}
    </div>
  );
}
