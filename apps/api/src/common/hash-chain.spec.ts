import { ChainEntry, GENESIS_HASH, canonicalJson, computeHash, verifyChain } from './hash-chain';

function build(n: number): ChainEntry[] {
  const out: ChainEntry[] = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= n; i++) {
    const content = {
      actorId: 'u1',
      action: 'inventory.issue',
      entity: 'EquipmentIssue',
      entityId: `e${i}`,
      payload: { quantity: i, nested: { b: 2, a: 1 } },
      createdAt: new Date(1_800_000_000_000 + i * 1000),
    };
    const hash = computeHash(prev, content);
    out.push({ seq: i, prevHash: prev, hash, ...content });
    prev = hash;
  }
  return out;
}

describe('hash chain', () => {
  it('canonicalises key order', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(canonicalJson({ a: [{ c: 2, d: 1 }], b: 1 }));
  });

  it('verifies an untouched chain', () => {
    expect(verifyChain(build(5))).toEqual({ valid: true, brokenAtSeq: null });
  });

  it('detects an edited payload', () => {
    const chain = build(5);
    (chain[2].payload as { quantity: number }).quantity = 99;
    expect(verifyChain(chain)).toEqual({ valid: false, brokenAtSeq: 3 });
  });

  it('detects a deleted row', () => {
    const chain = build(5);
    chain.splice(1, 1);
    expect(verifyChain(chain)).toEqual({ valid: false, brokenAtSeq: 3 });
  });
});
