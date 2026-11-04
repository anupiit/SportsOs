import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import {
  ADMIN_LOCKED_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  isPermission,
  isRole,
  Permission,
  PERMISSION_INFO,
  PERMISSIONS,
  Role,
  ROLES,
} from '@sportsos/shared';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ActiveRoleNotHeldError, isEffective, Matrix, resolveGrants } from './access';

/** How long a cached matrix is trusted before re-reading (multi-instance staleness bound). */
const MATRIX_TTL_MS = 30_000;

@Injectable()
export class RbacService implements OnModuleInit {
  private readonly logger = new Logger(RbacService.name);
  private matrix: Map<Role, Set<Permission>> = new Map();
  private loadedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    await this.syncDefaults();
    await this.reload();
  }

  /**
   * Seeds default grants for permissions the database has not seen yet. Existing
   * permissions are left alone so an administrator's edits survive restarts.
   */
  async syncDefaults() {
    const known = new Set((await this.prisma.permissionDefinition.findMany({ select: { key: true } })).map((p) => p.key));
    const fresh = PERMISSIONS.filter((p) => !known.has(p));
    if (!fresh.length) return 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.permissionDefinition.createMany({ data: fresh.map((key) => ({ key, description: PERMISSION_INFO[key] })), skipDuplicates: true });
      const rows = ROLES.flatMap((role) => DEFAULT_ROLE_PERMISSIONS[role].filter((p) => fresh.includes(p)).map((permission) => ({ role, permission })));
      await tx.rolePermission.createMany({ data: rows, skipDuplicates: true });
    });
    this.logger.log(`Registered ${fresh.length} new permission(s) with default grants`);
    return fresh.length;
  }

  async reload() {
    const rows = await this.prisma.rolePermission.findMany();
    const m = new Map<Role, Set<Permission>>(ROLES.map((r) => [r, new Set<Permission>()]));
    for (const r of rows) if (isPermission(r.permission)) m.get(r.role)?.add(r.permission);
    this.matrix = m;
    this.loadedAt = Date.now();
  }

  async getMatrix(): Promise<Matrix> {
    if (Date.now() - this.loadedAt > MATRIX_TTL_MS) await this.reload();
    return this.matrix;
  }

  async rolesWith(permission: Permission): Promise<Role[]> {
    const m = await this.getMatrix();
    return ROLES.filter((r) => m.get(r)?.has(permission));
  }

  async permissionsOf(role: Role): Promise<Permission[]> {
    return [...((await this.getMatrix()).get(role) ?? [])];
  }

  /** Builds the request principal from trusted server-side records. */
  async loadAuthUser(userId: string, activeRoleHeader?: string | null): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        hostel: true,
        isActive: true,
        roleAssignments: {
          where: { status: 'ACTIVE' },
          select: { id: true, role: true, scopeType: true, scopeId: true, status: true, validFrom: true, validUntil: true },
        },
        coachedClubs: { select: { id: true } },
        memberships: { where: { status: 'ACTIVE' }, select: { clubId: true, role: true } },
      },
    });
    if (!user) throw new UnauthorizedException('Session is no longer valid; sign in again');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');
    let resolved;
    try {
      resolved = resolveGrants(user.roleAssignments, await this.getMatrix(), activeRoleHeader || null);
    } catch (e) {
      if (e instanceof ActiveRoleNotHeldError) throw new ForbiddenException(e.message);
      throw e;
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      hostel: user.hostel,
      ...resolved,
      coachedClubIds: user.coachedClubs.map((c) => c.id),
      memberships: user.memberships,
    };
  }

  /** Users who currently hold one of `roles` through an effective assignment. */
  async activeUserIdsWithRoles(roles: Role[]): Promise<string[]> {
    const now = new Date();
    const rows = await this.prisma.roleAssignment.findMany({
      where: { role: { in: roles }, status: 'ACTIVE', validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }], user: { isActive: true } },
      select: { userId: true, role: true, scopeType: true, scopeId: true, status: true, validFrom: true, validUntil: true, id: true },
    });
    return [...new Set(rows.filter((r) => isEffective(r, now)).map((r) => r.userId))];
  }

  // ---------------------------------------------------------------- matrix administration

  async matrixView() {
    const m = await this.getMatrix();
    return {
      roles: ROLES.map((role) => ({
        role,
        permissions: [...(m.get(role) ?? [])].sort(),
        defaults: [...DEFAULT_ROLE_PERMISSIONS[role]].sort(),
      })),
      permissions: PERMISSIONS.map((key) => ({ key, description: PERMISSION_INFO[key] })),
    };
  }

  async setGrant(actor: AuthUser, role: string, permission: string, granted: boolean) {
    if (!isRole(role)) throw new BadRequestException('Unknown role');
    if (!isPermission(permission)) throw new BadRequestException('Unknown permission');
    if (!granted && role === 'ADMIN' && ADMIN_LOCKED_PERMISSIONS.includes(permission)) {
      throw new ForbiddenException(`${permission} cannot be removed from the System Administrator role (lock-out protection)`);
    }
    await this.prisma.$transaction(async (tx) => {
      if (granted) {
        await tx.rolePermission.upsert({ where: { role_permission: { role, permission } }, create: { role, permission, grantedById: actor.id }, update: {} });
      } else {
        await tx.rolePermission.deleteMany({ where: { role, permission } });
      }
      await this.audit.append(tx, {
        actorId: actor.id,
        action: granted ? 'rbac.grant' : 'rbac.revoke',
        entity: 'RolePermission',
        entityId: `${role}:${permission}`,
        payload: { role, permission },
      });
    });
    await this.reload();
    return { role, permissions: await this.permissionsOf(role) };
  }

  /** Restores one role's row to the code defaults. */
  async resetRole(actor: AuthUser, role: string) {
    if (!isRole(role)) throw new BadRequestException('Unknown role');
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { role } });
      await tx.rolePermission.createMany({ data: DEFAULT_ROLE_PERMISSIONS[role].map((permission) => ({ role, permission, grantedById: actor.id })) });
      await this.audit.append(tx, { actorId: actor.id, action: 'rbac.reset', entity: 'RolePermission', entityId: role, payload: { role } });
    });
    await this.reload();
    return { role, permissions: await this.permissionsOf(role) };
  }
}
