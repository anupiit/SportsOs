'use client';

import type { Match, Team, Tournament } from '@sportsos/shared';
import { ArrowLeft, Check, Crown, Shuffle, Trash2, Trophy, UserPlus, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useAuth, useUser } from '@/components/auth';
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

/**
 * editable: event.manage_participants (any team). registerHostels: hostels a
 * Hostel Sports Secretary may register for (event.register_team); the API enforces both.
 */
function TeamsCard({ tournament, editable, registerHostels, onChanged }: { tournament: Tournament; editable: boolean; registerHostels: string[]; onChanged: () => void }) {
  const toast = useToast();
  const me = useUser();
  const [name, setName] = useState('');
  const [hostel, setHostel] = useState(editable ? '' : (registerHostels[0] ?? ''));
  const [player, setPlayer] = useState<Record<string, string>>({});
  const canAdd = editable || registerHostels.length > 0;
  const controls = (t: Team) => editable || (t.registeredById === me.id && !!t.hostel && registerHostels.some((h) => h.toLowerCase() === t.hostel!.toLowerCase()));

  async function addPlayer(t: Team) {
    const student = (player[t.id] ?? '').trim();
    if (student.length < 3) return toast.warning('Enter the player’s email or admission number');
    try {
      await api.post(`/tournaments/${tournament.id}/teams/${t.id}/members`, { student });
      setPlayer((p) => ({ ...p, [t.id]: '' }));
      toast.success('Player registered');
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  async function removePlayer(t: Team, memberId: string) {
    try {
      await api.del(`/tournaments/${tournament.id}/teams/${t.id}/members/${memberId}`);
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }
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
    if (!window.confirm(`Remove ${t.name} and its players from this tournament?`)) return;
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
        {canAdd && (
          <form onSubmit={add} className="mb-4 space-y-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" aria-label="Team name" />
            <div className="flex gap-2">
              {editable ? (
                <>
                  <Input value={hostel} onChange={(e) => setHostel(e.target.value)} list="hostel-suggestions" placeholder="Hostel (optional)" aria-label="Hostel" className="flex-1" />
                  <datalist id="hostel-suggestions">
                    {HOSTELS.map((h) => (
                      <option key={h} value={h} />
                    ))}
                  </datalist>
                </>
              ) : (
                <Select value={hostel} onChange={(e) => setHostel(e.target.value)} aria-label="Your hostel" className="flex-1">
                  {registerHostels.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </Select>
              )}
              {editable && <Input type="number" min={1} value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Seed" aria-label="Seed" className="w-20" />}
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
              <li key={t.id} className="py-2">
                <div className="flex items-center gap-2">
                <span className="w-6 text-right text-xs text-muted tabular">{t.seed ?? '–'}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-text">{t.name}</span>
                {t.hostel && <Badge tone="neutral">{t.hostel}</Badge>}
                {controls(t) && tournament.status === 'DRAFT' && (
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
                </div>
                {(t.members?.length ?? 0) > 0 && (
                  <ul className="mt-1 ml-8 space-y-0.5">
                    {t.members!.map((m) => (
                      <li key={m.id} className="flex items-center gap-1 text-xs text-text-2">
                        {m.user?.name ?? 'Player'}
                        {controls(t) && tournament.status === 'DRAFT' && (
                          <button type="button" aria-label="Remove player" onClick={() => removePlayer(t, m.id)} className="rounded p-0.5 text-muted hover:text-danger-ink">
                            <X className="size-3" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {controls(t) && tournament.status === 'DRAFT' && (
                  <div className="mt-1 ml-8 flex gap-1">
                    <Input value={player[t.id] ?? ''} onChange={(e) => setPlayer((p) => ({ ...p, [t.id]: e.target.value }))} placeholder="Player email or admission no." aria-label={`Add player to ${t.name}`} className="h-7 text-xs" />
                    <Button size="sm" variant="ghost" icon={<UserPlus className="size-3.5" />} onClick={() => addPlayer(t)}>
                      Add
                    </Button>
                  </div>
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
  const { can, roles } = useAuth();
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

  const manage = can('event.manage_participants');
  const publish = can('event.publish');
  const registerHostels = roles.filter((r) => r.role === 'HOSTEL_SECRETARY' && r.scopeType === 'HOSTEL' && r.scopeId).map((r) => r.scopeId);
  const score = can('event.record_results');
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
          publish &&
          draft && (
            <Button variant="primary" icon={<Shuffle className="size-4" />} disabled={(t.teams?.length ?? 0) < 2} onClick={() => setGenerating(true)}>
              Generate fixtures
            </Button>
          )
        }
      />

      {(t.status === 'PROPOSED' || t.status === 'REJECTED') && <ProposalBanner tournament={t} onDone={() => mutate()} />}

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
          <TeamsCard tournament={t} editable={manage && draft} registerHostels={draft && can('event.register_team') ? registerHostels : []} onChanged={() => mutate()} />
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

function ProposalBanner({ tournament, onDone }: { tournament: Tournament; onDone: () => void }) {
  const { can } = useAuth();
  const me = useUser();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const reviewer = can('event.approve') && tournament.organizerId !== me.id;

  async function review(approve: boolean) {
    const note = window.prompt(approve ? 'Approval note (optional)' : 'Why is this proposal declined?');
    if (note === null || (!approve && note.trim().length < 3)) return;
    setBusy(true);
    try {
      await api.post(`/tournaments/${tournament.id}/${approve ? 'approve' : 'reject'}`, note.trim() ? { note: note.trim() } : {});
      toast.success(approve ? 'Proposal approved — registration is open' : 'Proposal declined');
      await revalidate('/tournaments');
      onDone();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-warn-soft px-4 py-3 text-sm text-warn-ink">
      <span className="flex-1">
        {tournament.status === 'PROPOSED'
          ? 'This tournament is a proposal awaiting approval by the Sports Officer, President SPEC or Dean (SW). Teams cannot register yet.'
          : `This proposal was declined${tournament.reviewNote ? `: ${tournament.reviewNote}` : '.'}`}
      </span>
      {tournament.status === 'PROPOSED' && reviewer && (
        <>
          <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} loading={busy} onClick={() => review(true)}>
            Approve
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => review(false)}>
            Decline
          </Button>
        </>
      )}
    </div>
  );
}
