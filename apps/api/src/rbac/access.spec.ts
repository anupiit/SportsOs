import { DEFAULT_ROLE_PERMISSIONS, Permission, PRIVILEGED_ROLES, Role, ROLES, SENSITIVE_PERMISSIONS } from '@sportsos/shared';
import type { AuthUser } from '../common/auth-user';
import { ActiveRoleNotHeldError, AssignmentRow, canIn, inScope, Matrix, permissionScope, resolveGrants } from './access';

const matrix: Matrix = new Map(ROLES.map((r) => [r, new Set(DEFAULT_ROLE_PERMISSIONS[r])]));
const NOW = new Date('2026-11-04T10:00:00Z');

function row(role: Role, extra: Partial<AssignmentRow> = {}): AssignmentRow {
  return { id: `a-${role}-${extra.scopeId ?? ''}`, role, scopeType: 'GLOBAL', scopeId: '', status: 'ACTIVE', validFrom: new Date('2026-01-01'), validUntil: null, ...extra };
}

function principal(rows: AssignmentRow[], extra: Partial<AuthUser> = {}, activeRole: string | null = null): AuthUser {
  const r = resolveGrants(rows, matrix, activeRole, NOW);
  return { id: 'u1', email: 'u1@test', name: 'U1', role: 'STUDENT', hostel: null, coachedClubIds: [], memberships: [], ...r, ...extra };
}

describe('resolveGrants', () => {
  it('unions permissions across all effective roles', () => {
    const u = principal([row('STUDENT'), row('MEDIA_NOMINEE')]);
    expect(u.permissions).toContain('booking.create');
    expect(u.permissions).toContain('announcement.draft');
    expect(u.heldRoles.sort()).toEqual(['MEDIA_NOMINEE', 'STUDENT']);
  });

  it('ignores revoked, pending, expired and not-yet-valid assignments', () => {
    const u = principal([
      row('STUDENT'),
      row('SPORTS_OFFICER', { status: 'REVOKED' }),
      row('DEAN_SW', { status: 'PENDING_APPROVAL' }),
      row('COACH', { validUntil: new Date('2026-11-01') }),
      row('EVENT_COMMITTEE', { validFrom: new Date('2026-12-01') }),
    ]);
    expect(u.heldRoles).toEqual(['STUDENT']);
    expect(u.permissions).not.toContain('booking.approve');
    expect(u.permissions).not.toContain('event.publish');
  });

  it('honours a temporary role until validUntil', () => {
    const u = principal([row('STUDENT'), row('EVENT_COMMITTEE', { validUntil: new Date('2026-11-30') })]);
    expect(u.permissions).toContain('event.publish');
  });

  it('narrows to the active role when one is requested', () => {
    const u = principal([row('STUDENT'), row('COACH')], {}, 'STUDENT');
    expect(u.activeRole).toBe('STUDENT');
    expect(u.permissions).not.toContain('attendance.manage');
    expect(u.heldRoles).toContain('COACH');
  });

  it('rejects an active role the user does not hold (frontend role names are never trusted)', () => {
    expect(() => principal([row('STUDENT')], {}, 'ADMIN')).toThrow(ActiveRoleNotHeldError);
    expect(() => principal([row('STUDENT')], {}, 'NOT_A_ROLE')).toThrow(ActiveRoleNotHeldError);
  });

  it('organisational seniority adds nothing: the Dean does not inherit Sports Officer powers', () => {
    const dean = principal([row('DEAN_SW')]);
    expect(dean.permissions).not.toContain('booking.approve');
    expect(dean.permissions).not.toContain('inventory.issue');
    expect(dean.permissions).not.toContain('role.manage_permissions');
  });
});

describe('scoped permissions', () => {
  it('a coach manages attendance only for clubs they coach', () => {
    const coach = principal([row('COACH')], { coachedClubIds: ['club-football'] });
    expect(canIn(coach, 'attendance.manage', { clubId: 'club-football' })).toBe(true);
    expect(canIn(coach, 'attendance.manage', { clubId: 'club-cricket' })).toBe(false);
  });

  it('a sport coordinator is limited to their sport (case-insensitive)', () => {
    const c = principal([row('STUDENT'), row('SPORT_COORDINATOR', { scopeType: 'SPORT', scopeId: 'Cricket' })]);
    expect(canIn(c, 'club.manage_own', { clubId: 'x', sport: 'cricket' })).toBe(true);
    expect(canIn(c, 'club.manage_own', { clubId: 'y', sport: 'Football' })).toBe(false);
  });

  it('a hostel secretary registers only for their hostel', () => {
    const h = principal([row('STUDENT'), row('HOSTEL_SECRETARY', { scopeType: 'HOSTEL', scopeId: 'Jasper' })]);
    expect(permissionScope(h, 'event.register_team').hostels.has('jasper')).toBe(true);
    expect(canIn(h, 'event.register_team', { hostel: 'Amber' })).toBe(false);
  });

  it('a mis-assigned GLOBAL hostel secretary gets no hostel powers (required scope)', () => {
    const h = principal([row('HOSTEL_SECRETARY')]);
    expect(permissionScope(h, 'event.register_team').all).toBe(false);
    expect(canIn(h, 'event.register_team', { hostel: 'Jasper' })).toBe(false);
  });

  it('ground staff scoped to a facility vs. unscoped ground staff', () => {
    const scoped = principal([row('GROUND_STAFF', { scopeType: 'FACILITY', scopeId: 'fac-1' })]);
    expect(canIn(scoped, 'facility.update_status', { facilityId: 'fac-1' })).toBe(true);
    expect(canIn(scoped, 'facility.update_status', { facilityId: 'fac-2' })).toBe(false);
    const any = principal([row('GROUND_STAFF')]);
    expect(canIn(any, 'facility.update_status', { facilityId: 'fac-2' })).toBe(true);
  });

  it('inScope with an empty scope denies everything', () => {
    expect(inScope({ all: false, clubIds: new Set(), hostels: new Set(), sports: new Set(), facilityIds: new Set() }, { clubId: 'x' })).toBe(false);
  });
});

