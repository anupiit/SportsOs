import { Role } from './roles';

/**
 * Granular permission catalogue. The API enforces these on every protected
 * route; the role → permission grants below are only the DEFAULTS that the API
 * writes to the `RolePermission` table the first time a permission appears.
 * After that the database is authoritative (System Administrators can edit it).
 *
 * Organisational seniority does NOT imply permissions: every role's set is
 * listed explicitly.
 */
export const PERMISSION_INFO = {
  // facilities
  'facility.view': 'Browse facilities and availability',
  'facility.manage': 'Create and configure facilities',
  'facility.update_status': 'Mark facilities open / under maintenance / closed (scoped for ground staff)',
  // bookings
  'booking.create': 'Request facility bookings',
  'booking.view_own': 'View own bookings',
  'booking.view_all': 'View the booking schedule of all (or assigned) facilities',
  'booking.approve': 'Approve booking requests',
  'booking.reject': 'Reject booking requests with a reason',
  'booking.cancel': "Cancel or reschedule other people's bookings",
  'booking.manage': 'Override booking rules (block slots, bypass approval)',
  'booking.verify': 'Verify gate passes and record facility entry',
  // inventory
  'inventory.view': 'View the equipment catalogue and stock levels',
  'inventory.create': 'Add equipment to the catalogue',
  'inventory.update': 'Edit equipment, adjust stock, record damage or write-offs',
  'inventory.issue': 'Issue equipment to borrowers',
  'inventory.return': 'Receive returned equipment',
  'inventory.audit': 'View loan history, stock ledger, alerts and inventory reports',
  'inventory.request': 'Submit equipment requests',
  'inventory.approve_request': 'Approve or reject equipment requests',
  // attendance
  'attendance.mark': 'Check in to verified attendance sessions',
  'attendance.view_own': 'View own attendance history',
  'attendance.view_team': 'View attendance of assigned teams / clubs',
  'attendance.manage': 'Open and close sessions and correct attendance (scoped)',
  // clubs
  'club.view': 'View clubs and join requests',
  'club.create': 'Create clubs',
  'club.manage': 'Manage any club: details, coach, roster',
  'club.manage_own': 'Manage the roster of clubs one coaches or coordinates',
  'club.announce': 'Post announcements to clubs one leads',
  // events & tournaments
  'event.view': 'View tournaments and fixtures',
  'event.create': 'Create tournaments (as proposals unless also event.approve)',
  'event.update': 'Edit tournaments',
  'event.approve': 'Approve tournament proposals',
  'event.publish': 'Generate and publish fixtures',
  'event.manage_participants': 'Register and remove teams and players in any tournament',
  'event.register_team': 'Register teams for one’s own hostel',
  'event.record_results': 'Record match results',
  // complaints
  'complaint.create': 'Raise complaints and incident reports',
  'complaint.view_own': 'View own complaints',
  'complaint.view_all': 'View every complaint',
  'complaint.view_escalated': 'View escalated complaints',
  'complaint.assign': 'Assign complaints to staff',
  'complaint.resolve': 'Work on and resolve complaints assigned to oneself',
  'complaint.close': 'Close complaints',
  'complaint.escalate': 'Escalate complaints to leadership',
  // announcements & notifications
  'announcement.draft': 'Draft announcements and submit them for approval',
  'announcement.approve': 'Approve or reject submitted announcements',
  'announcement.publish': 'Publish approved announcements',
  'notification.broadcast': 'Send direct notifications to roles',
  // operations
  'task.view_assigned': 'View operational tasks assigned to oneself',
  'task.update_assigned': 'Update the status of assigned tasks',
  'task.manage': 'Create and assign operational tasks',
  // achievements
  'achievement.verify': 'Verify student achievements',
  // people & access
  'user.view': 'Search the user directory (no phone numbers)',
  'user.create': 'Create user accounts',
  'user.update': 'Edit user accounts (incl. contact details)',
  'user.deactivate': 'Deactivate and reactivate accounts',
  'role.assign': 'Assign roles (privileged roles need approval)',
  'role.revoke': 'Revoke role assignments',
  'role.approve': 'Approve privileged role assignments',
  'role.manage_permissions': 'Edit the role → permission matrix',
  // institutional data
  'institution.view': 'View verified institutional records (public directory)',
  'institution.import': 'Import, verify and roll back institutional data',
  // intelligence
  'analytics.view': 'View institution-wide analytics',
  'analytics.participation': 'View participation reports',
  'analytics.export': 'Export analytics as CSV',
  'ai.use': 'Use the SportsOS AI assistant',
  'ai.report': 'Generate AI executive reports',
  'ai.manage': 'Reindex the AI knowledge base and view AI usage',
  'audit.view': 'View and verify the audit ledger',
  'system.view': 'View system health and integration status',
} as const;

