/**
 * Fixture generation for the Events Planner. Pure functions over team indices,
 * so they can be unit-tested without a database.
 */

export interface MatchSpec {
  round: number; // 1-based
  position: number; // 0-based within the round
  home: number | null; // team index
  away: number | null;
  /** Set for byes: the team that advances without playing. */
  winner: number | null;
  bye: boolean;
  next: { round: number; position: number; slot: 0 | 1 } | null;
}

/**
 * Standard bracket seed order, e.g. size 8 → [1, 8, 4, 5, 2, 7, 3, 6], so that
 * seeds 1 and 2 can only meet in the final and byes go to the top seeds.
 */
export function seedOrder(size: number): number[] {
  if (size < 2 || (size & (size - 1)) !== 0) throw new Error('bracket size must be a power of two ≥ 2');
  let order = [1, 2];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((s) => [s, sum - s]);
  }
  return order;
}

/**
 * Single-elimination bracket for `teamCount` teams given in seed order
 * (index 0 = seed 1). Byes fill the bracket up to the next power of two and
 * their winners are pre-placed in round 2.
 */
export function singleElimination(teamCount: number): MatchSpec[] {
  if (teamCount < 2) throw new Error('at least two teams are required');
  let size = 2;
  while (size < teamCount) size *= 2;
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const matches: MatchSpec[] = [];

  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round;
    for (let position = 0; position < count; position++) {
      matches.push({
        round,
        position,
        home: null,
        away: null,
        winner: null,
        bye: false,
        next: round < rounds ? { round: round + 1, position: Math.floor(position / 2), slot: (position % 2) as 0 | 1 } : null,
      });
    }
  }

  const at = (round: number, position: number) =>
    matches.find((m) => m.round === round && m.position === position)!;

  for (let position = 0; position < size / 2; position++) {
    const m = at(1, position);
    const [seedA, seedB] = [order[position * 2], order[position * 2 + 1]];
    m.home = seedA <= teamCount ? seedA - 1 : null;
    m.away = seedB <= teamCount ? seedB - 1 : null;
    if (m.home === null || m.away === null) {
      m.bye = true;
      m.winner = m.home ?? m.away;
      if (m.next && m.winner !== null) {
        const n = at(m.next.round, m.next.position);
        if (m.next.slot === 0) n.home = m.winner;
        else n.away = m.winner;
      }
    }
  }
  return matches;
}

/**
 * Round robin via the circle method: one team stays fixed while the rest
 * rotate, giving n-1 rounds (n even) in which every pair meets exactly once.
 * Home/away alternates so no team is always listed first.
 */
export function roundRobin(teamCount: number): MatchSpec[] {
  if (teamCount < 2) throw new Error('at least two teams are required');
  const slots: (number | null)[] = Array.from({ length: teamCount }, (_, i) => i);
  if (slots.length % 2 === 1) slots.push(null);
  const n = slots.length;
  const matches: MatchSpec[] = [];
  let ring = slots.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const lineup = [slots[0], ...ring];
    let position = 0;
    for (let i = 0; i < n / 2; i++) {
      let home = lineup[i];
      let away = lineup[n - 1 - i];
      if (home === null || away === null) continue;
      if ((r + i) % 2 === 1) [home, away] = [away, home];
      matches.push({ round: r + 1, position: position++, home, away, winner: null, bye: false, next: null });
    }
    ring = [ring[ring.length - 1], ...ring.slice(0, -1)];
  }
  return matches;
}

export interface ResultRow {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

export interface Standing {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scoreFor: number;
  scoreAgainst: number;
  diff: number;
  points: number;
}

/** League table: 3 points for a win, 1 for a draw; ties broken by score difference, then score for. */
export function standings(teamIds: string[], results: ResultRow[]): Standing[] {
  const table = new Map<string, Standing>(
    teamIds.map((id) => [id, { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, scoreFor: 0, scoreAgainst: 0, diff: 0, points: 0 }]),
  );
  for (const r of results) {
    const h = table.get(r.home);
    const a = table.get(r.away);
    if (!h || !a) continue;
    h.played++;
    a.played++;
    h.scoreFor += r.homeScore;
    h.scoreAgainst += r.awayScore;
    a.scoreFor += r.awayScore;
    a.scoreAgainst += r.homeScore;
    if (r.homeScore > r.awayScore) {
      h.won++;
      a.lost++;
      h.points += 3;
    } else if (r.homeScore < r.awayScore) {
      a.won++;
      h.lost++;
      a.points += 3;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }
  const rows = [...table.values()];
  rows.forEach((s) => (s.diff = s.scoreFor - s.scoreAgainst));
  return rows.sort((x, y) => y.points - x.points || y.diff - x.diff || y.scoreFor - x.scoreFor);
}
