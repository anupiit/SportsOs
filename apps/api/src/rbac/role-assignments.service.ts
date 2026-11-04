import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma, ScopeType } from '@prisma/client';
import { PRIVILEGED_ROLES, Role, ROLE_INFO, ROLE_SCOPE, ROLES, SENSITIVE_PERMISSIONS } from '@sportsos/shared';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { userSummary } from '../common/selects';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { can, holdsRole } from './access';
import { RbacService } from './rbac.service';

export interface AssignRoleInput {
  userId: string;
  role: Role;
  scopeType?: ScopeType;
  scopeId?: string;
  validFrom?: string;
  validUntil?: string;
  reason: string;
}

const include = {
  user: { select: userSummary },
  requestedBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
  revokedBy: { select: { id: true, name: true } },
} satisfies Prisma.RoleAssignmentInclude;

@Injectable()
export class RoleAssignmentsService {
  private readonly logger = new Logger(RoleAssignmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly rbac: RbacService,
  ) {}

  history(userId: string) {
    return this.prisma.roleAssignment.findMany({ where: { userId }, include, orderBy: { createdAt: 'desc' } });
  }

  pending() {
    return this.prisma.roleAssignment.findMany({ where: { status: 'PENDING_APPROVAL' }, include, orderBy: { createdAt: 'asc' } });
  }