export type Permission = keyof typeof PERMISSION_INFO;
export const PERMISSIONS = Object.keys(PERMISSION_INFO) as Permission[];

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && value in PERMISSION_INFO;
}

const STUDENT_BASE: Permission[] = [
  'facility.view', 'booking.create', 'booking.view_own', 'attendance.mark', 'attendance.view_own', 'club.view',
  'event.view', 'complaint.create', 'complaint.view_own', 'inventory.view', 'ai.use', 'institution.view',
];

const STAFF_BASE: Permission[] = [
  'facility.view', 'booking.view_own', 'club.view', 'event.view', 'complaint.create', 'complaint.view_own',
  'inventory.view', 'ai.use', 'institution.view', 'attendance.view_own',
];

const LEADERSHIP_READ: Permission[] = [
  ...STAFF_BASE, 'booking.view_all', 'analytics.view', 'analytics.participation', 'analytics.export', 'ai.report',
  'complaint.view_escalated', 'attendance.view_team', 'audit.view',
];

const RAW_DEFAULTS: Record<Role, Permission[]> = {
  DIRECTOR: [...LEADERSHIP_READ],
  DEAN_SW: [
    ...LEADERSHIP_READ, 'event.approve', 'complaint.resolve', 'complaint.close', 'announcement.approve',
    'notification.broadcast', 'user.view', 'role.assign', 'role.revoke', 'role.approve',
  ],
  SPEC_PRESIDENT: [...LEADERSHIP_READ, 'event.approve', 'announcement.approve', 'notification.broadcast', 'complaint.resolve'],
  SPORTS_OFFICER: [
    ...STAFF_BASE, 'booking.create', 'facility.manage', 'facility.update_status',
    'booking.view_all', 'booking.approve', 'booking.reject', 'booking.cancel', 'booking.manage', 'booking.verify',
    'inventory.create', 'inventory.update', 'inventory.issue', 'inventory.return', 'inventory.audit', 'inventory.request', 'inventory.approve_request',
    'attendance.view_team', 'attendance.manage',
    'club.create', 'club.manage', 'club.announce',
    'event.create', 'event.update', 'event.approve', 'event.publish', 'event.manage_participants', 'event.record_results',
    'complaint.view_all', 'complaint.assign', 'complaint.resolve', 'complaint.close', 'complaint.escalate',
    'announcement.approve', 'announcement.publish', 'notification.broadcast',
    'task.manage', 'task.view_assigned', 'task.update_assigned', 'achievement.verify',
    'user.view', 'user.create', 'user.update', 'user.deactivate', 'role.assign', 'role.revoke',
    'institution.import', 'analytics.view', 'analytics.participation', 'analytics.export', 'ai.report', 'audit.view',
  ],
  COACH: [
    ...STAFF_BASE, 'booking.create', 'attendance.manage', 'attendance.view_team', 'club.manage_own', 'club.announce',
    'inventory.request', 'achievement.verify',
  ],
  CLUB_MEMBER: [...STUDENT_BASE, 'inventory.request'],
  GROUND_STAFF: [
    ...STAFF_BASE, 'facility.update_status', 'booking.view_all', 'booking.create', 'complaint.resolve',
    'task.view_assigned', 'task.update_assigned',
  ],
  EQUIPMENT_MANAGER: [
    ...STAFF_BASE, 'inventory.create', 'inventory.update', 'inventory.issue', 'inventory.return', 'inventory.audit',
    'inventory.approve_request', 'complaint.resolve',
  ],
  SECURITY_STAFF: [...STAFF_BASE, 'booking.verify'],
  OPERATIONS_STAFF: [
    ...STAFF_BASE, 'booking.view_all', 'facility.update_status', 'complaint.resolve', 'task.view_assigned', 'task.update_assigned',
  ],
  GENERAL_SECRETARY: [...STUDENT_BASE, 'event.create', 'analytics.participation', 'announcement.draft', 'inventory.request'],
  SPORTS_COUNCIL: [...STUDENT_BASE, 'event.create', 'analytics.participation', 'announcement.draft', 'inventory.request'],
  SPORT_COORDINATOR: [
    ...STUDENT_BASE, 'event.create', 'attendance.manage', 'attendance.view_team', 'club.manage_own', 'inventory.request',
  ],
  HOSTEL_SECRETARY: [...STUDENT_BASE, 'event.create', 'event.register_team'],
  MEDIA_NOMINEE: [...STUDENT_BASE, 'announcement.draft', 'announcement.publish'],
  EVENT_COMMITTEE: [
    ...STAFF_BASE, 'booking.create', 'booking.view_all', 'event.create', 'event.update', 'event.publish',
    'event.manage_participants', 'event.record_results', 'announcement.draft',
  ],
  STUDENT: [...STUDENT_BASE],
  ADMIN: [
    ...STAFF_BASE, 'user.view', 'user.create', 'user.update', 'user.deactivate', 'role.assign', 'role.revoke',
    'role.approve', 'role.manage_permissions', 'institution.import', 'audit.view', 'ai.manage', 'system.view',
  ],
};

