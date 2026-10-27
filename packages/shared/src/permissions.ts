import { Role, ROLES } from './roles';

/**
 * Fine-grained permissions (objective O3). The API guards every route with one
 * of these, and the clients use the same table to decide what to show.
 */
export const PERMISSIONS = [
  'facilities:manage',
  'facilities:status',
  'bookings:approve',
  'bookings:checkin',
  'bookings:read_all',
  'clubs:manage',
  'clubs:roster',
  'attendance:manage',
  'inventory:manage',
  'inventory:issue',
  'events:manage',
  'events:score',
  'analytics:read',
  'ai:report',
  'users:read',
  'users:manage',
  'complaints:manage',
  'notifications:broadcast',
  'audit:read',
  'achievements:verify',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const LEADERSHIP: Role[] = ['DIRECTOR', 'DEAN_SW', 'SPEC_PRESIDENT'];

const GRANTS: Record<Permission, Role[]> = {
  'facilities:manage': ['SPORTS_OFFICER', 'OPERATIONS_STAFF'],
  'facilities:status': ['SPORTS_OFFICER', 'OPERATIONS_STAFF', 'GROUND_STAFF'],
  'bookings:approve': ['SPORTS_OFFICER', 'GENERAL_SECRETARY', 'OPERATIONS_STAFF'],
  'bookings:checkin': ['SPORTS_OFFICER', 'OPERATIONS_STAFF', 'GROUND_STAFF', 'SECURITY_STAFF'],
  'bookings:read_all': [...LEADERSHIP, 'SPORTS_OFFICER', 'GENERAL_SECRETARY', 'OPERATIONS_STAFF', 'GROUND_STAFF', 'SECURITY_STAFF', 'EVENT_COMMITTEE'],
  'clubs:manage': ['SPORTS_OFFICER', 'GENERAL_SECRETARY'],
  'clubs:roster': ['SPORTS_OFFICER', 'GENERAL_SECRETARY', 'COACH', 'SPORT_COORDINATOR'],
  'attendance:manage': ['SPORTS_OFFICER', 'COACH', 'SPORT_COORDINATOR', 'HOSTEL_SECRETARY'],
  'inventory:manage': ['SPORTS_OFFICER', 'EQUIPMENT_MANAGER'],
  'inventory:issue': ['SPORTS_OFFICER', 'EQUIPMENT_MANAGER', 'GROUND_STAFF'],
  'events:manage': ['SPORTS_OFFICER', 'GENERAL_SECRETARY', 'EVENT_COMMITTEE', 'SPORTS_COUNCIL', 'SPORT_COORDINATOR'],
  'events:score': ['SPORTS_OFFICER', 'GENERAL_SECRETARY', 'EVENT_COMMITTEE', 'SPORTS_COUNCIL', 'SPORT_COORDINATOR', 'MEDIA_NOMINEE'],
  'analytics:read': [...LEADERSHIP, 'SPORTS_OFFICER', 'GENERAL_SECRETARY', 'SPORTS_COUNCIL', 'OPERATIONS_STAFF', 'EQUIPMENT_MANAGER'],
  'ai:report': [...LEADERSHIP, 'SPORTS_OFFICER', 'GENERAL_SECRETARY'],
  'users:read': [...LEADERSHIP, 'SPORTS_OFFICER', 'GENERAL_SECRETARY', 'OPERATIONS_STAFF', 'EQUIPMENT_MANAGER', 'COACH'],
  'users:manage': ['SPORTS_OFFICER'],
  'complaints:manage': ['SPORTS_OFFICER', 'OPERATIONS_STAFF', 'GENERAL_SECRETARY', 'EQUIPMENT_MANAGER', 'GROUND_STAFF'],
  'notifications:broadcast': [...LEADERSHIP, 'SPORTS_OFFICER', 'GENERAL_SECRETARY', 'EVENT_COMMITTEE', 'MEDIA_NOMINEE'],
  'audit:read': [...LEADERSHIP, 'SPORTS_OFFICER'],
  'achievements:verify': ['SPORTS_OFFICER', 'GENERAL_SECRETARY', 'COACH'],
};

/** role -> permissions; ADMIN implicitly holds every permission. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = Object.fromEntries(
  ROLES.map((role) => [
    role,
    role === 'ADMIN'
      ? [...PERMISSIONS]
      : PERMISSIONS.filter((p) => GRANTS[p].includes(role)),
  ]),
) as Record<Role, Permission[]>;

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function rolesWith(permission: Permission): Role[] {
  return ROLES.filter((r) => hasPermission(r, permission));
}