  async assign(actor: AuthUser, input: AssignRoleInput) {
    if (input.userId === actor.id) throw new ForbiddenException('You cannot change your own roles');
    const target = await this.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, isActive: true, name: true } });
    if (!target) throw new NotFoundException('User not found');
    if (!target.isActive) throw new ConflictException('Cannot assign roles to a deactivated account');
    await this.assertMayGrant(actor, input.role);

    const { scopeType, scopeId } = await this.normaliseScope(input.role, input.scopeType, input.scopeId);
    const validFrom = input.validFrom ? new Date(input.validFrom) : new Date();
    const validUntil = input.validUntil ? new Date(input.validUntil) : null;
    if (validUntil && (validUntil <= validFrom || validUntil <= new Date())) throw new BadRequestException('validUntil must be in the future and after validFrom');

    const privileged = PRIVILEGED_ROLES.includes(input.role);
    const created = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, input.userId);
      const dup = await tx.roleAssignment.findFirst({
        where: { userId: input.userId, role: input.role, scopeType, scopeId, status: { in: ['ACTIVE', 'PENDING_APPROVAL'] } },
      });
      if (dup) throw new ConflictException(dup.status === 'ACTIVE' ? 'The user already holds this role in this scope' : 'An identical assignment is already awaiting approval');
      const a = await tx.roleAssignment.create({
        data: {
          userId: input.userId,
          role: input.role,
          scopeType,
          scopeId,
          validFrom,
          validUntil,
          reason: input.reason,
          requestedById: actor.id,
          status: privileged ? 'PENDING_APPROVAL' : 'ACTIVE',
          ...(privileged ? {} : { decidedById: actor.id, decidedAt: new Date() }),
        },
        include,
      });
      await this.audit.append(tx, {
        actorId: actor.id,
        action: privileged ? 'role.request' : 'role.assign',
        entity: 'RoleAssignment',
        entityId: a.id,
        payload: { userId: input.userId, role: input.role, scopeType, scopeId, validUntil: validUntil?.toISOString() ?? null, reason: input.reason },
      });
      if (!privileged) await syncPrimaryRole(tx, input.userId);
      return a;
    });

    if (privileged) {
      const approvers = await this.rbac.activeUserIdsWithRoles(await this.rbac.rolesWith('role.approve'));
      await this.notifications.notifyUsers(approvers.filter((id) => id !== actor.id && id !== input.userId), {
        title: 'Role assignment awaiting approval',
        body: `${actor.name} requested ${ROLE_INFO[input.role].label} for ${target.name}.`,
        type: 'APPROVAL',
        link: '/admin/roles?tab=approvals',
      });
    } else {
      await this.notifications.notifyUsers([input.userId], {
        title: `New role: ${ROLE_INFO[input.role].label}`,
        body: scopeId ? `Scope: ${scopeId}` : 'Your access has been updated.',
        type: 'INFO',
      });
    }
    return created;
  }

  async decide(actor: AuthUser, id: string, approve: boolean, note?: string) {
    const a = await this.prisma.roleAssignment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.status !== 'PENDING_APPROVAL') throw new ConflictException(`Assignment is already ${a.status.toLowerCase().replace('_', ' ')}`);
    if (a.requestedById === actor.id) throw new ForbiddenException('A second person must approve a privileged assignment you requested');
    if (a.userId === actor.id) throw new ForbiddenException('You cannot decide on your own role assignment');
    if (approve) await this.assertMayGrant(actor, a.role);
    else if (a.role === 'ADMIN' && !holdsRole(actor, 'ADMIN')) throw new ForbiddenException('Only a System Administrator can decide on administrator assignments');

    const updated = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, a.userId);
      const u = await tx.roleAssignment.update({
        where: { id },
        data: { status: approve ? 'ACTIVE' : 'REJECTED', decidedById: actor.id, decidedAt: new Date(), decisionNote: note ?? null },
        include,
      });
      await this.audit.append(tx, { actorId: actor.id, action: approve ? 'role.approve' : 'role.reject', entity: 'RoleAssignment', entityId: id, payload: { role: a.role, userId: a.userId, note: note ?? null } });
      await syncPrimaryRole(tx, a.userId);
      return u;
    });
    await this.notifications.notifyUsers([a.userId, ...(a.requestedById ? [a.requestedById] : [])], {
      title: `${ROLE_INFO[a.role].label}: ${approve ? 'approved' : 'rejected'}`,
      body: note ?? (approve ? 'The role is now active.' : 'The request was declined.'),
      type: 'APPROVAL',
    });
    return updated;
  }

  async revoke(actor: AuthUser, id: string, reason: string) {
    const a = await this.prisma.roleAssignment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.userId === actor.id) throw new ForbiddenException('You cannot revoke your own roles');
    if (a.status !== 'ACTIVE' && a.status !== 'PENDING_APPROVAL') throw new ConflictException(`Assignment is already ${a.status.toLowerCase()}`);
    if (a.role === 'ADMIN' && !holdsRole(actor, 'ADMIN')) throw new ForbiddenException('Only a System Administrator can revoke administrator access');
    if (PRIVILEGED_ROLES.includes(a.role) && !can(actor, 'role.approve')) throw new ForbiddenException('Revoking a privileged role requires role.approve');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rbac:admins'))`;
      if (a.role === 'ADMIN' && a.status === 'ACTIVE') {
        const admins = await tx.roleAssignment.count({ where: { role: 'ADMIN', status: 'ACTIVE', user: { isActive: true }, OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] } });
        if (admins <= 1) throw new ConflictException('Cannot revoke the last active System Administrator');
      }
      const u = await tx.roleAssignment.update({
        where: { id },
        data: { status: 'REVOKED', revokedById: actor.id, revokedAt: new Date(), revokeReason: reason },
        include,
      });
      // leaving the CLUB_MEMBER role also ends the matching membership record
      if (a.role === 'CLUB_MEMBER' && a.scopeType === 'CLUB') {
        await tx.clubMembership.updateMany({ where: { clubId: a.scopeId, userId: a.userId, status: 'ACTIVE' }, data: { status: 'LEFT' } });
      }
      await this.audit.append(tx, { actorId: actor.id, action: 'role.revoke', entity: 'RoleAssignment', entityId: id, payload: { role: a.role, userId: a.userId, reason } });
      await syncPrimaryRole(tx, a.userId);
      return u;
    });
    await this.notifications.notifyUsers([a.userId], { title: `Role removed: ${ROLE_INFO[a.role].label}`, body: reason, type: 'ALERT' });
    return updated;
  }

  /** Grants or ends the CLUB_MEMBER role when a membership changes (called inside the club transaction). */
  async syncClubMemberRole(tx: Tx, actorId: string, userId: string, clubId: string, active: boolean) {
    const existing = await tx.roleAssignment.findFirst({ where: { userId, role: 'CLUB_MEMBER', scopeType: 'CLUB', scopeId: clubId, status: 'ACTIVE' } });
    if (active && !existing) {
      await tx.roleAssignment.create({
        data: { userId, role: 'CLUB_MEMBER', scopeType: 'CLUB', scopeId: clubId, reason: 'Club membership approved', requestedById: actorId, decidedById: actorId, decidedAt: new Date() },
      });
    } else if (!active && existing) {
      await tx.roleAssignment.update({ where: { id: existing.id }, data: { status: 'REVOKED', revokedById: actorId, revokedAt: new Date(), revokeReason: 'Club membership ended' } });
    }
    await syncPrimaryRole(tx, userId);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireLapsed() {
    const lapsed = await this.prisma.roleAssignment.findMany({ where: { status: 'ACTIVE', validUntil: { lte: new Date() } }, select: { id: true, userId: true, role: true } });
    for (const a of lapsed) {
      await this.prisma.$transaction(async (tx) => {
        await tx.roleAssignment.update({ where: { id: a.id }, data: { status: 'EXPIRED' } });
        await this.audit.append(tx, { actorId: null, action: 'role.expire', entity: 'RoleAssignment', entityId: a.id, payload: { role: a.role, userId: a.userId } });
        await syncPrimaryRole(tx, a.userId);
      });
    }
    if (lapsed.length) this.logger.log(`Expired ${lapsed.length} time-bound role assignment(s)`);
    return lapsed.length;
  }

  // ---------------------------------------------------------------- safeguards

  /** Blocks privilege escalation: you cannot hand out sensitive powers you don't hold yourself. */
  private async assertMayGrant(actor: AuthUser, role: Role) {
    if (role === 'ADMIN' && !holdsRole(actor, 'ADMIN')) throw new ForbiddenException('Only a System Administrator can grant administrator access');
    if (holdsRole(actor, 'ADMIN')) return;
    const perms = await this.rbac.permissionsOf(role);
    const beyond = perms.filter((p) => SENSITIVE_PERMISSIONS.includes(p) && !actor.permissions.includes(p));
    if (beyond.length) throw new ForbiddenException(`Granting ${ROLE_INFO[role].label} would give permissions you do not hold: ${beyond.join(', ')}`);
  }

  private async normaliseScope(role: Role, type: ScopeType | undefined, id: string | undefined) {
    const rule = ROLE_SCOPE[role];
    const scopeType: ScopeType = type ?? (rule?.required ? rule.type : 'GLOBAL');
    const scopeId = (id ?? '').trim();
    if (scopeType === 'GLOBAL') {
      if (rule?.required) throw new BadRequestException(`${ROLE_INFO[role].label} must be scoped to a ${rule.type.toLowerCase()}`);
      return { scopeType, scopeId: '' };
    }
    if (!rule || rule.type !== scopeType) throw new BadRequestException(`${ROLE_INFO[role].label} cannot be scoped to a ${scopeType.toLowerCase()}`);
    if (!scopeId || scopeId.length > 80) throw new BadRequestException('scopeId is required (max 80 characters)');
    if (scopeType === 'CLUB' && !(await this.prisma.club.findUnique({ where: { id: scopeId }, select: { id: true } }))) throw new NotFoundException('Club not found');
    if (scopeType === 'FACILITY' && !(await this.prisma.facility.findUnique({ where: { id: scopeId }, select: { id: true } }))) throw new NotFoundException('Facility not found');
    return { scopeType, scopeId };
  }
}

/** Seniority order for the display role (administrator first). */
const PRIMARY_ORDER: Role[] = ['ADMIN', ...ROLES.filter((r) => r !== 'ADMIN')];

async function lockUser(tx: Tx, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'rbac:' + userId}))`;
}

/** Keeps the display-only User.role in line with the most senior role still held. */
export async function syncPrimaryRole(tx: Tx, userId: string) {
  const now = new Date();
  const active = await tx.roleAssignment.findMany({
    where: { userId, status: 'ACTIVE', validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
    select: { role: true },
  });
  const held = new Set(active.map((a) => a.role));
  const primary = PRIMARY_ORDER.find((r) => held.has(r)) ?? 'STUDENT';
  await tx.user.update({ where: { id: userId }, data: { role: primary } });
}
