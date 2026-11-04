/**
 * Creates the FIRST System Administrator of a real (non-demo) deployment.
 *   ADMIN_EMAIL=… ADMIN_NAME="…" ADMIN_PASSWORD=… npm run bootstrap:admin -w @sportsos/api
 * Refuses to run if any active ADMIN assignment already exists. Further roles
 * are granted through the normal, audited assignment workflow.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { join } from 'path';
import { computeHash, GENESIS_HASH } from '../src/common/hash-chain';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(__dirname, '..', '.env'));
  } catch {
    /* rely on the environment */
  }
}

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email || !name || password.length < 12) throw new Error('Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD (at least 12 characters).');
  const existing = await prisma.roleAssignment.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
  if (existing) throw new Error('An active System Administrator already exists; use the role-assignment workflow instead.');

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: { role: 'ADMIN', isActive: true },
      create: { email, name, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 12) },
    });
    await tx.roleAssignment.create({ data: { userId: user.id, role: 'ADMIN', reason: 'Initial administrator (bootstrap script)' } });
    // audit entry on the hash chain, same algorithm as AuditService.append
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${4_022_026})`;
    const last = await tx.auditLog.findFirst({ orderBy: { seq: 'desc' }, select: { hash: true } });
    const prevHash = last?.hash ?? GENESIS_HASH;
    const createdAt = new Date();
    const entry = { actorId: null, action: 'role.bootstrap_admin', entity: 'User', entityId: user.id, payload: { email }, createdAt };
    await tx.auditLog.create({ data: { ...entry, prevHash, hash: computeHash(prevHash, entry) } });
    console.log(`System Administrator ready: ${email}`);
  });
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