/** The default matrix, role by role: what each of the 17 roles (+ Director) must and must not hold. */
describe('default permission matrix', () => {
  const has = (r: Role, p: Permission) => DEFAULT_ROLE_PERMISSIONS[r].includes(p);
  const expectations: Record<Role, { yes: Permission[]; no: Permission[] }> = {
    DIRECTOR: { yes: ['analytics.view', 'audit.view'], no: ['booking.approve', 'role.assign', 'user.update'] },
    DEAN_SW: { yes: ['analytics.view', 'complaint.view_escalated', 'event.approve', 'role.approve'], no: ['role.manage_permissions', 'complaint.view_all', 'booking.approve', 'user.update'] },
    SPEC_PRESIDENT: { yes: ['event.approve', 'analytics.view', 'announcement.approve'], no: ['role.assign', 'booking.approve', 'inventory.issue'] },
    SPORTS_OFFICER: { yes: ['facility.manage', 'booking.approve', 'booking.reject', 'inventory.issue', 'attendance.manage', 'event.approve', 'complaint.assign', 'role.assign'], no: ['role.approve', 'role.manage_permissions', 'system.view'] },
    COACH: { yes: ['attendance.manage', 'club.manage_own', 'inventory.request'], no: ['booking.approve', 'user.view', 'club.manage', 'facility.manage'] },
    CLUB_MEMBER: { yes: ['booking.create', 'inventory.request', 'attendance.mark'], no: ['club.manage', 'club.manage_own', 'booking.approve'] },
    GROUND_STAFF: { yes: ['facility.update_status', 'task.update_assigned', 'booking.view_all'], no: ['booking.approve', 'inventory.issue', 'complaint.view_all'] },
    EQUIPMENT_MANAGER: { yes: ['inventory.create', 'inventory.update', 'inventory.issue', 'inventory.return', 'inventory.audit', 'inventory.approve_request'], no: ['booking.approve', 'user.view', 'complaint.view_all'] },
    SECURITY_STAFF: { yes: ['booking.verify'], no: ['booking.view_all', 'user.view', 'attendance.view_team', 'analytics.view'] },
    OPERATIONS_STAFF: { yes: ['task.view_assigned', 'task.update_assigned', 'facility.update_status'], no: ['booking.approve', 'complaint.view_all', 'facility.manage'] },
    GENERAL_SECRETARY: { yes: ['event.create', 'analytics.participation', 'announcement.draft'], no: ['booking.approve', 'event.approve', 'analytics.view'] },
    SPORTS_COUNCIL: { yes: ['event.create', 'analytics.participation'], no: ['event.approve', 'booking.approve'] },
    SPORT_COORDINATOR: { yes: ['club.manage_own', 'attendance.manage', 'event.create'], no: ['club.manage', 'event.approve'] },
    HOSTEL_SECRETARY: { yes: ['event.register_team', 'event.create'], no: ['event.manage_participants', 'attendance.manage'] },
    MEDIA_NOMINEE: { yes: ['announcement.draft', 'announcement.publish'], no: ['announcement.approve', 'event.record_results', 'notification.broadcast'] },
    EVENT_COMMITTEE: { yes: ['event.create', 'event.publish', 'event.record_results', 'event.manage_participants'], no: ['event.approve', 'booking.approve'] },
    STUDENT: { yes: ['facility.view', 'booking.create', 'event.view', 'complaint.create', 'ai.use'], no: ['club.manage', 'booking.view_all', 'user.view', 'inventory.request'] },
    ADMIN: { yes: ['role.assign', 'role.approve', 'role.manage_permissions', 'user.update', 'audit.view', 'system.view'], no: ['booking.approve', 'inventory.issue', 'event.approve'] },
  };

  for (const role of ROLES) {
    it(`${role}: explicit grants`, () => {
      for (const p of expectations[role].yes) expect([role, p, has(role, p)]).toEqual([role, p, true]);
      for (const p of expectations[role].no) expect([role, p, has(role, p)]).toEqual([role, p, false]);
    });
  }

  it('no role is listed twice and every grant is a known permission', () => {
    for (const r of ROLES) expect(new Set(DEFAULT_ROLE_PERMISSIONS[r]).size).toBe(DEFAULT_ROLE_PERMISSIONS[r].length);
  });

  it('only ADMIN holds role.manage_permissions; sensitive powers stay with privileged roles', () => {
    expect(ROLES.filter((r) => has(r, 'role.manage_permissions'))).toEqual(['ADMIN']);
    for (const r of ROLES.filter((x) => !PRIVILEGED_ROLES.includes(x))) {
      expect([r, SENSITIVE_PERMISSIONS.filter((p) => has(r, p))]).toEqual([r, []]);
    }
  });
});
