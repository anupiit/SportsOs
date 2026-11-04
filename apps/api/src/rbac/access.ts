/**
 * Pure permission-resolution and scope logic. No database access here, so it
 * is unit-tested directly (access.spec.ts).
 */
import { ForbiddenException } from '@nestjs/common';
import { isRole, Permission, Role, ROLE_SCOPE, ScopeType } from '@sportsos/shared';
import type { AuthUser, RoleGrant } from '../common/auth-user';

export type Matrix = ReadonlyMap<Role, ReadonlySet<Permission>>;

export interface AssignmentRow {
  id: string;
  role: Role;
  scopeType: ScopeType;
  scopeId: string;
  status: string;
  validFrom: Date;
  validUntil: Date | null;
}

/** An assignment counts only while ACTIVE and inside its validity window. */
export function isEffective(a: AssignmentRow, now: Date): boolean {
  return a.status === 'ACTIVE' && a.validFrom <= now && (a.validUntil === null || a.validUntil > now);
}

export class ActiveRoleNotHeldError extends Error {}

/**
 * Resolution rule:
 *  1. take every effective assignment;
 *  2. if the client sent an active role, it must be one of them, and only that role's grants apply;
 *  3. permissions = union of the matrix rows of the remaining grants.
 * Seniority in the organisation chart never adds permissions.
 */
export function resolveGrants(assignments: AssignmentRow[], matrix: Matrix, activeRole: string | null | undefined, now = new Date()) {
  const effective = assignments.filter((a) => isEffective(a, now));
  const heldRoles = [...new Set(effective.map((a) => a.role))];
  let active: Role | null = null;
  if (activeRole) {
    if (!isRole(activeRole) || !heldRoles.includes(activeRole)) throw new ActiveRoleNotHeldError(`You do not hold the role ${activeRole}`);
    active = activeRole;
  }
  const grants: RoleGrant[] = effective
    .filter((a) => !active || a.role === active)
    .map((a) => ({
      assignmentId: a.id,
      role: a.role,
      scopeType: a.scopeType,
      scopeId: a.scopeId,
      validUntil: a.validUntil,
      permissions: [...(matrix.get(a.role) ?? [])],
    }));
  const permissions = [...new Set(grants.flatMap((g) => g.permissions))].sort() as Permission[];
  return { heldRoles, activeRole: active, grants, permissions };
}

export function can(user: Pick<AuthUser, 'permissions'>, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

export function canAny(user: Pick<AuthUser, 'permissions'>, ...permissions: Permission[]): boolean {
  return permissions.some((p) => user.permissions.includes(p));
}

export function assertCan(user: Pick<AuthUser, 'permissions'>, permission: Permission, message?: string) {
  if (!can(user, permission)) throw new ForbiddenException(message ?? `Requires permission: ${permission}`);
}

/** Permissions a COACH grant applies only to the clubs that user coaches. */
const COACH_CLUB_SCOPED: Permission[] = ['attendance.manage', 'attendance.view_team', 'club.manage_own', 'club.announce'];

export interface PermissionScope {
  /** true when at least one grant of the permission is unscoped */
  all: boolean;
  clubIds: Set<string>;
  hostels: Set<string>;
  sports: Set<string>;
  facilityIds: Set<string>;
}

/** Where a permission applies for this user: everywhere, or only inside the listed scopes. */
export function permissionScope(user: Pick<AuthUser, 'grants' | 'coachedClubIds'>, permission: Permission): PermissionScope {
  const scope: PermissionScope = { all: false, clubIds: new Set(), hostels: new Set(), sports: new Set(), facilityIds: new Set() };
  for (const g of user.grants) {
    if (!g.permissions.includes(permission)) continue;
    if (g.role === 'COACH' && COACH_CLUB_SCOPED.includes(permission)) {
      user.coachedClubIds.forEach((id) => scope.clubIds.add(id));
    } else if (g.scopeType === 'GLOBAL') {
      // a role that *requires* a scope never grants globally, even if mis-assigned
      if (!ROLE_SCOPE[g.role]?.required) scope.all = true;
    } else if (g.scopeId) {
      const set = { CLUB: scope.clubIds, HOSTEL: scope.hostels, SPORT: scope.sports, FACILITY: scope.facilityIds }[g.scopeType];
      set.add(g.scopeType === 'HOSTEL' || g.scopeType === 'SPORT' ? norm(g.scopeId) : g.scopeId);
    }
  }
  return scope;
}

export interface ScopeTarget {
  clubId?: string | null;
  sport?: string | null;
  hostel?: string | null;
  facilityId?: string | null;
}

export function inScope(scope: PermissionScope, target: ScopeTarget): boolean {
  if (scope.all) return true;
  if (target.clubId && scope.clubIds.has(target.clubId)) return true;
  if (target.sport && scope.sports.has(norm(target.sport))) return true;
  if (target.hostel && scope.hostels.has(norm(target.hostel))) return true;
  if (target.facilityId && scope.facilityIds.has(target.facilityId)) return true;
  return false;
}

/** can(permission) AND the target lies inside one of the permission's scopes. */
export function canIn(user: Pick<AuthUser, 'permissions' | 'grants' | 'coachedClubIds'>, permission: Permission, target: ScopeTarget): boolean {
  return can(user, permission) && inScope(permissionScope(user, permission), target);
}

export function assertCanIn(user: Pick<AuthUser, 'permissions' | 'grants' | 'coachedClubIds'>, permission: Permission, target: ScopeTarget, message?: string) {
  if (!canIn(user, permission, target)) throw new ForbiddenException(message ?? `Requires permission ${permission} for this resource`);
}

export function holdsRole(user: Pick<AuthUser, 'heldRoles'>, role: Role) {
  return user.heldRoles.includes(role);
}

export function norm(s: string) {
  return s.trim().toLowerCase();
}
