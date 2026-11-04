import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Complaint, ComplaintStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { userSummary } from '../common/selects';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { can } from '../rbac/access';
import { RbacService } from '../rbac/rbac.service';
import type { CreateComplaintDto, UpdateComplaintDto, UploadedBlob } from './complaints.controller';

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const REOPEN_WINDOW_DAYS = 14;
const MAX_REOPENS = 3;

const include = {
  raisedBy: { select: userSummary },
  assignedTo: { select: userSummary },
  attachments: { select: { id: true, filename: true, mimeType: true, size: true, createdAt: true } },
} satisfies Prisma.ComplaintInclude;

/** Accepted attachment types, identified by their leading bytes rather than the client's claim. */
const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
];

export function sniffMime(buf: Buffer): string | null {
  return SIGNATURES.find((s) => buf.length >= 12 && s.test(buf))?.mime ?? null;
}

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly rbac: RbacService,
  ) {}

  /** Own complaints, those assigned to me, escalated ones (leadership), or all (complaint.view_all). */
  private visibility(user: AuthUser): Prisma.ComplaintWhereInput {
    if (can(user, 'complaint.view_all')) return {};
    return {
      OR: [
        { raisedById: user.id },
        { assignedToId: user.id },
        ...(can(user, 'complaint.view_escalated') ? [{ escalated: true }] : []),
      ],
    };
  }

  list(user: AuthUser, status?: string) {
    return this.prisma.complaint.findMany({
      where: { AND: [this.visibility(user), status ? { status: status as ComplaintStatus } : {}] },
      include,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });
  }

  async get(user: AuthUser, id: string) {
    const c = await this.prisma.complaint.findFirst({ where: { AND: [{ id }, this.visibility(user)] }, include });
    if (!c) throw new NotFoundException('Complaint not found');
    return c;
  }

  async create(user: AuthUser, dto: CreateComplaintDto) {
    if (dto.facilityId && !(await this.prisma.facility.findUnique({ where: { id: dto.facilityId }, select: { id: true } }))) throw new NotFoundException('Facility not found');
    if (dto.equipmentId && !(await this.prisma.equipment.findUnique({ where: { id: dto.equipmentId }, select: { id: true } }))) throw new NotFoundException('Equipment not found');
    const complaint = await this.prisma.$transaction(async (tx) => {
      const c = await tx.complaint.create({ data: { ...dto, raisedById: user.id }, include });
      await this.audit.append(tx, { actorId: user.id, action: 'complaint.create', entity: 'Complaint', entityId: c.id, payload: { category: dto.category, priority: dto.priority ?? 'MEDIUM' } });
      return c;
    });
    await this.notifications.notifyPermission('complaint.assign', {
      title: `New ${dto.category.toLowerCase()} complaint`,
      body: `${user.name}: ${dto.subject}`,
      type: dto.priority === 'HIGH' ? 'ALERT' : 'INFO',
      link: '/complaints',
    }, undefined, [user.id]);
    return complaint;
  }

  /** Work on a complaint: assigned handler, or managers, or leadership for escalated complaints. */
  private canWork(user: AuthUser, c: Complaint) {
    if (!can(user, 'complaint.resolve')) return false;
    return c.assignedToId === user.id || can(user, 'complaint.view_all') || (c.escalated && can(user, 'complaint.view_escalated'));
  }

  async update(actor: AuthUser, id: string, dto: UpdateComplaintDto) {
    const existing = await this.prisma.complaint.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Complaint not found');
    if (existing.status === 'CLOSED') throw new ConflictException('Complaint is closed; reopen it first');
    const assigning = dto.assignedToId !== undefined || dto.priority !== undefined;
    const working = dto.status !== undefined || dto.resolution !== undefined;
    if (assigning && !can(actor, 'complaint.assign')) throw new ForbiddenException('Requires permission: complaint.assign');
    if (working && !this.canWork(actor, existing)) throw new ForbiddenException('Only the assigned handler or complaint managers can work on this complaint');
    if (existing.raisedById === actor.id && dto.status === 'RESOLVED') throw new ForbiddenException('You cannot resolve your own complaint');
    if (dto.status === 'RESOLVED' && !(dto.resolution ?? existing.resolution)) throw new BadRequestException('Add a resolution note before resolving');
    if (dto.assignedToId) {
      if (dto.assignedToId === existing.raisedById) throw new BadRequestException('A complaint cannot be assigned to the person who raised it');
      const assignee = await this.rbac.loadAuthUser(dto.assignedToId).catch(() => null);
      if (!assignee || !can(assignee, 'complaint.resolve')) throw new BadRequestException('Assignee must be active staff who handle complaints');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.complaint.update({
        where: { id },
        data: { ...dto, ...(dto.status === 'RESOLVED' && existing.status !== 'RESOLVED' ? { resolvedAt: new Date() } : {}) },
        include,
      });
      await this.audit.append(tx, { actorId: actor.id, action: 'complaint.update', entity: 'Complaint', entityId: id, payload: { ...dto } });
      return c;
    });
    if (dto.status && dto.status !== existing.status) {
      await this.notifications.notifyUsers([existing.raisedById], {
        title: `Complaint ${dto.status.replace('_', ' ').toLowerCase()}`,
        body: `${existing.subject}${dto.resolution ? ` — ${dto.resolution}` : ''}`,
        type: 'INFO',
        link: '/complaints',
      });
    }
    if (dto.assignedToId && dto.assignedToId !== existing.assignedToId) {
      await this.notifications.notifyUsers([dto.assignedToId], { title: 'Complaint assigned to you', body: existing.subject, type: 'INFO', link: '/complaints' });
    }
    return updated;
  }

  async escalate(actor: AuthUser, id: string, note: string) {
    const c = await this.prisma.complaint.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Complaint not found');
    if (c.escalated) throw new ConflictException('Already escalated');
    if (c.status === 'CLOSED' || c.status === 'RESOLVED') throw new ConflictException(`Complaint is ${c.status.toLowerCase()}`);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.complaint.update({ where: { id }, data: { escalated: true, escalatedAt: new Date(), escalatedById: actor.id, escalationNote: note, priority: 'HIGH' }, include });
      await this.audit.append(tx, { actorId: actor.id, action: 'complaint.escalate', entity: 'Complaint', entityId: id, payload: { note } });
      return u;
    });
    await this.notifications.notifyPermission('complaint.view_escalated', { title: 'Complaint escalated', body: `${c.subject} — ${note}`, type: 'ALERT', link: '/complaints' }, undefined, [actor.id]);
    await this.notifications.notifyUsers([c.raisedById], { title: 'Your complaint was escalated', body: c.subject, type: 'INFO', link: '/complaints' });
    return updated;
  }

  /** complaint.close holders may close any open complaint; the raiser may close (accept) once it is resolved. */
  async close(actor: AuthUser, id: string, note?: string) {
    const c = await this.prisma.complaint.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Complaint not found');
    if (c.status === 'CLOSED') throw new ConflictException('Already closed');
    const raiser = c.raisedById === actor.id;
    if (!can(actor, 'complaint.close') && !(raiser && c.status === 'RESOLVED')) {
      throw new ForbiddenException(raiser ? 'You can close your complaint once it has been resolved' : 'Requires permission: complaint.close');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.complaint.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date(), closedById: actor.id }, include });
      await this.audit.append(tx, { actorId: actor.id, action: 'complaint.close', entity: 'Complaint', entityId: id, payload: { note: note ?? null } });
      return u;
    });
    if (!raiser) await this.notifications.notifyUsers([c.raisedById], { title: 'Complaint closed', body: `${c.subject}${note ? ` — ${note}` : ''}`, type: 'INFO', link: '/complaints' });
    return updated;
  }

  async reopen(actor: AuthUser, id: string, note: string) {
    const c = await this.prisma.complaint.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Complaint not found');
    if (c.status !== 'RESOLVED' && c.status !== 'CLOSED') throw new ConflictException('Only resolved or closed complaints can be reopened');
    const raiser = c.raisedById === actor.id;
    if (!raiser && !can(actor, 'complaint.close')) throw new ForbiddenException('Only the person who raised it or complaint managers can reopen');
    if (raiser && !can(actor, 'complaint.close')) {
      const since = c.resolvedAt ?? c.updatedAt;
      if (Date.now() - since.getTime() > REOPEN_WINDOW_DAYS * 86_400_000) throw new ConflictException(`Complaints can be reopened within ${REOPEN_WINDOW_DAYS} days of resolution; raise a new one`);
      if (c.reopenCount >= MAX_REOPENS) throw new ConflictException('This complaint has been reopened too many times; raise a new one');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.complaint.update({ where: { id }, data: { status: 'OPEN', reopenCount: { increment: 1 }, closedAt: null, closedById: null, resolvedAt: null }, include });
      await this.audit.append(tx, { actorId: actor.id, action: 'complaint.reopen', entity: 'Complaint', entityId: id, payload: { note } });
      return u;
    });
    const notify = [c.assignedToId].filter((x): x is string => !!x && x !== actor.id);
    if (notify.length) await this.notifications.notifyUsers(notify, { title: 'Complaint reopened', body: `${c.subject} — ${note}`, type: 'ALERT', link: '/complaints' });
    return updated;
  }

  async attach(user: AuthUser, id: string, file?: UploadedBlob) {
    const c = await this.get(user, id);
    if (c.raisedById !== user.id && !this.canWork(user, c)) throw new ForbiddenException('Only the person who raised it or its handlers can add attachments');
    if (!file?.buffer?.length) throw new BadRequestException('Attach a file in the "file" field');
    if (file.size > MAX_ATTACHMENT_BYTES) throw new BadRequestException('Attachments are limited to 2 MB');
    const mime = sniffMime(file.buffer);
    if (!mime) throw new BadRequestException('Only JPEG, PNG, WebP images and PDF documents are accepted');
    if (c.attachments.length >= MAX_ATTACHMENTS) throw new ConflictException(`At most ${MAX_ATTACHMENTS} attachments per complaint`);
    const filename = file.originalname.slice(0, 120) || 'attachment';
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.complaintAttachment.create({
        data: { complaintId: id, filename, mimeType: mime, size: file.size, data: new Uint8Array(file.buffer), uploadedById: user.id },
        select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
      });
      await this.audit.append(tx, { actorId: user.id, action: 'complaint.attach', entity: 'Complaint', entityId: id, payload: { attachmentId: a.id, mime, size: file.size } });
      return a;
    });
  }

  async attachment(user: AuthUser, id: string, attachmentId: string) {
    await this.get(user, id); // visibility check
    const a = await this.prisma.complaintAttachment.findFirst({ where: { id: attachmentId, complaintId: id } });
    if (!a) throw new NotFoundException('Attachment not found');
    return a;
  }
}
