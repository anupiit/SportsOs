import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Equipment, IssueStatus, Prisma } from '@prisma/client';
import { hasPermission, rolesWith } from '@sportsos/shared';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { QR_PREFIX, qrDataUrl, stripQrPrefix } from '../common/qr';
import { userSummary } from '../common/selects';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { CreateItemDto, IssueDto, RestockDto, ReturnDto, UpdateItemDto } from './inventory.dto';

const DEFAULT_LOAN_HOURS = 4;

const issueInclude = {
  equipment: { select: { id: true, name: true, sport: true } },
  borrower: { select: userSummary },
} satisfies Prisma.EquipmentIssueInclude;

/** Invariant: totalQty = availableQty + issued + damagedQty. */
export function shapeItem(e: Equipment) {
  return {
    ...e,
    issuedQty: e.totalQty - e.availableQty - e.damagedQty,
    lowStock: e.availableQty <= e.minStock,
  };
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
    const staff = hasPermission(user.role, 'inventory:issue');
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

  async create(actor: AuthUser, dto: CreateItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.equipment.create({ data: { ...dto, availableQty: dto.totalQty } });
      await this.audit.append(tx, { actorId: actor.id, action: 'inventory.create', entity: 'Equipment', entityId: item.id, payload: { ...dto } });
      return shapeItem(item);
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.equipment.update({ where: { id }, data: dto });
      await this.audit.append(tx, { actorId: actor.id, action: 'inventory.update', entity: 'Equipment', entityId: id, payload: { ...dto } });
      return shapeItem(item);
    });
  }

  async restock(actor: AuthUser, id: string, dto: RestockDto) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.equipment.update({
        where: { id },
        data: { totalQty: { increment: dto.quantity }, availableQty: { increment: dto.quantity } },
      });
      await this.audit.append(tx, { actorId: actor.id, action: 'inventory.restock', entity: 'Equipment', entityId: id, payload: { quantity: dto.quantity, note: dto.note ?? null } });
      return shapeItem(item);
    });
  }

  listIssues(user: AuthUser, scope?: string, status?: string) {
    const all = scope === 'all';
    if (all && !hasPermission(user.role, 'inventory:issue')) throw new ForbiddenException('Requires permission: inventory:issue');
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
      select: { id: true, name: true },
    });
    if (!borrower) throw new NotFoundException('No active user with that email or admission number');
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : new Date(Date.now() + DEFAULT_LOAN_HOURS * 3_600_000);
    if (dueAt <= new Date()) throw new BadRequestException('dueAt must be in the future');

    const { issue, after } = await this.prisma.$transaction(async (tx) => {
      // conditional decrement: never lets two concurrent issues overdraw the stock
      const { count } = await tx.equipment.updateMany({
        where: { id: item.id, availableQty: { gte: dto.quantity } },
        data: { availableQty: { decrement: dto.quantity } },
      });
      if (!count) throw new ConflictException(`Only ${item.availableQty} × ${item.name} available`);
      const issue = await tx.equipmentIssue.create({
        data: { equipmentId: item.id, borrowerId: borrower.id, issuedById: actor.id, quantity: dto.quantity, dueAt, note: dto.note },
        include: issueInclude,
      });
      await this.audit.append(tx, {
        actorId: actor.id,
        action: 'inventory.issue',
        entity: 'EquipmentIssue',
        entityId: issue.id,
        payload: { equipmentId: item.id, borrowerId: borrower.id, quantity: dto.quantity, dueAt: dueAt.toISOString() },
      });
      const after = await tx.equipment.findUniqueOrThrow({ where: { id: item.id } });
      return { issue, after };
    });
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
      await tx.equipment.update({
        where: { id: issue.equipmentId },
        data: {
          availableQty: { increment: dto.returnedQty - damaged },
          damagedQty: { increment: damaged },
          totalQty: { decrement: lost },
        },
      });
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
    const [lowStock, overdue] = await Promise.all([
      this.prisma.equipment.findMany({ where: { availableQty: { lte: this.prisma.equipment.fields.minStock } }, orderBy: { name: 'asc' } }),
      this.prisma.equipmentIssue.findMany({
        where: { OR: [{ status: 'OVERDUE' }, { status: 'ISSUED', dueAt: { lt: new Date() } }] },
        include: issueInclude,
        orderBy: { dueAt: 'asc' },
      }),
    ]);
    return { lowStock: lowStock.map(shapeItem), overdue };
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
      await this.notifications.notifyRoles(rolesWith('inventory:manage').filter((r) => r !== 'ADMIN'), {
        title: `Low stock: ${after.name}`,
        body: `${after.availableQty} left in store (reorder level ${after.minStock}).`,
        type: 'ALERT',
        link: '/inventory',
      });
    }
  }
}
