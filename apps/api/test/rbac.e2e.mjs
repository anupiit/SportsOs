/**
 * End-to-end authorization & workflow tests against a running API on a freshly
 * seeded DEMO database:
 *   SEED_FORCE_RESET=true npm run seed && npm start      (apps/api)
 *   npm run test:e2e -w @sportsos/api
 *
 * Covers all 18 roles against the permission matrix, cross-club / cross-hostel /
 * cross-sport / cross-facility isolation, privilege escalation, active-role
 * spoofing, direct API calls without the frontend, booking and stock races,
 * attendance corrections, complaint / tournament / announcement workflows,
 * institutional imports with rollback, and AI permission isolation.
 *
 * It mutates the database (creates TEST-labelled records), so run it on a disposable DB.
 */
import shared from '../../../packages/shared/dist/index.js';

const { DEFAULT_ROLE_PERMISSIONS, ROLES } = shared;
const API = process.env.API_URL ?? 'http://localhost:4000/api';
const PASSWORD = 'sportsos123';
let failures = 0;
let passes = 0;
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (cond) passes++;
  else failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, token, body, headers = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(API + path, {
    method,
    headers: { ...(isForm || !body ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}
const login = async (email) => {
  const r = await call('POST', '/auth/login', null, { email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};
const istDay = (offset) => new Date(Date.now() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);
const istAt = (offset, hh) => new Date(`${istDay(offset)}T${String(hh).padStart(2, '0')}:00:00+05:30`).toISOString();

// ------------------------------------------------------------------ accounts
const ACCOUNTS = {
  ADMIN: 'admin', DIRECTOR: 'director', DEAN_SW: 'dean.sw', SPEC_PRESIDENT: 'spec.president', SPORTS_OFFICER: 'peso',
  GENERAL_SECRETARY: 'gsec.sports', EVENT_COMMITTEE: 'events', COACH: 'coach.football', GROUND_STAFF: 'ground',
  EQUIPMENT_MANAGER: 'equipment', SECURITY_STAFF: 'security', OPERATIONS_STAFF: 'operations', SPORTS_COUNCIL: 'council',
  SPORT_COORDINATOR: 'coord.cricket', HOSTEL_SECRETARY: 'hostelsec.a', MEDIA_NOMINEE: 'media', CLUB_MEMBER: 'club.member', STUDENT: 'student',
};
const S = {};
for (const [role, local] of Object.entries(ACCOUNTS)) S[role] = await login(`${local}@sportsos.demo`);
const tok = (role) => S[role].accessToken;
const coachBB = await login('coach.basketball@sportsos.demo');

// ------------------------------------------------------------------ 1. every role holds what the matrix says
console.log('\n# Roles and resolved permissions');
for (const role of ROLES) {
  const me = await call('GET', '/auth/me', tok(role));
  ok(me.status === 200 && me.data.heldRoles.includes(role), `${role}: /auth/me lists the role`, me.data.heldRoles?.join(','));
  const expected = new Set(DEFAULT_ROLE_PERMISSIONS[role]);
  const missing = [...expected].filter((p) => !me.data.permissions.includes(p));
  ok(missing.length === 0, `${role}: has every default permission of the role`, missing.join(','));
}

// ------------------------------------------------------------------ 2. backend enforcement per endpoint, for every role
console.log('\n# Endpoint enforcement matrix (18 roles × endpoints)');
const has = (role, ...perms) => perms.some((p) => S[role].permissions.includes(p));
const PROBES = [
  { label: 'GET /analytics/overview', run: (t) => call('GET', '/analytics/overview', t), allowed: (r) => has(r, 'analytics.view') },
  { label: 'GET /analytics/participation', run: (t) => call('GET', '/analytics/participation', t), allowed: (r) => has(r, 'analytics.view', 'analytics.participation') },
  { label: 'GET /analytics/integrity', run: (t) => call('GET', '/analytics/integrity', t), allowed: (r) => has(r, 'analytics.view') },
  { label: 'GET /analytics/export', run: (t) => call('GET', '/analytics/export?report=bookings', t), allowed: (r) => has(r, 'analytics.export') },
  { label: 'GET /users', run: (t) => call('GET', '/users', t), allowed: (r) => has(r, 'user.view') },
  { label: 'GET /audit/verify', run: (t) => call('GET', '/audit/verify', t), allowed: (r) => has(r, 'audit.view') },
  { label: 'GET /bookings?scope=all', run: (t) => call('GET', '/bookings?scope=all', t), allowed: (r) => has(r, 'booking.view_all') },
  { label: 'GET /bookings/entry-log', run: (t) => call('GET', '/bookings/entry-log', t), allowed: (r) => has(r, 'booking.verify') },
  { label: 'GET /inventory/alerts', run: (t) => call('GET', '/inventory/alerts', t), allowed: (r) => has(r, 'inventory.audit', 'inventory.issue') },
  { label: 'GET /inventory/transactions', run: (t) => call('GET', '/inventory/transactions', t), allowed: (r) => has(r, 'inventory.audit') },
  { label: 'GET /inventory/requests?scope=all', run: (t) => call('GET', '/inventory/requests?scope=all', t), allowed: (r) => has(r, 'inventory.approve_request', 'inventory.issue') },
  { label: 'GET /rbac/assignments/pending', run: (t) => call('GET', '/rbac/assignments/pending', t), allowed: (r) => has(r, 'role.approve') },
  { label: 'GET /institution/imports', run: (t) => call('GET', '/institution/imports', t), allowed: (r) => has(r, 'institution.import') },
  { label: 'GET /tasks', run: (t) => call('GET', '/tasks', t), allowed: (r) => has(r, 'task.view_assigned', 'task.manage') },
  { label: 'GET /ai/usage', run: (t) => call('GET', '/ai/usage', t), allowed: (r) => has(r, 'ai.manage') },
  { label: 'POST /facilities (invalid body)', run: (t) => call('POST', '/facilities', t, {}), allowed: (r) => has(r, 'facility.manage') },
  { label: 'POST /clubs (invalid body)', run: (t) => call('POST', '/clubs', t, {}), allowed: (r) => has(r, 'club.create') },
  { label: 'POST /inventory/items (invalid body)', run: (t) => call('POST', '/inventory/items', t, {}), allowed: (r) => has(r, 'inventory.create') },
  { label: 'POST /notifications/broadcast (invalid body)', run: (t) => call('POST', '/notifications/broadcast', t, {}), allowed: (r) => has(r, 'notification.broadcast') },
  { label: 'POST /announcements (invalid body)', run: (t) => call('POST', '/announcements', t, {}), allowed: (r) => has(r, 'announcement.draft') },
  { label: 'POST /attendance/sessions (invalid body)', run: (t) => call('POST', '/attendance/sessions', t, {}), allowed: (r) => has(r, 'attendance.manage') },
  { label: 'POST /tournaments (invalid body)', run: (t) => call('POST', '/tournaments', t, {}), allowed: (r) => has(r, 'event.create') },
  { label: 'PUT /rbac/matrix/STUDENT/x', run: (t) => call('PUT', '/rbac/matrix/STUDENT/not.a.permission', t), allowed: (r) => has(r, 'role.manage_permissions') },
];
for (const probe of PROBES) {
  const wrong = [];
  for (const role of ROLES) {
    const { status } = await probe.run(tok(role));
    const allowed = probe.allowed(role);
    // allowed → anything but 401/403 (a 400 for an invalid body proves the guard let it through); denied → exactly 403
    if (allowed ? status === 403 || status === 401 : status !== 403) wrong.push(`${role}:${status}`);
  }
  ok(wrong.length === 0, probe.label, wrong.join(' '));
}

// ------------------------------------------------------------------ 3. direct API access & spoofing
console.log('\n# Direct API access, tokens and active-role spoofing');
ok((await call('GET', '/bookings')).status === 401, 'no token → 401');
const forged = S.STUDENT.accessToken.split('.').slice(0, 2).join('.') + '.' + 'A'.repeat(43);
ok((await call('GET', '/bookings', forged)).status === 401, 'tampered signature → 401');
ok((await call('GET', '/analytics/overview', tok('STUDENT'), null, { 'X-Active-Role': 'SPORTS_OFFICER' })).status === 403, 'student claiming X-Active-Role SPORTS_OFFICER → 403');
ok((await call('GET', '/auth/me', tok('STUDENT'), null, { 'X-Active-Role': 'ADMIN' })).status === 403, 'active role not held is refused, not ignored');
const mediaAsMedia = await call('POST', '/tournaments', tok('MEDIA_NOMINEE'), { name: 'TEST active-role proposal', sport: 'Chess', format: 'ROUND_ROBIN', startDate: istAt(12, 10) }, { 'X-Active-Role': 'MEDIA_NOMINEE' });
ok(mediaAsMedia.status === 403, 'multi-role user acting as MEDIA_NOMINEE cannot create tournaments');
const mediaAsEvents = await call('POST', '/tournaments', tok('MEDIA_NOMINEE'), { name: 'TEST active-role proposal', sport: 'Chess', format: 'ROUND_ROBIN', startDate: istAt(12, 10) }, { 'X-Active-Role': 'EVENT_COMMITTEE' });
ok(mediaAsEvents.status === 201 && mediaAsEvents.data.status === 'PROPOSED', 'same user acting as temporary EVENT_COMMITTEE can (as a proposal)');
ok((await call('POST', '/users', tok('STUDENT'), { name: 'x', email: 'x@x.io', temporaryPassword: 'aaaaaaaaaaaa' })).status === 403, 'student cannot create accounts');
ok((await call('PATCH', `/users/${S.STUDENT.user.id}`, tok('STUDENT'), { isActive: false })).status === 403, 'student cannot deactivate (even self)');
ok((await call('GET', `/users?q=${encodeURIComponent("' OR 1=1 --")}`, tok('SPORTS_OFFICER'))).status === 200, 'SQL-looking search input is treated as data');
const dir = (await call('GET', '/users', tok('DEAN_SW'))).data;
ok(Array.isArray(dir) && dir.every((u) => !('phone' in u)), 'directory without user.update hides phone numbers');
ok((await call('POST', '/bookings', tok('STUDENT'), { facilityId: 'x', start: istAt(2, 8), end: istAt(2, 9), purpose: 'x', type: 'CASUAL', role: 'ADMIN' })).status === 400, 'unknown body fields rejected (no mass assignment)');

// ------------------------------------------------------------------ fixtures
const facilities = (await call('GET', '/facilities', tok('STUDENT'))).data;
const fac = (code) => facilities.find((f) => f.code === code);
const clubs = (await call('GET', '/clubs', tok('STUDENT'))).data;
const club = (name) => clubs.find((c) => c.name === name);
const football = club('Football Club');
const basketball = club('Basketball Club');
const cricket = club('Cricket Club');

// ------------------------------------------------------------------ 4. cross-club / cross-sport / cross-hostel / cross-facility
console.log('\n# Scope isolation');
const sessBody = (clubId) => ({ title: 'TEST practice', facilityId: fac('FB-1').id, clubId, endsAt: new Date(Date.now() + 3600e3).toISOString() });
ok((await call('POST', '/attendance/sessions', tok('COACH'), sessBody(basketball.id))).status === 403, 'football coach cannot open a basketball session');
const fbSession = await call('POST', '/attendance/sessions', tok('COACH'), sessBody(football.id));
ok(fbSession.status === 201, 'football coach opens a football session');
ok((await call('GET', `/attendance/sessions/${fbSession.data.id}/otp`, coachBB.accessToken)).status === 403, 'other coach cannot read the OTP');
ok((await call('POST', '/attendance/sessions', tok('SPORT_COORDINATOR'), sessBody(football.id))).status === 403, 'cricket coordinator cannot open a football session');
ok((await call('POST', '/attendance/sessions', tok('SPORT_COORDINATOR'), sessBody(cricket.id))).status === 201, 'cricket coordinator opens a cricket session');
const bbDetail = (await call('GET', `/clubs/${basketball.id}`, coachBB.accessToken)).data;
const bbMember = bbDetail.members.find((m) => m.status === 'ACTIVE');
ok((await call('PATCH', `/clubs/${basketball.id}/members/${bbMember.id}`, tok('COACH'), { role: 'MEMBER' })).status === 403, 'football coach cannot edit the basketball roster');
ok((await call('PATCH', `/clubs/${basketball.id}/members/${bbMember.id}`, tok('SPORT_COORDINATOR'), { role: 'MEMBER' })).status === 403, 'cricket coordinator cannot edit the basketball roster');
ok((await call('POST', `/clubs/${basketball.id}/announcements`, tok('COACH'), { title: 'TEST', body: 'TEST body' })).status === 403, 'football coach cannot announce to basketball members');
ok((await call('POST', `/clubs/${football.id}/announcements`, tok('COACH'), { title: 'TEST notice', body: 'TEST practice moved' })).status === 201, 'football coach announces to football members');
ok((await call('GET', `/clubs/${football.id}/announcements`, tok('STUDENT'))).status === 403, 'non-members cannot read club announcements');
ok((await call('GET', '/users', tok('COACH'))).status === 403, 'coach cannot browse the user directory');
const fbDetail = (await call('GET', `/clubs/${football.id}`, tok('COACH'))).data;
const fbMember = fbDetail.members.find((m) => m.status === 'ACTIVE' && m.userId !== S.CLUB_MEMBER.user.id);
ok((await call('GET', `/users/${fbMember.userId}/profile`, tok('COACH'))).status === 200, 'coach can view own players’ profiles');
ok((await call('GET', `/users/${S.STUDENT.user.id}/profile`, tok('COACH'))).status === 403, 'coach cannot view unrelated students');
const nonMemberView = (await call('GET', `/clubs/${cricket.id}`, tok('STUDENT'))).data;
ok(nonMemberView.members.length === 0, 'non-members do not see club rosters');
ok((await call('GET', `/attendance/reports/club/${basketball.id}`, tok('COACH'))).status === 403, 'coach cannot read another team’s attendance report');
ok((await call('GET', `/attendance/reports/club/${football.id}`, tok('COACH'))).status === 200, 'coach reads own team’s attendance report');

const tournaments = (await call('GET', '/tournaments', tok('HOSTEL_SECRETARY'))).data;
const open = tournaments.find((t) => t.status === 'DRAFT');
ok((await call('POST', `/tournaments/${open.id}/teams`, tok('HOSTEL_SECRETARY'), { name: 'TEST Hostel B team', hostel: 'Hostel B' })).status === 403, 'hostel secretary cannot register another hostel');
const myTeam = await call('POST', `/tournaments/${open.id}/teams`, tok('HOSTEL_SECRETARY'), { name: 'TEST Hostel A team', hostel: 'Hostel A' });
ok(myTeam.status === 201, 'hostel secretary registers own hostel');
ok((await call('POST', `/tournaments/${open.id}/teams/${myTeam.data.id}/members`, tok('HOSTEL_SECRETARY'), { student: S.STUDENT.user.email })).status === 409, 'player from another hostel rejected');
ok((await call('POST', `/tournaments/${open.id}/teams/${myTeam.data.id}/members`, tok('HOSTEL_SECRETARY'), { student: S.CLUB_MEMBER.user.email })).status === 201, 'resident of the hostel registered');
ok((await call('POST', `/tournaments/${open.id}/teams/${myTeam.data.id}/members`, tok('HOSTEL_SECRETARY'), { student: S.CLUB_MEMBER.user.email })).status === 409, 'same player cannot be registered twice');

// scoped ground staff (created through the real workflow)
const gsEmail = `test.ground.${Date.now() % 1e6}@sportsos.demo`;
const gsUser = await call('POST', '/users', tok('SPORTS_OFFICER'), { name: 'TEST Scoped Ground Staff', email: gsEmail, temporaryPassword: 'temporary-pass-123' });
ok(gsUser.status === 201, 'Sports Officer creates an account');
const gsAssign = await call('POST', '/rbac/assignments', tok('SPORTS_OFFICER'), { userId: gsUser.data.id, role: 'GROUND_STAFF', scopeType: 'FACILITY', scopeId: fac('BB-B').id, reason: 'TEST scoped assignment' });
ok(gsAssign.status === 201 && gsAssign.data.status === 'ACTIVE', 'non-privileged role assigned directly', gsAssign.data.status);
const gs = (await call('POST', '/auth/login', null, { email: gsEmail, password: 'temporary-pass-123' })).data;
ok((await call('PATCH', `/facilities/${fac('BB-A').id}/status`, gs.accessToken, { status: 'OPEN' })).status === 403, 'scoped ground staff cannot change another facility');
ok((await call('PATCH', `/facilities/${fac('BB-B').id}/status`, gs.accessToken, { status: 'OPEN' })).status === 200, 'scoped ground staff updates own facility');
const gsSchedule = (await call('GET', '/bookings?scope=all', gs.accessToken)).data;
ok(gsSchedule.every((b) => b.facilityId === fac('BB-B').id), 'scoped ground staff sees only their facility’s schedule', `${gsSchedule.length} bookings`);

// ------------------------------------------------------------------ 5. privilege escalation & role lifecycle
console.log('\n# Role assignment safeguards');
const target = S.STUDENT.user.id;
ok((await call('POST', '/rbac/assignments', tok('SPORTS_OFFICER'), { userId: S.SPORTS_OFFICER.user.id, role: 'COACH', reason: 'self' })).status === 403, 'cannot assign roles to yourself');
ok((await call('POST', '/rbac/assignments', tok('SPORTS_OFFICER'), { userId: target, role: 'ADMIN', reason: 'escalate' })).status === 403, 'Sports Officer cannot grant ADMIN');
ok((await call('POST', '/rbac/assignments', tok('DEAN_SW'), { userId: target, role: 'ADMIN', reason: 'escalate' })).status === 403, 'Dean cannot grant ADMIN');
ok((await call('POST', '/rbac/assignments', tok('DEAN_SW'), { userId: target, role: 'SPORTS_OFFICER', reason: 'escalate' })).status === 403, 'Dean cannot grant powers they lack (user.update, institution.import)');
ok((await call('POST', '/rbac/assignments', tok('GENERAL_SECRETARY'), { userId: target, role: 'COACH', reason: 'x' })).status === 403, 'student office-bearers cannot assign roles');
ok((await call('POST', '/rbac/assignments', tok('SPORTS_OFFICER'), { userId: target, role: 'HOSTEL_SECRETARY', reason: 'no scope' })).status === 400, 'scoped role without a scope rejected');
const req = await call('POST', '/rbac/assignments', tok('SPORTS_OFFICER'), { userId: target, role: 'SPEC_PRESIDENT', reason: 'TEST privileged request' });
ok(req.status === 201 && req.data.status === 'PENDING_APPROVAL', 'privileged role → pending approval', req.data.status);
ok(!(await call('GET', '/auth/me', tok('STUDENT'))).data.heldRoles.includes('SPEC_PRESIDENT'), 'pending assignment grants nothing');
ok((await call('POST', `/rbac/assignments/${req.data.id}/approve`, tok('ADMIN'), {})).status === 200, 'a second person (admin) approves');
ok((await call('GET', '/analytics/overview', tok('STUDENT'))).status === 200, 'approved role takes effect on the next request');
ok((await call('POST', `/rbac/assignments/${req.data.id}/revoke`, tok('SPORTS_OFFICER'), { reason: 'TEST attempt' })).status === 403, 'revoking a privileged role needs role.approve');
ok((await call('POST', `/rbac/assignments/${req.data.id}/revoke`, tok('DEAN_SW'), { reason: 'TEST revoke' })).status === 200, 'Dean revokes');
ok((await call('GET', '/analytics/overview', tok('STUDENT'))).status === 403, 'revocation takes effect immediately (same token)');
const hist = (await call('GET', `/rbac/users/${target}/assignments`, tok('DEAN_SW'))).data;
ok(hist.some((a) => a.role === 'SPEC_PRESIDENT' && a.status === 'REVOKED' && a.revokeReason === 'TEST revoke'), 'role history keeps the revoked assignment');
const temp = await call('POST', '/rbac/assignments', tok('SPORTS_OFFICER'), { userId: target, role: 'EVENT_COMMITTEE', validUntil: new Date(Date.now() + 3000).toISOString(), reason: 'TEST temporary' });
ok(temp.status === 201, 'temporary role assigned');
ok((await call('GET', '/auth/me', tok('STUDENT'))).data.heldRoles.includes('EVENT_COMMITTEE'), 'temporary role active inside its window');
await sleep(3500);
ok(!(await call('GET', '/auth/me', tok('STUDENT'))).data.heldRoles.includes('EVENT_COMMITTEE'), 'temporary role lapses at validUntil (before the expiry job runs)');
ok((await call('DELETE', '/rbac/matrix/ADMIN/role.manage_permissions', tok('ADMIN'))).status === 403, 'admin lock-out protection on the matrix');
ok((await call('PUT', '/rbac/matrix/STUDENT/analytics.participation', tok('ADMIN'))).status === 200, 'admin grants a permission to a role');
ok((await call('GET', '/analytics/participation', tok('STUDENT'))).status === 200, 'matrix change applies immediately');
ok((await call('DELETE', '/rbac/matrix/STUDENT/analytics.participation', tok('ADMIN'))).status === 200, 'admin removes it again');
ok((await call('GET', '/analytics/participation', tok('STUDENT'))).status === 403, 'removal applies immediately');
ok((await call('POST', `/rbac/assignments/${hist[0].id}/revoke`, tok('STUDENT'), { reason: 'TEST attempt' })).status === 403, 'student cannot revoke roles');
const deact = await call('PATCH', `/users/${gsUser.data.id}`, tok('SPORTS_OFFICER'), { isActive: false });
ok(deact.status === 200 && (await call('GET', '/auth/me', gs.accessToken)).status === 401, 'deactivated account’s token stops working');

// ------------------------------------------------------------------ 6. booking conflicts & lifecycle
console.log('\n# Bookings');
const people = (await call('GET', '/users?q=Demo Student', tok('SPORTS_OFFICER'))).data.slice(10, 16);
const racers = [];
for (const p of people) racers.push(await login(p.email));
const slot = { facilityId: fac('BB-B').id, start: istAt(9, 7), end: istAt(9, 8), purpose: 'TEST race', type: 'CASUAL' };
const race = await Promise.all(racers.map((r) => call('POST', '/bookings', r.accessToken, slot)));
ok(race.filter((r) => r.status === 201).length === 1 && race.filter((r) => r.status === 409).length === racers.length - 1, `${racers.length} concurrent requests for one slot → exactly one wins`, race.map((r) => r.status).join(','));
const winner = racers[race.findIndex((r) => r.status === 201)];
const won = race.find((r) => r.status === 201).data;
const other = await call('POST', '/bookings', racers[0] === winner ? racers[1].accessToken : racers[0].accessToken, { ...slot, start: istAt(9, 9), end: istAt(9, 10) });
ok((await call('POST', `/bookings/${won.id}/reschedule`, winner.accessToken, { start: istAt(9, 9), end: istAt(9, 10) })).status === 409, 'reschedule into an occupied slot → 409');
const moved = await call('POST', `/bookings/${won.id}/reschedule`, winner.accessToken, { start: istAt(9, 11), end: istAt(9, 12) });
ok(moved.status === 200 && moved.data.rescheduleCount === 1, 'owner reschedules to a free slot');
ok((await call('POST', `/bookings/${won.id}/reschedule`, tok('STUDENT'), { start: istAt(9, 13), end: istAt(9, 14) })).status === 403, 'others cannot reschedule it');
ok((await call('POST', `/bookings/${won.id}/cancel`, tok('SPORTS_OFFICER'), {})).status === 400, 'cancelling someone else’s booking needs a reason');
ok((await call('POST', `/bookings/${won.id}/cancel`, tok('SPORTS_OFFICER'), { reason: 'TEST cleanup' })).status === 200, 'officer cancels with a reason');
if (other.status === 201) await call('POST', `/bookings/${other.data.id}/cancel`, racers[0] === winner ? racers[1].accessToken : racers[0].accessToken, {});
const ownPending = await call('POST', '/bookings', tok('SPORTS_OFFICER'), { facilityId: fac('FB-1').id, start: istAt(8, 7), end: istAt(8, 8), purpose: 'TEST officer booking', type: 'CASUAL' });
ok(ownPending.status === 201 && ownPending.data.status === 'APPROVED', 'booking.manage holders are auto-approved (no self-approval step)');
await call('POST', `/bookings/${ownPending.data.id}/cancel`, tok('SPORTS_OFFICER'), {});
const gatePass = (await call('GET', '/bookings/entry-log', tok('SECURITY_STAFF'))).data;
ok(Array.isArray(gatePass) && gatePass.every((b) => !('email' in b.user) && !('hostel' in b.user)), 'security entry log carries name + admission no. only');

// ------------------------------------------------------------------ 7. inventory consistency
console.log('\n# Inventory ledger');
const item = (await call('POST', '/inventory/items', tok('EQUIPMENT_MANAGER'), { name: `TEST racket ${Date.now() % 1e5}`, sport: 'Tennis', category: 'Racket', totalQty: 3, minStock: 1 })).data;
const burst = await Promise.all(Array.from({ length: 8 }, () => call('POST', '/inventory/issues', tok('EQUIPMENT_MANAGER'), { equipmentId: item.id, borrower: S.CLUB_MEMBER.user.email, quantity: 1 })));
ok(burst.filter((r) => r.status === 201).length === 3, '8 concurrent single issues on 3 in stock → exactly 3 succeed', burst.map((r) => r.status).join(','));
const loans = burst.filter((r) => r.status === 201).map((r) => r.data);
await call('POST', `/inventory/issues/${loans[0].id}/return`, tok('EQUIPMENT_MANAGER'), { returnedQty: 1, damagedQty: 1 });
await call('POST', `/inventory/issues/${loans[1].id}/return`, tok('EQUIPMENT_MANAGER'), { returnedQty: 0, note: 'TEST lost' });
await call('POST', `/inventory/issues/${loans[2].id}/return`, tok('EQUIPMENT_MANAGER'), { returnedQty: 1 });
ok((await call('POST', `/inventory/items/${item.id}/repair`, tok('EQUIPMENT_MANAGER'), { quantity: 1, note: 'TEST restrung' })).status === 200, 'repair moves damaged → available');
ok((await call('POST', `/inventory/items/${item.id}/damage`, tok('EQUIPMENT_MANAGER'), { quantity: 5, note: 'TEST' })).status === 409, 'cannot damage more than is in store');
ok((await call('POST', `/inventory/items/${item.id}/adjust`, tok('EQUIPMENT_MANAGER'), { availableDelta: 2, note: 'TEST stock count' })).status === 200, 'stock-count adjustment');
ok((await call('POST', `/inventory/items/${item.id}/write-off`, tok('EQUIPMENT_MANAGER'), { quantity: 1, from: 'AVAILABLE', note: 'TEST worn out' })).status === 200, 'write-off');
ok((await call('POST', `/inventory/items/${item.id}/adjust`, tok('GROUND_STAFF'), { availableDelta: 50, note: 'TEST' })).status === 403, 'ground staff cannot adjust stock');
const after = (await call('GET', `/inventory/items/${item.id}`, tok('EQUIPMENT_MANAGER'))).data;
const ledger = (await call('GET', `/inventory/items/${item.id}/transactions`, tok('EQUIPMENT_MANAGER'))).data;
const sum = (k) => ledger.reduce((a, t) => a + t[k], 0);
ok(sum('availableDelta') === after.availableQty && sum('damagedDelta') === after.damagedQty && sum('totalDelta') === after.totalQty, 'ledger deltas reconcile with current stock', `avail ${after.availableQty} dmg ${after.damagedQty} total ${after.totalQty}, ${ledger.length} txns`);
ok(after.totalQty === after.availableQty + after.issuedQty + after.damagedQty, 'invariant total = available + issued + damaged');
ok(ledger[0].balanceAvailable === after.availableQty, 'latest ledger balance equals stock');
const reqE = await call('POST', '/inventory/requests', tok('CLUB_MEMBER'), { equipmentId: item.id, quantity: 1, clubId: football.id, reason: 'TEST practice need' });
ok(reqE.status === 201, 'club member requests equipment for own club');
ok((await call('POST', '/inventory/requests', tok('CLUB_MEMBER'), { equipmentId: item.id, quantity: 1, clubId: cricket.id, reason: 'TEST other club' })).status === 403, 'not for a club they are not in');
ok((await call('POST', `/inventory/requests/${reqE.data.id}/approve`, tok('CLUB_MEMBER'), {})).status === 403, 'requester cannot approve');
ok((await call('POST', `/inventory/requests/${reqE.data.id}/approve`, tok('EQUIPMENT_MANAGER'), {})).data.status === 'APPROVED', 'equipment manager approves');
const ful = await call('POST', `/inventory/requests/${reqE.data.id}/fulfil`, tok('EQUIPMENT_MANAGER'), {});
ok(ful.status === 200 && ful.data.issue.borrower.id === S.CLUB_MEMBER.user.id, 'fulfilment issues through the ledger');
ok((await call('POST', `/inventory/requests/${reqE.data.id}/fulfil`, tok('EQUIPMENT_MANAGER'), {})).status === 409, 'cannot fulfil twice');

// ------------------------------------------------------------------ 8. attendance corrections
console.log('\n# Attendance corrections');
const corr = (body, t = tok('COACH')) => call('POST', `/attendance/sessions/${fbSession.data.id}/corrections`, t, body);
ok((await corr({ student: S.STUDENT.user.email, action: 'ADD', reason: 'TEST not a member' })).status === 409, 'cannot add a non-member to a club session');
ok((await corr({ student: fbMember.userId, action: 'ADD', reason: 'TEST phone died' })).status === 201, 'coach adds a member manually');
ok((await corr({ student: fbMember.userId, action: 'ADD', reason: 'TEST again' })).status === 409, 'duplicate attendance prevented');
ok((await corr({ student: fbMember.userId, action: 'ADD', reason: 'TEST other coach' }, coachBB.accessToken)).status === 403, 'other coach cannot correct this session');
const sessView = (await call('GET', `/attendance/sessions/${fbSession.data.id}`, tok('COACH'))).data;
const manual = sessView.records.find((r) => r.userId === fbMember.userId);
ok(manual?.method === 'MANUAL' && manual.latitude === null, 'manual record is labelled MANUAL with no fabricated GPS');
ok((await corr({ student: fbMember.userId, action: 'REMOVE', reason: 'TEST mistaken' })).status === 201, 'coach removes it');
const ch = (await call('GET', `/attendance/sessions/${fbSession.data.id}/corrections`, tok('COACH'))).data;
ok(ch.length === 2 && ch.every((c) => c.reason.startsWith('TEST')), 'correction history kept');

// ------------------------------------------------------------------ 9. complaints
console.log('\n# Complaints');
const c1 = (await call('POST', '/complaints', tok('STUDENT'), { category: 'FACILITY', subject: 'TEST broken net', description: 'TEST complaint description here', facilityId: fac('BB-A').id })).data;
ok((await call('GET', `/complaints/${c1.id}`, tok('GROUND_STAFF'))).status === 404, 'unassigned staff cannot see the complaint');
ok((await call('GET', `/complaints/${c1.id}`, tok('CLUB_MEMBER'))).status === 404, 'other students cannot see it');
ok((await call('PATCH', `/complaints/${c1.id}`, tok('GROUND_STAFF'), { status: 'IN_PROGRESS' })).status === 403, 'unassigned staff cannot work on it');
ok((await call('PATCH', `/complaints/${c1.id}`, tok('SPORTS_OFFICER'), { assignedToId: S.STUDENT.user.id })).status === 400, 'cannot assign to the raiser / non-handler');
ok((await call('PATCH', `/complaints/${c1.id}`, tok('SPORTS_OFFICER'), { assignedToId: S.GROUND_STAFF.user.id })).status === 200, 'officer assigns to ground staff');
ok((await call('PATCH', `/complaints/${c1.id}`, tok('GROUND_STAFF'), { status: 'RESOLVED' })).status === 400, 'resolution note required');
ok((await call('PATCH', `/complaints/${c1.id}`, tok('GROUND_STAFF'), { status: 'RESOLVED', resolution: 'TEST net replaced' })).status === 200, 'assignee resolves');
ok((await call('POST', `/complaints/${c1.id}/reopen`, tok('STUDENT'), { note: 'TEST still broken' })).data.status === 'OPEN', 'raiser reopens');
ok((await call('POST', `/complaints/${c1.id}/escalate`, tok('STUDENT'), { note: 'x' })).status === 403, 'raiser cannot escalate');
ok((await call('POST', `/complaints/${c1.id}/escalate`, tok('SPORTS_OFFICER'), { note: 'TEST repeated failure' })).data.escalated === true, 'officer escalates');
ok((await call('GET', `/complaints/${c1.id}`, tok('DEAN_SW'))).status === 200, 'Dean sees escalated complaints');
ok((await call('POST', `/complaints/${c1.id}/close`, tok('STUDENT'), {})).status === 403, 'raiser can only close after resolution');
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1]);
const fdOk = new FormData();
fdOk.append('file', new Blob([png], { type: 'image/png' }), 'net.png');
ok((await call('POST', `/complaints/${c1.id}/attachments`, tok('STUDENT'), fdOk)).status === 201, 'PNG attachment accepted');
const fdBad = new FormData();
fdBad.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'evil.png');
ok((await call('POST', `/complaints/${c1.id}/attachments`, tok('STUDENT'), fdBad)).status === 400, 'disguised non-image rejected by content sniffing');
const withFile = (await call('GET', `/complaints/${c1.id}`, tok('STUDENT'))).data;
ok((await call('GET', `/complaints/${c1.id}/attachments/${withFile.attachments[0].id}`, tok('CLUB_MEMBER'))).status === 404, 'others cannot download the attachment');
ok((await call('GET', '/analytics/complaints', tok('SPORTS_OFFICER'))).data.escalated >= 1, 'complaint analytics computed from data');

// ------------------------------------------------------------------ 10. tournaments & announcements
console.log('\n# Tournaments & announcements');
const proposal = (await call('POST', '/tournaments', tok('GENERAL_SECRETARY'), { name: 'TEST GSec proposal', sport: 'Kabaddi', format: 'ROUND_ROBIN', startDate: istAt(14, 9) })).data;
ok(proposal.status === 'PROPOSED', 'GSec submits a proposal');
ok((await call('POST', `/tournaments/${proposal.id}/teams`, tok('EVENT_COMMITTEE'), { name: 'TEST' })).status === 409, 'no registrations before approval');
ok((await call('POST', `/tournaments/${proposal.id}/approve`, tok('SPEC_PRESIDENT'), { note: 'TEST ok' })).data.status === 'DRAFT', 'President, SPEC approves');
const someMatch = (await call('GET', `/tournaments/${tournaments.find((t) => t.status === 'ONGOING').id}`, tok('MEDIA_NOMINEE'))).data.matches[0];
ok((await call('PATCH', `/matches/${someMatch.id}`, tok('MEDIA_NOMINEE'), { homeScore: 9 }, { 'X-Active-Role': 'MEDIA_NOMINEE' })).status === 403, 'media cannot record official results');
const ann = (await call('POST', '/announcements', tok('MEDIA_NOMINEE'), { title: 'TEST coverage', body: 'TEST match report' })).data;
ok((await call('POST', `/announcements/${ann.id}/publish`, tok('MEDIA_NOMINEE'))).status === 409, 'media cannot publish an unapproved announcement');
await call('POST', `/announcements/${ann.id}/submit`, tok('MEDIA_NOMINEE'));
ok((await call('POST', `/announcements/${ann.id}/approve`, tok('MEDIA_NOMINEE'), {})).status === 403, 'author cannot approve own announcement');
ok((await call('GET', '/announcements', tok('STUDENT'))).data.every((a) => a.id !== ann.id), 'students do not see it before publication');
ok((await call('POST', `/announcements/${ann.id}/approve`, tok('SPEC_PRESIDENT'), {})).data.status === 'APPROVED', 'SPEC approves');
ok((await call('POST', `/announcements/${ann.id}/publish`, tok('MEDIA_NOMINEE'))).data.status === 'PUBLISHED', 'media publishes approved content');
ok((await call('GET', '/announcements', tok('STUDENT'))).data.some((a) => a.id === ann.id), 'students see it after publication');
ok((await call('GET', '/tournaments/leaderboard', tok('STUDENT'))).status === 200, 'leaderboard available');

// ------------------------------------------------------------------ 11. operational tasks
const task = await call('POST', '/tasks', tok('SPORTS_OFFICER'), { title: 'TEST mow FB-1', kind: 'MAINTENANCE', facilityId: fac('FB-1').id, assigneeId: S.GROUND_STAFF.user.id });
ok(task.status === 201, 'officer assigns a maintenance task');
ok((await call('POST', '/tasks', tok('SPORTS_OFFICER'), { title: 'TEST', assigneeId: S.STUDENT.user.id })).status === 400, 'tasks only go to staff who take tasks');
ok((await call('PATCH', `/tasks/${task.data.id}/status`, tok('OPERATIONS_STAFF'), { status: 'DONE' })).status === 403, 'other staff cannot update it');
ok((await call('PATCH', `/tasks/${task.data.id}/status`, tok('GROUND_STAFF'), { status: 'DONE', note: 'TEST done' })).data.status === 'DONE', 'assignee completes it');

// ------------------------------------------------------------------ 12. institutional import
console.log('\n# Institutional data import');
const csv = (rows) => new Blob([rows.join('\n') + '\n'], { type: 'text/csv' });
const header = 'name,designation,email,source_url,verified_on,status';
const stamp = Date.now() % 1e6;
const rowsA = [
  header,
  `TEST Person ${stamp}A,TEST Officer,test.a${stamp}@example.org,https://example.org/test-roster,2026-11-01,VERIFIED`,
  `TEST Person ${stamp}B,TEST Officer,not-an-email,,,`,
  `TEST Person ${stamp}C,TEST Officer,,,,VERIFIED`,
  `TEST Person ${stamp}A,TEST Officer,,,,`,
  `TEST Person ${stamp}D,TEST Coach,,,,`,
];
const upload = (blob, kind = 'PERSONNEL', mode = 'CREATE_ONLY', t = tok('ADMIN')) => {
  const fd = new FormData();
  fd.append('file', blob, 'test.csv');
  fd.append('kind', kind);
  fd.append('mode', mode);
  return call('POST', '/institution/imports', t, fd);
};
ok((await upload(csv(rowsA), 'PERSONNEL', 'CREATE_ONLY', tok('COACH'))).status === 403, 'coach cannot import');
const pv = await upload(csv(rowsA));
ok(pv.status === 201 && pv.data.created === 2 && pv.data.failed === 3, 'preview validates: 2 valid, 3 errors (bad email, VERIFIED without source, in-file duplicate)', `created ${pv.data.created} failed ${pv.data.failed}`);
ok((await call('GET', '/institution/records?q=TEST Person ' + stamp, tok('ADMIN'))).data.length === 0, 'preview writes nothing');
ok((await call('POST', `/institution/imports/${pv.data.id}/commit`, tok('ADMIN'), {})).status === 400, 'commit refuses a batch with errors by default');
const cm = await call('POST', `/institution/imports/${pv.data.id}/commit`, tok('ADMIN'), { allowErrors: true });
ok(cm.status === 200 && cm.data.status === 'COMMITTED', 'commit with allowErrors imports the valid rows');
ok((await call('POST', `/institution/imports/${pv.data.id}/commit`, tok('ADMIN'), {})).status === 409, 'cannot commit twice');
const pub = (await call('GET', '/institution/records?q=TEST Person ' + stamp, tok('STUDENT'))).data;
ok(pub.length === 1 && pub[0].dataStatus === 'VERIFIED' && !('phone' in pub[0]), 'students see only VERIFIED records (public directory)');
const adminView = (await call('GET', '/institution/records?q=TEST Person ' + stamp, tok('ADMIN'))).data;
ok(adminView.some((r) => r.dataStatus === 'UNVERIFIED'), 'unsourced rows are stored UNVERIFIED, never promoted');
const again = await upload(csv([header, `TEST Person ${stamp}A,TEST Officer,changed${stamp}@example.org,https://example.org/test-roster,2026-11-02,VERIFIED`]));
ok(again.data.skipped === 1 && again.data.updated === 0, 'CREATE_ONLY never overwrites an existing record');
const up = await upload(csv([header, `TEST Person ${stamp}A,TEST Officer,changed${stamp}@example.org,https://example.org/test-roster,2026-11-02,VERIFIED`]), 'PERSONNEL', 'UPSERT');
ok(up.data.updated === 1, 'UPSERT plans an update');
await call('POST', `/institution/imports/${up.data.id}/commit`, tok('ADMIN'), {});
ok((await call('GET', '/institution/records?q=TEST Person ' + stamp + 'A', tok('ADMIN'))).data[0].email === `changed${stamp}@example.org`, 'update applied');
const rb = await call('POST', `/institution/imports/${up.data.id}/rollback`, tok('ADMIN'));
ok(rb.status === 200 && rb.data.status === 'ROLLED_BACK', 'rollback of the update');
ok((await call('GET', '/institution/records?q=TEST Person ' + stamp + 'A', tok('ADMIN'))).data[0].email === `test.a${stamp}@example.org`, 'rollback restored the previous values');
const recD = adminView.find((r) => r.name.endsWith('D'));
await call('PATCH', `/institution/records/${recD.id}/status`, tok('ADMIN'), { dataStatus: 'PENDING_VERIFICATION', sourceDocument: 'TEST memo' });
ok((await call('POST', `/institution/imports/${pv.data.id}/rollback`, tok('ADMIN'))).status === 409, 'rollback refuses when a record was edited after import (no silent overwrite)');

// ------------------------------------------------------------------ 13. AI permission isolation over HTTP
console.log('\n# AI permission isolation');
const q = { question: 'attendance integrity rejected check-ins device reused geofence' };
const asStudent = (await call('POST', '/ai/ask', tok('STUDENT'), q)).data;
ok(asStudent.sources.every((s) => !['attendance-integrity', 'kpi-overview', 'participation-trend', 'complaints', 'facility-utilization', 'demand-forecast', 'equipment-wear'].includes(s.id)), 'student receives no analytics documents', asStudent.sources.map((s) => s.id).join(','));
ok(!/device reused \d/i.test(asStudent.answer), 'student answer contains no integrity figures');
const asPeso = (await call('POST', '/ai/ask', tok('SPORTS_OFFICER'), q)).data;
ok(asPeso.sources.some((s) => s.id === 'attendance-integrity'), 'Sports Officer receives the analytics document');
const asCouncil = (await call('POST', '/ai/ask', tok('SPORTS_COUNCIL'), { question: 'weekly participation trend check-ins' })).data;
ok(asCouncil.sources.some((s) => s.id === 'participation-trend') && !asCouncil.sources.some((s) => s.id === 'attendance-integrity'), 'council: participation yes, integrity no');
const usage = (await call('GET', '/ai/usage', tok('ADMIN'))).data;
ok(usage.rows.some((r) => r.docsWithheld > 0), 'usage log records withheld-document counts (no content)');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) {
  console.log(`${failures} FAILURE(S)`);
  process.exit(1);
}
