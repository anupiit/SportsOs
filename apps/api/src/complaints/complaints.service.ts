import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ComplaintStatus, Prisma } from '@prisma/client';
import { hasPermission, rolesWith } from '@sportsos/shared';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { userSummary } from '../common/selects';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateComplaintDto, UpdateComplaintDto } from './complaints.controller';

const include = {
  raisedBy: { select: userSummary },
  assignedTo: { select: userSummary },
} satisfies Prisma.ComplaintInclude;

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  list(user: AuthUser, status?: string) {
    const manager = hasPermission(user.role, 'complaints:manage');
    return this.prisma.complaint.findMany({
      where: { ...(manager ? {} : { raisedById: user.id }), ...(status ? { status: status as ComplaintStatus } : {}) },
      include,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });
  }

  async create(user: AuthUser, dto: CreateComplaintDto) {
    const complaint = await this.prisma.complaint.create({ data: { ...dto, raisedById: user.id }, include });
    await this.notifications.notifyRoles(rolesWith('complaints:manage').filter((r) => r === 'SPORTS_OFFICER' || r === 'OPERATIONS_STAFF'), {
      title: `New ${dto.category.toLowerCase()} complaint`,
      body: `${user.name}: ${dto.subject}`,
      type: dto.priority === 'HIGH' ? 'ALERT' : 'INFO',
      link: '/complaints',
    });
    return complaint;
  }

  async update(actor: AuthUser, id: string, dto: UpdateComplaintDto) {
    const existing = await this.prisma.complaint.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Complaint not found');
    if (dto.status === 'RESOLVED' && !(dto.resolution ?? existing.resolution)) throw new BadRequestException('Add a resolution note before resolving');
    if (dto.assignedToId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assignedToId }, select: { role: true } });
      if (!assignee || !hasPermission(assignee.role, 'complaints:manage')) throw new BadRequestException('Assignee must be staff who handle complaints');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.complaint.update({ where: { id }, data: dto, include });
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
}
