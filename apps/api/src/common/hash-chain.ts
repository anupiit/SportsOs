import { createHash } from 'crypto';

/**
 * Tamper-evident ledger primitives. Each entry's hash covers the previous
 * entry's hash plus a canonical serialisation of its own content, so editing
 * or deleting any row breaks every hash after it.
 */

export const GENESIS_HASH = '0'.repeat(64);

export interface ChainContent {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  payload: unknown;
  createdAt: Date;
}

export interface ChainEntry extends ChainContent {
  seq: number;
  prevHash: string;
  hash: string;
}

/** JSON with object keys sorted recursively, so logically equal payloads hash equally. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function computeHash(prevHash: string, content: ChainContent): string {
  const body = canonicalJson({
    actorId: content.actorId,
    action: content.action,
    entity: content.entity,
    entityId: content.entityId,
    payload: content.payload,
    createdAt: content.createdAt.toISOString(),
  });
  return createHash('sha256').update(prevHash).update('|').update(body).digest('hex');
}

/** Walks entries in ascending `seq` order and reports the first broken link. */
export function verifyChain(entries: ChainEntry[]): { valid: boolean; brokenAtSeq: number | null } {
  let prev = GENESIS_HASH;
  for (const entry of entries) {
    if (entry.prevHash !== prev || computeHash(entry.prevHash, entry) !== entry.hash) {
      return { valid: false, brokenAtSeq: entry.seq };
    }
    prev = entry.hash;
  }
  return { valid: true, brokenAtSeq: null };
}
