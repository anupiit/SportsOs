'use client';

import type { Match, MatchStatus, StandingRow, Team, TournamentFormat } from '@sportsos/shared';
import clsx from 'clsx';
import { Pencil } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MatchStatusBadge } from '@/components/status';
import { useToast } from '@/components/toast';
import { Button, Field, Input, Modal, Notice, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime, fromLocalInput, toLocalInput } from '@/lib/format';
import { revalidate } from '@/lib/hooks';

export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-finals';
  if (fromEnd === 2) return 'Quarter-finals';
  return `Round ${round}`;
}

// ---------------------------------------------------------------- score entry

export function ScoreModal({
  match,
  format,
  onClose,
  onSaved,
}: {
  match: Match | null;
  format: TournamentFormat;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [status, setStatus] = useState<MatchStatus>('SCHEDULED');
  const [scheduledAt, setScheduledAt] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!match) return;
    setHome(match.homeScore?.toString() ?? '');
    setAway(match.awayScore?.toString() ?? '');
    setStatus(match.status === 'BYE' ? 'SCHEDULED' : match.status);
    setScheduledAt(match.scheduledAt ? toLocalInput(new Date(match.scheduledAt)) : '');
  }, [match]);

  const tie = home !== '' && away !== '' && Number(home) === Number(away);

  async function save() {
    if (!match) return;
    if (status === 'COMPLETED' && (home === '' || away === '')) return toast.warning('Enter both scores to complete the match');
    if (status === 'COMPLETED' && format === 'SINGLE_ELIMINATION' && tie)
      return toast.warning('Knockout matches need a winner', 'Record the tie-break (e.g. penalties) in the score.');
    setBusy(true);
    try {
      await api.patch(`/matches/${match.id}`, {
        homeScore: home === '' ? undefined : Number(home),
        awayScore: away === '' ? undefined : Number(away),
        status,
        scheduledAt: scheduledAt ? fromLocalInput(scheduledAt) : undefined,
      });
      toast.success(status === 'COMPLETED' ? 'Result recorded' : 'Match updated');
      await revalidate('/tournaments', '/analytics');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!match}
      onClose={onClose}
      title="Update match"
      description={match ? `${match.homeTeam?.name ?? 'TBD'} vs ${match.awayTeam?.name ?? 'TBD'}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {match && (
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <Field label={match.homeTeam?.name ?? 'Home'} htmlFor="sc-home">
              <Input id="sc-home" type="number" min={0} value={home} onChange={(e) => setHome(e.target.value)} className="h-12 text-center text-xl font-semibold" />
            </Field>
            <span className="pb-3 text-sm font-semibold text-muted">vs</span>
            <Field label={match.awayTeam?.name ?? 'Away'} htmlFor="sc-away">
              <Input id="sc-away" type="number" min={0} value={away} onChange={(e) => setAway(e.target.value)} className="h-12 text-center text-xl font-semibold" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status" htmlFor="sc-status">
              <Select id="sc-status" value={status} onChange={(e) => setStatus(e.target.value as MatchStatus)}>
                <option value="SCHEDULED">Scheduled</option>
                <option value="LIVE">Live</option>
                <option value="COMPLETED">Completed</option>
              </Select>
            </Field>
            <Field label="Kick-off" htmlFor="sc-time">
              <Input id="sc-time" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </Field>
          </div>
          {status === 'COMPLETED' && format === 'SINGLE_ELIMINATION' && (
            <Notice tone="blue">Completing a knockout match advances the winner to the next round automatically.</Notice>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- bracket

const CARD_W = 208;
const CARD_H = 82; // 16px label + 2px gap + 63px team box
const BOX_CENTER = 18 + 32; // offset from card top to the middle of the team box
const SLOT = CARD_H + 18;
const GAP_X = 52;
const HEADER = 32;

function TeamLine({
  team,
  score,
  isWinner,
  isLoser,
  placeholder,
}: {
  team: Team | null | undefined;
  score: number | null;
  isWinner: boolean;
  isLoser: boolean;
  placeholder: string;
}) {
  return (
    <div
      className={clsx(
        'flex h-[30px] items-center justify-between gap-2 px-2.5 text-[13px]',
        isWinner && 'bg-accent-soft font-semibold text-text shadow-[inset_3px_0_0_var(--accent)]',
        isLoser && 'text-muted',
        !team && 'text-muted italic',
      )}
    >
      <span className="truncate">
        {team ? team.name : placeholder}
        {team?.seed ? <span className="ml-1 text-[10px] text-muted not-italic">({team.seed})</span> : null}
      </span>
      <span className="tabular">{score ?? ''}</span>
    </div>
  );
}

export function Bracket({ matches, canScore, onEdit }: { matches: Match[]; canScore: boolean; onEdit: (m: Match) => void }) {
  const layout = useMemo(() => {
    const rounds = Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b);
    const byRound = rounds.map((r) => matches.filter((m) => m.round === r).sort((a, b) => a.position - b.position));
    const pos = new Map<string, { x: number; y: number }>();
    byRound.forEach((list, ri) => {
      list.forEach((m, i) => {
        const feeders = ri > 0 ? byRound[ri - 1].filter((f) => f.nextMatchId === m.id) : [];
        const y =
          feeders.length > 0 && feeders.every((f) => pos.has(f.id))
            ? feeders.reduce((sum, f) => sum + pos.get(f.id)!.y, 0) / feeders.length
            : (i + 0.5) * SLOT * 2 ** ri;
        pos.set(m.id, { x: ri * (CARD_W + GAP_X), y: y + HEADER });
      });
    });
    const maxY = Math.max(...Array.from(pos.values()).map((p) => p.y), 0);
    const height = Math.max(maxY + (CARD_H - BOX_CENTER) + 8, (byRound[0]?.length ?? 1) * SLOT + HEADER);
    const width = rounds.length * (CARD_W + GAP_X) - GAP_X;
    return { rounds, byRound, pos, height, width };
  }, [matches]);

  const { rounds, byRound, pos, height, width } = layout;
  const total = rounds.length ? rounds[rounds.length - 1] : 0;

  return (
    <div className="overflow-x-auto pb-2">
      <div className="relative" style={{ width, height }}>
        <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
          {matches.map((m) => {
            if (!m.nextMatchId) return null;
            const a = pos.get(m.id);
            const b = pos.get(m.nextMatchId);
            if (!a || !b) return null;
            const x1 = a.x + CARD_W;
            const xm = x1 + GAP_X / 2;
            const x2 = b.x;
            const decided = !!m.winnerId;
            return (
              <path
                key={m.id}
                d={`M${x1},${a.y} H${xm} V${b.y} H${x2}`}
                fill="none"
                stroke={decided ? 'var(--accent)' : 'var(--border-strong)'}
                strokeWidth={decided ? 2 : 1}
              />
            );
          })}
        </svg>
        {rounds.map((r, ri) => (
          <div
            key={r}
            className="absolute top-0 text-xs font-semibold tracking-wider text-muted uppercase"
            style={{ left: ri * (CARD_W + GAP_X), width: CARD_W }}
          >
            {roundName(r, total)}
          </div>
        ))}
        {byRound.flat().map((m) => {
          const p = pos.get(m.id)!;
          const bye = m.status === 'BYE';
          const editable = canScore && !bye && !!m.homeTeamId && !!m.awayTeamId;
          const homeWin = !!m.winnerId && m.winnerId === m.homeTeamId;
          const awayWin = !!m.winnerId && m.winnerId === m.awayTeamId;
          const body = (
            <>
              <TeamLine team={m.homeTeam} score={m.homeScore} isWinner={homeWin} isLoser={awayWin} placeholder={bye && m.homeTeamId === null ? 'BYE' : 'TBD'} />
              <div className="h-px bg-border" />
              <TeamLine team={m.awayTeam} score={m.awayScore} isWinner={awayWin} isLoser={homeWin} placeholder={bye && m.awayTeamId === null ? 'BYE' : 'TBD'} />
            </>
          );
          return (
            <div
              key={m.id}
              className="absolute"
              style={{ left: p.x, top: p.y - BOX_CENTER, width: CARD_W }}
            >
              <div className="mb-0.5 flex h-4 items-center justify-between text-[10px] text-muted">
                <span>{m.scheduledAt ? fmtDateTime(m.scheduledAt) : bye ? 'Bye — auto-advance' : 'Unscheduled'}</span>
                {m.status === 'LIVE' && <span className="font-semibold text-warn-ink">● LIVE</span>}
              </div>
              {editable ? (
                <button
                  type="button"
                  onClick={() => onEdit(m)}
                  className="block w-full overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-accent"
                  aria-label={`Update ${m.homeTeam?.name} vs ${m.awayTeam?.name}`}
                >
                  {body}
                </button>
              ) : (
                <div className={clsx('overflow-hidden rounded-lg border bg-surface', bye ? 'border-dashed border-border opacity-70' : 'border-border')}>
                  {body}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- round robin

export function Fixtures({ matches, canScore, onEdit }: { matches: Match[]; canScore: boolean; onEdit: (m: Match) => void }) {
  const rounds = Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b);
  return (
    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
      {rounds.map((r) => (
        <section key={r} className="rounded-xl border border-border">
          <h3 className="border-b border-border px-4 py-2 text-xs font-semibold tracking-wider text-muted uppercase">Matchday {r}</h3>
          <ul className="divide-y divide-border">
            {matches
              .filter((m) => m.round === r)
              .sort((a, b) => a.position - b.position)
              .map((m) => {
                const homeWin = m.winnerId && m.winnerId === m.homeTeamId;
                const awayWin = m.winnerId && m.winnerId === m.awayTeamId;
                return (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                      <span className={clsx('truncate text-right', homeWin ? 'font-semibold text-text' : 'text-text-2')}>{m.homeTeam?.name ?? 'TBD'}</span>
                      <span className="rounded-md bg-surface-2 px-2 py-0.5 text-center font-semibold text-text tabular">
                        {m.homeScore ?? '–'} : {m.awayScore ?? '–'}
                      </span>
                      <span className={clsx('truncate', awayWin ? 'font-semibold text-text' : 'text-text-2')}>{m.awayTeam?.name ?? 'TBD'}</span>
                    </div>
                    <MatchStatusBadge status={m.status} />
                    {canScore && m.status !== 'BYE' && (
                      <button
                        type="button"
                        onClick={() => onEdit(m)}
                        className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
                        aria-label="Update match"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  const sorted = [...rows].sort((a, b) => b.points - a.points || b.diff - a.diff || b.scoreFor - a.scoreFor);
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Team</th>
            <th className="num">P</th>
            <th className="num">W</th>
            <th className="num">D</th>
            <th className="num">L</th>
            <th className="num">For</th>
            <th className="num">Agst</th>
            <th className="num">Diff</th>
            <th className="num">Pts</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.teamId} className={i === 0 && r.played > 0 ? 'bg-accent-soft/50' : undefined}>
              <td className="num text-muted">{i + 1}</td>
              <td className="font-medium text-text">{r.team}</td>
              <td className="num">{r.played}</td>
              <td className="num">{r.won}</td>
              <td className="num">{r.drawn}</td>
              <td className="num">{r.lost}</td>
              <td className="num">{r.scoreFor}</td>
              <td className="num">{r.scoreAgainst}</td>
              <td className="num">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
              <td className="num font-bold text-text">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
