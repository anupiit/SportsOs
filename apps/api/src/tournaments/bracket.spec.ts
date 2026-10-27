import { roundRobin, seedOrder, singleElimination, standings } from './bracket';

describe('bracket', () => {
  it('produces the standard seed order', () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('gives byes to the top seeds and pre-places them in round 2', () => {
    const m = singleElimination(6); // size 8 → seeds 1 and 2 get byes
    const r1 = m.filter((x) => x.round === 1);
    expect(r1).toHaveLength(4);
    const byes = r1.filter((x) => x.bye);
    expect(byes.map((x) => x.winner).sort()).toEqual([0, 1]);
    const r2 = m.filter((x) => x.round === 2);
    expect(r2[0].home).toBe(0); // seed 1 waits in semi-final slot
    expect(r2[1].home).toBe(1);
    expect(m.filter((x) => x.round === 3)).toHaveLength(1);
  });

  it('links every non-final match to the next round', () => {
    const m = singleElimination(8);
    expect(m).toHaveLength(7);
    expect(m.filter((x) => x.next === null)).toHaveLength(1);
  });

  it('pairs every team exactly once in a round robin', () => {
    for (const n of [4, 5, 6]) {
      const matches = roundRobin(n);
      expect(matches).toHaveLength((n * (n - 1)) / 2);
      const pairs = new Set(matches.map((x) => [x.home, x.away].sort().join('-')));
      expect(pairs.size).toBe(matches.length);
      // nobody plays twice in a round
      const rounds = new Map<number, number[]>();
      matches.forEach((x) => rounds.set(x.round, [...(rounds.get(x.round) ?? []), x.home!, x.away!]));
      rounds.forEach((teams) => expect(new Set(teams).size).toBe(teams.length));
    }
  });

  it('ranks by points, then difference', () => {
    const table = standings(['a', 'b', 'c'], [
      { home: 'a', away: 'b', homeScore: 2, awayScore: 0 },
      { home: 'b', away: 'c', homeScore: 1, awayScore: 1 },
      { home: 'c', away: 'a', homeScore: 3, awayScore: 1 },
    ]);
    expect(table.map((r) => r.teamId)).toEqual(['c', 'a', 'b']);
    expect(table[0].points).toBe(4);
  });
});
