import { Injectable } from '@nestjs/common';
import type { AuditEntry, AuditVerification } from '@sportsos/shared';
import { computeHash, GENESIS_HASH, verifyChain } from '../common/hash-chain';
import { PrismaService, Tx } from '../prisma/prisma.service';

/** Arbitrary constant identifying the audit-chain advisory lock. */
const AUDIT_LOCK_KEY = 4_022_026;

export interface AuditInput {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends to the hash chain inside the caller's transaction, so the ledger
   * entry commits or rolls back together with the change it records. The
   * advisory lock serialises appends so concurrent writers cannot fork the chain.
   */
  async append(tx: Tx, input: AuditInput) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
    const last = await tx.auditLog.findFirst({ orderBy: { seq: 'desc' }, select: { hash: true } });
    const prevHash = last?.hash ?? GENESIS_HASH;
    const createdAt = new Date();
    // normalise through JSON so the hashed form equals what jsonb stores
    const payload = JSON.parse(JSON.stringify(input.payload ?? {}));
    const hash = computeHash(prevHash, { ...input, payload, createdAt });
    return tx.auditLog.create({
      data: { actorId: input.actorId, action: input.action, entity: input.entity, entityId: input.entityId, payload, prevHash, hash, createdAt },
    });
  }

  async appendStandalone(input: AuditInput) {
    return this.prisma.$transaction((tx) => this.append(tx, input));
  }

  async list(entity: string | undefined, limit: number): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: entity ? { entity } : undefined,
      orderBy: { seq: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      include: { actor: { select: { id: true, name: true, role: true } } },
    });
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async verify(): Promise<AuditVerification> {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
    const result = verifyChain(rows);
    return { ...result, checked: rows.length, headHash: rows.at(-1)?.hash ?? null };
  }
}
