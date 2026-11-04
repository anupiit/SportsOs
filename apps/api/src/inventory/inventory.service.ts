import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Equipment, InventoryTxType, IssueStatus, Prisma, RequestStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { QR_PREFIX, qrDataUrl, stripQrPrefix } from '../common/qr';
import { userSummary } from '../common/selects';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { can, canAny, canIn } from '../rbac/access';
import { CreateItemDto, CreateRequestDto, IssueDto, RestockDto, ReturnDto, UpdateItemDto } from './inventory.dto';

const DEFAULT_LOAN_HOURS = 4;

const issueInclude = {
  equipment: { select: { id: true, name: true, sport: true } },
  borrower: { select: userSummary },
} satisfies Prisma.EquipmentIssueInclude;

const requestInclude = {
  requester: { select: userSummary },
  decidedBy: { select: { id: true, name: true } },
  club: { select: { id: true, name: true } },
  equipment: { select: { id: true, name: true, availableQty: true } },
} satisfies Prisma.EquipmentRequestInclude;

/** Invariant: totalQty = availableQty + issued + damagedQty. */
export function shapeItem(e: Equipment) {
  return {
    ...e,
    issuedQty: e.totalQty - e.availableQty - e.damagedQty,
    lowStock: e.availableQty <= e.minStock,
  };
}

export interface StockDelta {
  available?: number;
  damaged?: number;
  total?: number;
}

/** Movement kinds exposed through POST items/:id/{damage,repair,write-off}. */
export type MovementKind = 'DAMAGE_REPORT' | 'REPAIR' | 'WRITE_OFF' | 'WRITE_OFF_DAMAGED';

const MOVEMENTS: Record<MovementKind, { type: InventoryTxType; delta: (q: number) => StockDelta; label: string }> = {
  DAMAGE_REPORT: { type: 'DAMAGE_REPORT', delta: (q) => ({ available: -q, damaged: q }), label: 'Damage reported' },
  REPAIR: { type: 'REPAIR', delta: (q) => ({ available: q, damaged: -q }), label: 'Repaired' },
  WRITE_OFF: { type: 'WRITE_OFF', delta: (q) => ({ available: -q, total: -q }), label: 'Written off from store' },
  WRITE_OFF_DAMAGED: { type: 'WRITE_OFF', delta: (q) => ({ damaged: -q, total: -q }), label: 'Damaged stock written off' },
};

/**
 * The only way stock quantities change. Applies the delta with a conditional
 * UPDATE (so no counter can go negative, even under concurrency) and writes the
 * matching InventoryTransaction with the resulting balances, in the caller's transaction.
 */
