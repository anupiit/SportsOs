import type { MembershipRole } from '@prisma/client';
import type { Permission, Role, ScopeType } from '@sportsos/shared';

/** One effective role assignment, with the permissions it contributes. */
export interface RoleGrant {
  assignmentId: string;
  role: Role;
  scopeType: ScopeType;
  scopeId: string;
  validUntil: Date | null;
  permissions: Permission[];
}

/**
 * The authenticated principal, rebuilt from the database on every request.
 * Nothing here comes from the client except `activeRole`, which is only
 * honoured if the user actually holds that role.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  /** Primary role (display / legacy). Never used for authorization. */
  role: Role;
  hostel: string | null;
  /** Role the client asked to act as, verified to be held; null = all held roles. */
  activeRole: Role | null;
  /** Every role the user currently holds (ignores activeRole). */
  heldRoles: Role[];
  /** Grants in effect for this request (narrowed to activeRole when set). */
  grants: RoleGrant[];
  permissions: Permission[];
  coachedClubIds: string[];
  memberships: { clubId: string; role: MembershipRole }[];
}

export interface JwtPayload {
  sub: string;
  /** Informational only; the guard ignores it and resolves roles from the database. */
  role: Role;
}
