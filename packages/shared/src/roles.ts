/**
 * The SportsOS stakeholder hierarchy (proposal §5.1). Every role maps to a
 * node of the governance tree or to the System Access Layer for students.
 */
export const ROLES = [
  'DIRECTOR',
  'DEAN_SW',
  'SPEC_PRESIDENT',
  'SPORTS_OFFICER',
  'GENERAL_SECRETARY',
  'EVENT_COMMITTEE',
  'COACH',
  'GROUND_STAFF',
  'EQUIPMENT_MANAGER',
  'SECURITY_STAFF',
  'OPERATIONS_STAFF',
  'SPORTS_COUNCIL',
  'SPORT_COORDINATOR',
  'HOSTEL_SECRETARY',
  'MEDIA_NOMINEE',
  'CLUB_MEMBER',
  'STUDENT',
  'ADMIN',
] as const;

export type Role = (typeof ROLES)[number];

/**
 * Groups used on the organisation chart:
 * LEADERSHIP (institutional leadership), ADMINISTRATION + STAFF (sports administration & operations),
 * COUNCIL (student sports administration), EVENT (event administration), SYSTEM (platform), STUDENT (general access).
 */
export type RoleTier = 'LEADERSHIP' | 'ADMINISTRATION' | 'STAFF' | 'COUNCIL' | 'EVENT' | 'STUDENT' | 'SYSTEM';

export interface RoleInfo {
  label: string;
  tier: RoleTier;
  /** Role this one reports to in the governance tree (null for the root / access layer). */
  reportsTo: Role | null;
  description: string;
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  DIRECTOR: {
    label: 'Director, IIT (ISM) Dhanbad',
    tier: 'LEADERSHIP',
    reportsTo: null,
    description: 'Institute-wide oversight; read-only executive dashboards and reports (retained from the original implementation).',
  },
  DEAN_SW: {
    label: "Dean (Students' Welfare)",
    tier: 'LEADERSHIP',
    reportsTo: 'DIRECTOR',
    description: 'Oversees student sports welfare, reviews analytics and audit trails.',
  },
  SPEC_PRESIDENT: {
    label: 'President, SPEC',
    tier: 'LEADERSHIP',
    reportsTo: 'DEAN_SW',
    description: 'Heads the Sports and Physical Education Cell.',
  },
  SPORTS_OFFICER: {
    label: 'Sports Officer (PESO)',
    tier: 'ADMINISTRATION',
    reportsTo: 'SPEC_PRESIDENT',
    description: 'Runs day-to-day operations: facilities, staff, approvals, inventory.',
  },
  GENERAL_SECRETARY: {
    label: 'General Secretary',
    tier: 'COUNCIL',
    reportsTo: 'SPEC_PRESIDENT',
    description: 'Student lead of the Sports Council; coordinates student sports activity and submits proposals.',
  },
  EVENT_COMMITTEE: {
    label: 'Event Committee',
    tier: 'EVENT',
    reportsTo: 'SPEC_PRESIDENT',
    description: 'Plans tournaments, fixtures, venues and results for sports events.',
  },
  COACH: {
    label: 'Coach',
    tier: 'STAFF',
    reportsTo: 'SPORTS_OFFICER',
    description: 'Runs practice sessions and verified attendance for club members.',
  },
  GROUND_STAFF: {
    label: 'Ground Staff',
    tier: 'STAFF',
    reportsTo: 'SPORTS_OFFICER',
    description: 'Maintains grounds and updates live facility status.',
  },
  EQUIPMENT_MANAGER: {
    label: 'Equipment Manager',
    tier: 'STAFF',
    reportsTo: 'SPORTS_OFFICER',
    description: 'Issues, receives and restocks equipment via QR codes.',
  },
  SECURITY_STAFF: {
    label: 'Security Staff',
    tier: 'STAFF',
    reportsTo: 'SPORTS_OFFICER',
    description: 'Verifies booking passes at facility entry.',
  },
  OPERATIONS_STAFF: {
    label: 'Operations Staff',
    tier: 'STAFF',
    reportsTo: 'SPORTS_OFFICER',
    description: 'Carries out assigned operational tasks and facility coordination.',
  },
  SPORTS_COUNCIL: {
    label: 'Sports Council',
    tier: 'COUNCIL',
    reportsTo: 'GENERAL_SECRETARY',
    description: 'Coordinates sport-specific coordinators and hostel secretaries.',
  },
  SPORT_COORDINATOR: {
    label: 'Sports-specific Coordinator',
    tier: 'COUNCIL',
    reportsTo: 'SPORTS_COUNCIL',
    description: 'Coordinates a single sport: rosters, fixtures, results.',
  },
  HOSTEL_SECRETARY: {
    label: 'Hostel Sports Secretary',
    tier: 'COUNCIL',
    reportsTo: 'SPORTS_COUNCIL',
    description: 'Represents a hostel in inter-hostel tournaments.',
  },
  MEDIA_NOMINEE: {
    label: 'Tech, Media & Content Nominee',
    tier: 'COUNCIL',
    reportsTo: 'SPORTS_COUNCIL',
    description: 'Publishes announcements and live results.',
  },
  CLUB_MEMBER: {
    label: 'Club Member',
    tier: 'STUDENT',
    reportsTo: 'COACH',
    description: 'Representational access: club practice, attendance and tournaments.',
  },
  STUDENT: {
    label: 'Casual Student',
    tier: 'STUDENT',
    reportsTo: null,
    description: 'Casual booking access to open facilities and equipment.',
  },
  ADMIN: {
    label: 'System Administrator',
    tier: 'SYSTEM',
    reportsTo: null,
    description: 'Platform administrator: users, roles, permissions, integrations and audit. Not an operational approver.',
  },
};

export function roleLabel(role: Role): string {
  return ROLE_INFO[role]?.label ?? role;
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