export async function applyStock(
  tx: Tx,
  equipmentId: string,
  type: InventoryTxType,
  quantity: number,
  delta: StockDelta,
  actorId: string,
  meta: { note?: string | null; issueId?: string; requestId?: string } = {},
) {
  const dA = delta.available ?? 0;
  const dD = delta.damaged ?? 0;
  const dT = delta.total ?? 0;
  const { count } = await tx.equipment.updateMany({
    where: {
      id: equipmentId,
      ...(dA < 0 ? { availableQty: { gte: -dA } } : {}),
      ...(dD < 0 ? { damagedQty: { gte: -dD } } : {}),
      ...(dT < 0 ? { totalQty: { gte: -dT } } : {}),
    },
    data: { availableQty: { increment: dA }, damagedQty: { increment: dD }, totalQty: { increment: dT } },
  });
  if (!count) {
    const item = await tx.equipment.findUnique({ where: { id: equipmentId } });
    if (!item) throw new NotFoundException('Item not found');
    throw new ConflictException(`Not enough stock: ${item.availableQty} available, ${item.damagedQty} damaged, ${item.totalQty} total`);
  }
  const after = await tx.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
  await tx.inventoryTransaction.create({
    data: {
      equipmentId,
      type,
      quantity,
      availableDelta: dA,
      damagedDelta: dD,
      totalDelta: dT,
      balanceAvailable: after.availableQty,
      balanceDamaged: after.damagedQty,
      balanceTotal: after.totalQty,
      actorId,
      note: meta.note ?? null,
      issueId: meta.issueId,
      requestId: meta.requestId,
    },
  });
  return after;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(q?: string, sport?: string, lowStock?: boolean) {
    const items = await this.prisma.equipment.findMany({
      where: {
        ...(sport ? { sport: { equals: sport, mode: 'insensitive' } } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }] } : {}),
        ...(lowStock ? { availableQty: { lte: this.prisma.equipment.fields.minStock } } : {}),
      },
      orderBy: [{ sport: 'asc' }, { name: 'asc' }],
    });
    return items.map(shapeItem);
  }

  /** Loan history is visible in full to equipment staff; everyone else sees only their own loans. */
  async get(user: AuthUser, id: string) {
    const staff = canAny(user, 'inventory.audit', 'inventory.issue');
    const item = await this.prisma.equipment.findUnique({
      where: { id },
      include: { issues: { where: staff ? {} : { borrowerId: user.id }, include: issueInclude, orderBy: { issuedAt: 'desc' }, take: 50 } },
    });
    if (!item) throw new NotFoundException('Item not found');
    const { issues, ...rest } = item;
    return { ...shapeItem(rest), issues };
  }

  async byQr(code: string) {
    const item = await this.prisma.equipment.findUnique({ where: { qrCode: stripQrPrefix(code, QR_PREFIX.equipment) } });
    if (!item) throw new NotFoundException('No equipment with this QR code');
    return shapeItem(item);
  }

  async qr(id: string) {
    const item = await this.prisma.equipment.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Item not found');
    return { qrCode: item.qrCode, qrDataUrl: await qrDataUrl(QR_PREFIX.equipment + item.qrCode) };
  }

  transactions(equipmentId?: string, type?: string) {
    return this.prisma.inventoryTransaction.findMany({
      where: { ...(equipmentId ? { equipmentId } : {}), ...(type ? { type: type as InventoryTxType } : {}) },
      include: { actor: { select: { id: true, name: true } }, equipment: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async create(actor: AuthUser, dto: CreateItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.equipment.create({ data: { ...dto, totalQty: 0, availableQty: 0 } });
      const item = dto.totalQty > 0 ? await applyStock(tx, created.id, 'INITIAL', dto.totalQty, { available: dto.totalQty, total: dto.totalQty }, actor.id, { note: 'Initial stock' }) : created;
      await this.audit.append(tx, { actorId: actor.id, action: 'inventory.create', entity: 'Equipment', entityId: item.id, payload: { ...dto } });
      return shapeItem(item);
    });
  }

  /** Descriptive fields only; quantities change exclusively through ledgered movements. */
  async update(actor: AuthUser, id: string, dto: UpdateItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.equipment.update({ where: { id }, data: dto });
      await this.audit.append(tx, { actorId: actor.id, action: 'inventory.update', entity: 'Equipment', entityId: id, payload: { ...dto } });
      return shapeItem(item);
    });
  }

  async restock(actor: AuthUser, id: string, dto: RestockDto) {
    return this.prisma.$transaction(async (tx) => {
      const item = await applyStock(tx, id, 'RESTOCK', dto.quantity, { available: dto.quantity, total: dto.quantity }, actor.id, { note: dto.note });
      await this.audit.append(tx, { actorId: actor.id, action: 'inventory.restock', entity: 'Equipment', entityId: id, payload: { quantity: dto.quantity, note: dto.note ?? null } });
      return shapeItem(item);
    });
  }

  async movement(actor: AuthUser, id: string, kind: MovementKind, quantity: number, note: string) {
    const m = MOVEMENTS[kind];
    return this.prisma.$transaction(async (tx) => {
      const item = await applyStock(tx, id, m.type, quantity, m.delta(quantity), actor.id, { note });
      await this.audit.append(tx, { actorId: actor.id, action: `inventory.${kind.toLowerCase()}`, entity: 'Equipment', entityId: id, payload: { quantity, note } });
      return shapeItem(item);
    });
  }

  /** Physical stock-count correction; changes available and total together. */
  async adjust(actor: AuthUser, id: string, availableDelta: number, note: string) {
    return this.prisma.$transaction(async (tx) => {
      const item = await applyStock(tx, id, 'ADJUSTMENT', Math.abs(availableDelta), { available: availableDelta, total: availableDelta }, actor.id, { note });
      await this.audit.append(tx, { actorId: actor.id, action: 'inventory.adjust', entity: 'Equipment', entityId: id, payload: { availableDelta, note } });
      return shapeItem(item);
    });
  }

  listIssues(user: AuthUser, scope?: string, status?: string) {
    const all = scope === 'all';
    if (all && !canAny(user, 'inventory.audit', 'inventory.issue')) throw new ForbiddenException('Requires permission: inventory.audit');
    return this.prisma.equipmentIssue.findMany({
      where: { ...(all ? {} : { borrowerId: user.id }), ...(status ? { status: status as IssueStatus } : {}) },
      include: issueInclude,
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });
  }

  async issue(actor: AuthUser, dto: IssueDto) {
    if (!dto.equipmentId && !dto.qrCode) throw new BadRequestException('equipmentId or qrCode is required');
    const item = dto.equipmentId
      ? await this.prisma.equipment.findUnique({ where: { id: dto.equipmentId } })
      : await this.prisma.equipment.findUnique({ where: { qrCode: stripQrPrefix(dto.qrCode!, QR_PREFIX.equipment) } });
    if (!item) throw new NotFoundException('Item not found');
    const key = dto.borrower.trim();
    const borrower = await this.prisma.user.findFirst({
      where: { isActive: true, OR: [{ email: { equals: key, mode: 'insensitive' } }, { admissionNo: { equals: key, mode: 'insensitive' } }] },
      select: { id: true },
    });
    if (!borrower) throw new NotFoundException('No active user with that email or admission number');
    return this.issueTo(actor, item, borrower.id, dto.quantity, dto.dueAt, dto.note);
  }

  private async issueTo(actor: AuthUser, item: Equipment, borrowerId: string, quantity: number, due?: string, note?: string, requestId?: string, db?: Tx) {
    const dueAt = due ? new Date(due) : new Date(Date.now() + DEFAULT_LOAN_HOURS * 3_600_000);
    if (dueAt <= new Date()) throw new BadRequestException('dueAt must be in the future');
    const run = async (tx: Tx) => {
      const created = await tx.equipmentIssue.create({
        data: { equipmentId: item.id, borrowerId, issuedById: actor.id, quantity, dueAt, note },
        include: issueInclude,
      });
      let after: Equipment;
      try {
        after = await applyStock(tx, item.id, 'ISSUE', quantity, { available: -quantity }, actor.id, { note, issueId: created.id, requestId });
      } catch (e) {
        if (e instanceof ConflictException) throw new ConflictException(`Only ${item.availableQty} × ${item.name} available`);
        throw e;
      }
      await this.audit.append(tx, {
        actorId: actor.id,
        action: 'inventory.issue',
        entity: 'EquipmentIssue',
        entityId: created.id,
        payload: { equipmentId: item.id, borrowerId, quantity, dueAt: dueAt.toISOString(), requestId: requestId ?? null },
      });
      return { issue: created, after };
    };
    const { issue, after } = db ? await run(db) : await this.prisma.$transaction(run);
    await this.alertIfLow(item, after);
    return issue;
  }

  async return(actor: AuthUser, id: string, dto: ReturnDto) {
    const damaged = dto.damagedQty ?? 0;
    return this.prisma.$transaction(async (tx) => {
      const issue = await tx.equipmentIssue.findUnique({ where: { id } });
      if (!issue) throw new NotFoundException('Issue not found');
      if (issue.status !== 'ISSUED' && issue.status !== 'OVERDUE') throw new ConflictException(`Already ${issue.status.toLowerCase()}`);
      if (dto.returnedQty > issue.quantity) throw new BadRequestException(`Only ${issue.quantity} were issued`);
      if (damaged > dto.returnedQty) throw new BadRequestException('damagedQty cannot exceed returnedQty');
      const lost = issue.quantity - dto.returnedQty;
      if (dto.returnedQty > 0) {
        await applyStock(tx, issue.equipmentId, 'RETURN', dto.returnedQty, { available: dto.returnedQty - damaged, damaged }, actor.id, { note: dto.note, issueId: id });
      }
      if (lost > 0) {
        await applyStock(tx, issue.equipmentId, 'LOSS', lost, { total: -lost }, actor.id, { note: dto.note ?? 'Not returned', issueId: id });
      }
      const updated = await tx.equipmentIssue.update({
        where: { id },
        data: {
          status: lost > 0 ? 'LOST' : 'RETURNED',
          returnedAt: new Date(),
          returnedQty: dto.returnedQty,
          damagedQty: damaged,
          receivedById: actor.id,
          note: dto.note ? [issue.note, dto.note].filter(Boolean).join(' | ') : issue.note,
        },
        include: issueInclude,
      });
      await this.audit.append(tx, {
        actorId: actor.id,
        action: 'inventory.return',
        entity: 'EquipmentIssue',
        entityId: id,
        payload: { equipmentId: issue.equipmentId, returnedQty: dto.returnedQty, damagedQty: damaged, lostQty: lost },
      });
      return updated;
    });
  }

  async alerts() {
    const [lowStock, overdue, pendingRequests] = await Promise.all([
      this.prisma.equipment.findMany({ where: { availableQty: { lte: this.prisma.equipment.fields.minStock } }, orderBy: { name: 'asc' } }),
      this.prisma.equipmentIssue.findMany({
        where: { OR: [{ status: 'OVERDUE' }, { status: 'ISSUED', dueAt: { lt: new Date() } }] },
        include: issueInclude,
        orderBy: { dueAt: 'asc' },
      }),
      this.prisma.equipmentRequest.count({ where: { status: 'PENDING' } }),
    ]);
    return { lowStock: lowStock.map(shapeItem), overdue, pendingRequests };
  }

  // ------------------------------------------------------------ equipment requests

  listRequests(user: AuthUser, scope?: string, status?: string) {
    const all = scope === 'all';
    if (all && !canAny(user, 'inventory.approve_request', 'inventory.issue')) throw new ForbiddenException('Requires permission: inventory.approve_request');
    return this.prisma.equipmentRequest.findMany({
      where: { ...(all ? {} : { requesterId: user.id }), ...(status ? { status: status as RequestStatus } : {}) },
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async createRequest(user: AuthUser, dto: CreateRequestDto) {
    let itemName = dto.itemName?.trim();
    if (dto.equipmentId) {
      const item = await this.prisma.equipment.findUnique({ where: { id: dto.equipmentId } });
      if (!item) throw new NotFoundException('Item not found');
      itemName = item.name;
    }
    if (!itemName) throw new BadRequestException('equipmentId or itemName is required');
    if (dto.clubId) {
      const club = await this.prisma.club.findUnique({ where: { id: dto.clubId } });
      if (!club) throw new NotFoundException('Club not found');
      const belongs = user.memberships.some((m) => m.clubId === club.id) || club.coachId === user.id || canIn(user, 'club.manage_own', { clubId: club.id, sport: club.sport }) || can(user, 'club.manage');
      if (!belongs) throw new ForbiddenException('You can only request equipment for clubs you belong to');
    }
    const r = await this.prisma.$transaction(async (tx) => {
      const created = await tx.equipmentRequest.create({
        data: { requesterId: user.id, equipmentId: dto.equipmentId, itemName, quantity: dto.quantity, clubId: dto.clubId, neededBy: dto.neededBy ? new Date(dto.neededBy) : null, reason: dto.reason },
        include: requestInclude,
      });
      await this.audit.append(tx, { actorId: user.id, action: 'inventory.request', entity: 'EquipmentRequest', entityId: created.id, payload: { itemName, quantity: dto.quantity, clubId: dto.clubId ?? null } });
      return created;
    });
    await this.notifications.notifyPermission('inventory.approve_request', { title: 'Equipment request', body: `${user.name}: ${dto.quantity} × ${itemName}`, type: 'APPROVAL', link: '/inventory?tab=requests' }, undefined, [user.id]);
    return r;
  }

  async decideRequest(actor: AuthUser, id: string, approve: boolean, note?: string) {
    const r = await this.prisma.equipmentRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Request not found');
    if (r.requesterId === actor.id) throw new ForbiddenException('You cannot decide on your own request');
    if (r.status !== 'PENDING') throw new ConflictException(`Request is already ${r.status.toLowerCase()}`);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.equipmentRequest.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: actor.id, decidedAt: new Date(), decisionNote: note ?? null }, include: requestInclude });
      await this.audit.append(tx, { actorId: actor.id, action: approve ? 'inventory.request.approve' : 'inventory.request.reject', entity: 'EquipmentRequest', entityId: id, payload: { note: note ?? null } });
      return u;
    });
    await this.notifications.notifyUsers([r.requesterId], { title: `Equipment request ${approve ? 'approved' : 'declined'}`, body: `${r.quantity} × ${r.itemName}${note ? ` — ${note}` : ''}`, type: 'APPROVAL', link: '/inventory?tab=requests' });
    return updated;
  }

  /** Issues an approved catalogue request to the requester, through the normal ledgered issue path. */
  async fulfilRequest(actor: AuthUser, id: string, dueAt?: string) {
    const r = await this.prisma.equipmentRequest.findUnique({ where: { id }, include: { equipment: true } });
    if (!r) throw new NotFoundException('Request not found');
    if (r.status !== 'APPROVED') throw new ConflictException('Only approved requests can be fulfilled');
    if (!r.equipment) throw new ConflictException('This request is for an item not in the catalogue; add it to inventory first');
    return this.prisma.$transaction(async (tx) => {
      // claim the request first so two clerks can't fulfil it twice
      const { count } = await tx.equipmentRequest.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'FULFILLED' } });
      if (!count) throw new ConflictException('Request was already fulfilled');
      const issue = await this.issueTo(actor, r.equipment!, r.requesterId, r.quantity, dueAt, `Request ${id}`, id, tx);
      return { requestId: id, issue };
    });
  }

  async cancelRequest(user: AuthUser, id: string) {
    const r = await this.prisma.equipmentRequest.findUnique({ where: { id } });
    if (!r || r.requesterId !== user.id) throw new NotFoundException('Request not found');
    if (r.status !== 'PENDING' && r.status !== 'APPROVED') throw new ConflictException(`Request is already ${r.status.toLowerCase()}`);
    return this.prisma.equipmentRequest.update({ where: { id }, data: { status: 'CANCELLED' }, include: requestInclude });
  }

  /** Marks loans past due as OVERDUE and reminds the borrowers. Run by the scheduler. */
  async flagOverdue(db: Tx = this.prisma) {
    const due = await db.equipmentIssue.findMany({
      where: { status: 'ISSUED', dueAt: { lt: new Date() } },
      include: { equipment: { select: { name: true } } },
    });
    if (!due.length) return 0;
    await db.equipmentIssue.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { status: 'OVERDUE' } });
    for (const d of due) {
      await this.notifications.notifyUsers([d.borrowerId], {
        title: 'Equipment overdue',
        body: `Please return ${d.quantity} × ${d.equipment.name} to the equipment room.`,
        type: 'REMINDER',
        link: '/inventory',
      }, db);
    }
    return due.length;
  }

  /** Stock alert when an issue takes an item to or below its reorder level. */
  private async alertIfLow(before: Equipment, after: Equipment) {
    if (before.availableQty > before.minStock && after.availableQty <= after.minStock) {
      await this.notifications.notifyPermission('inventory.update', {
        title: `Low stock: ${after.name}`,
        body: `${after.availableQty} left in store (reorder level ${after.minStock}).`,
        type: 'ALERT',
        link: '/inventory',
      });
    }
  }
}