/** Default grants, explicit per role (de-duplicated). */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = Object.fromEntries(
  Object.entries(RAW_DEFAULTS).map(([role, perms]) => [role, [...new Set(perms)]]),
) as Record<Role, Permission[]>;

/**
 * Roles whose assignment always needs a second person's approval
 * (`role.approve`). ADMIN additionally needs an ADMIN on both sides.
 */
export const PRIVILEGED_ROLES: Role[] = ['ADMIN', 'DIRECTOR', 'DEAN_SW', 'SPEC_PRESIDENT', 'SPORTS_OFFICER'];

/** Permissions a non-administrator can never grant (via a role) unless they hold them already. */
export const SENSITIVE_PERMISSIONS: Permission[] = [
  'role.assign', 'role.revoke', 'role.approve', 'role.manage_permissions', 'user.create', 'user.update',
  'user.deactivate', 'audit.view', 'ai.manage', 'institution.import', 'system.view',
];

/** Permissions the ADMIN role can never lose, so the platform cannot be locked out. */
export const ADMIN_LOCKED_PERMISSIONS: Permission[] = ['role.assign', 'role.revoke', 'role.approve', 'role.manage_permissions', 'user.view', 'user.update'];

export type ScopeType = 'GLOBAL' | 'CLUB' | 'HOSTEL' | 'SPORT' | 'FACILITY';

/** Scope each role's assignment takes. `required` roles cannot be assigned GLOBAL. */
export const ROLE_SCOPE: Partial<Record<Role, { type: Exclude<ScopeType, 'GLOBAL'>; required: boolean }>> = {
  CLUB_MEMBER: { type: 'CLUB', required: true },
  HOSTEL_SECRETARY: { type: 'HOSTEL', required: true },
  SPORT_COORDINATOR: { type: 'SPORT', required: true },
  GROUND_STAFF: { type: 'FACILITY', required: false },
};

/** Default (code) grant check; the API resolves from the database instead. */
export function defaultRoleHasPermission(role: Role, permission: Permission): boolean {
  return DEFAULT_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
