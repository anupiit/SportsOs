import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import type { Prisma, TaskKind, TaskStatus } from '@prisma/client';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermission } from '../common/decorators';
import { userSummary } from '../common/selects';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { can } from '../rbac/access';
import { RbacService } from '../rbac/rbac.service';

const KINDS: TaskKind[] = ['MAINTENANCE', 'OPERATIONS', 'SECURITY'];
const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'];

class CreateTaskDto {
  @IsString() @MinLength(3) @MaxLength(120) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsIn(KINDS) kind?: TaskKind;
  @IsOptional() @IsString() facilityId?: string;
  @IsString() assigneeId: string;
  @IsOptional() @IsDateString() dueAt?: string;
}

class TaskStatusDto {
  @IsIn(STATUSES) status: TaskStatus;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

const include = {
  assignee: { select: userSummary },
  createdBy: { select: { id: true, name: true } },
  facility: { select: { id: true, name: true, code: true } },
} satisfies Prisma.OperationalTaskInclude;

/** Operational tasks for ground, operations and security staff (maintenance schedule, daily duties). */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly rbac: RbacService,
  ) {}

  list(user: AuthUser, status?: string, scope?: string) {
    const all = scope === 'all' && can(user, 'task.manage');
    return this.prisma.operationalTask.findMany({
      where: { ...(all ? {} : { assigneeId: user.id }), ...(status ? { status: status as TaskStatus } : {}) },
      include,
      orderBy: [{ status: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }],
      take: 200,
    });
  }

  async create(actor: AuthUser, dto: CreateTaskDto) {
    const assignee = await this.rbac.loadAuthUser(dto.assigneeId).catch(() => null);
    if (!assignee || !can(assignee, 'task.update_assigned')) throw new BadRequestException('Assignee must be active staff who take operational tasks');
    if (dto.facilityId && !(await this.prisma.facility.findUnique({ where: { id: dto.facilityId }, select: { id: true } }))) throw new NotFoundException('Facility not found');
    const t = await this.prisma.$transaction(async (tx) => {
      const created = await tx.operationalTask.create({ data: { ...dto, dueAt: dto.dueAt ? new Date(dto.dueAt) : null, createdById: actor.id }, include });
      await this.audit.append(tx, { actorId: actor.id, action: 'task.create', entity: 'OperationalTask', entityId: created.id, payload: { assigneeId: dto.assigneeId, kind: dto.kind ?? 'OPERATIONS' } });
      return created;
    });
    await this.notifications.notifyUsers([dto.assigneeId], { title: 'New task assigned', body: dto.title, type: 'INFO', link: '/tasks' });
    return t;
  }

  async setStatus(actor: AuthUser, id: string, dto: TaskStatusDto) {
    const t = await this.prisma.operationalTask.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Task not found');
    const mine = t.assigneeId === actor.id && can(actor, 'task.update_assigned');
    if (!mine && !can(actor, 'task.manage')) throw new ForbiddenException('Only the assignee or task managers can update this task');
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.operationalTask.update({ where: { id }, data: { status: dto.status, note: dto.note ?? t.note, completedAt: dto.status === 'DONE' ? new Date() : null }, include });
      await this.audit.append(tx, { actorId: actor.id, action: 'task.status', entity: 'OperationalTask', entityId: id, payload: { from: t.status, to: dto.status, note: dto.note ?? null } });
      return u;
    });
    if (actor.id !== t.createdById && (dto.status === 'DONE' || dto.status === 'BLOCKED')) {
      await this.notifications.notifyUsers([t.createdById], { title: `Task ${dto.status.toLowerCase()}`, body: `${t.title}${dto.note ? ` — ${dto.note}` : ''}`, type: dto.status === 'BLOCKED' ? 'ALERT' : 'INFO', link: '/tasks' });
    }
    return updated;
  }
}

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequireAnyPermission('task.view_assigned', 'task.manage')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string, @Query('scope') scope?: string) {
    return this.tasks.list(user, status, scope);
  }

  @Post()
  @RequirePermission('task.manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, dto);
  }

  @Patch(':id/status')
  @RequireAnyPermission('task.update_assigned', 'task.manage')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TaskStatusDto) {
    return this.tasks.setStatus(user, id, dto);
  }
}

@Module({ controllers: [TasksController], providers: [TasksService] })
export class TasksModule {}
