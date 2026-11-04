/**
 * End-to-end smoke test of the SportsOS API against a freshly seeded database.
 *   npm run db:seed && npm run start   (in another terminal)
 *   npm run test:smoke                 (API_URL defaults to http://localhost:4000/api)
 * Login is rate-limited to 10 attempts per minute per account, so run it at most ~4 times a minute.
 * Exercises auth/RBAC, bookings, verified attendance (OTP + geofence + device
 * binding), QR inventory, the audit hash chain, tournaments, analytics and AI.
 */
const API = process.env.API_URL ?? 'http://localhost:4000/api';
let failures = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!cond) failures++; };
async function call(method, path, token, body) {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; const text = await res.text(); try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const login = async (email) => (await call('POST', '/auth/login', null, { email, password: 'sportsos123' })).data;

const admin = await login('admin@sportsos.demo');
const peso = await login('peso@sportsos.demo');
const anup = await login('club.member@sportsos.demo');
const casual = await login('student@sportsos.demo');
const coach = await login('coach.football@sportsos.demo');
const gsec = await login('gsec.sports@sportsos.demo');
const security = await login('security@sportsos.demo');
const equip = await login('equipment@sportsos.demo');
const events = await login('events@sportsos.demo');
ok(anup.accessToken && anup.user.role === 'CLUB_MEMBER', 'login club member', anup.user?.name);
ok(!('passwordHash' in anup.user), 'password hash never returned');
ok((await call('POST', '/auth/login', null, { email: 'nobody@sportsos.demo', password: 'wrong' })).status === 401, 'unknown account → 401');
ok((await call('GET', '/facilities')).status === 401, 'no token → 401');
ok((await call('GET', '/analytics/overview', anup.accessToken)).status === 403, 'student → analytics 403');
ok(admin.permissions.includes('role.manage_permissions') && !admin.permissions.includes('booking.approve') && casual.permissions.includes('booking.create') && !casual.permissions.includes('booking.approve'), 'permission sets (explicit, admin is not an operational approver)', `admin ${admin.permissions.length}, student ${casual.permissions.length}`);
ok((await call('GET', '/auth/me', gsec.accessToken)).data.heldRoles?.includes('GENERAL_SECRETARY'), 'me lists held roles');

// register
ok((await call('POST', '/auth/register', null, { name: 'Out Sider', email: 'x@gmail.com', password: 'longpassword' })).status === 400, 'register non-institute email → 400');
const reg = await call('POST', '/auth/register', null, { name: 'New Fresher', email: `fresher${Date.now() % 100000}@iitism.ac.in`, password: 'longpassword', admissionNo: `26JE${String(Math.floor(Math.random() * 9000) + 1000)}`, hostel: 'Amber' });
ok(reg.status === 201 && reg.data.user.role === 'STUDENT', 'register institute email → STUDENT');

// facilities & bookings
const facilities = (await call('GET', '/facilities', anup.accessToken)).data;
ok(facilities.length === 9, 'facilities listed', facilities.map((f) => `${f.code}:${f.status}`).join(' '));
const bbB = facilities.find((f) => f.code === 'BB-B');
const fb = facilities.find((f) => f.code === 'FB-1');
const day = new Date(Date.now() + 5.5 * 3600e3 + 3 * 86400e3).toISOString().slice(0, 10);
const avail = (await call('GET', `/facilities/${bbB.id}/availability?date=${day}`, anup.accessToken)).data;
const free = avail.slots.find((s) => s.available);
ok(avail.slots.length === 16 && free, 'availability grid', `${avail.slots.length} slots, ${avail.slots.filter((s) => s.available).length} free on ${day}`);
const b1 = await call('POST', '/bookings', casual.accessToken, { facilityId: bbB.id, start: free.start, end: free.end, purpose: 'Smoke test game', type: 'CASUAL', participants: 4 });
ok(b1.status === 201 && b1.data.status === 'APPROVED', 'casual booking auto-approved', b1.data.status ?? JSON.stringify(b1.data));
const clash = await call('POST', '/bookings', anup.accessToken, { facilityId: bbB.id, start: free.start, end: free.end, purpose: 'Clash', type: 'CASUAL' });
ok(clash.status === 409 && /overlaps/.test(clash.data.message), 'overlapping booking → 409', clash.data.message);
const outside = await call('POST', '/bookings', anup.accessToken, { facilityId: bbB.id, start: `${day}T17:00:00.000Z`, end: `${day}T18:00:00.000Z`, purpose: 'Late', type: 'CASUAL' });
ok(outside.status === 400, 'booking outside opening hours → 400', outside.data.message);
const pass = await call('GET', `/bookings/${b1.data.id}/pass`, casual.accessToken);
ok(pass.status === 200 && pass.data.qrDataUrl.startsWith('data:image/png'), 'gate pass QR');
ok((await call('GET', `/bookings/${b1.data.id}/pass`, anup.accessToken)).status === 404, "someone else's pass → 404");
const early = await call('POST', '/bookings/check-in', security.accessToken, { token: 'sportsos://pass/' + pass.data.token });
ok(early.status === 409 && /early/i.test(early.data.message), 'gate check-in too early → 409', early.data.message);
ok((await call('POST', '/bookings/check-in', anup.accessToken, { token: pass.data.token })).status === 403, 'student cannot gate-check-in → 403');
ok((await call('GET', `/bookings/${b1.data.id}`, casual.accessToken)).status === 200, 'GET /bookings/:id owner');
ok((await call('GET', `/bookings/${b1.data.id}`, anup.accessToken)).status === 404, 'GET /bookings/:id other student → 404');
// approval workflow
const fbAvail = (await call('GET', `/facilities/${fb.id}/availability?date=${day}`, anup.accessToken)).data;
const fbFree = fbAvail.slots.find((s) => s.available);
const b2 = await call('POST', '/bookings', anup.accessToken, { facilityId: fb.id, start: fbFree.start, end: fbFree.end, purpose: 'Hostel practice', type: 'CASUAL', participants: 10 });
ok(b2.data.status === 'PENDING', 'approval-required booking → PENDING');
ok((await call('POST', `/bookings/${b2.data.id}/approve`, gsec.accessToken)).status === 403, 'GSec cannot approve bookings (submits requests only)');
const appr = await call('POST', `/bookings/${b2.data.id}/approve`, peso.accessToken);
ok(appr.status === 200 && appr.data.status === 'APPROVED', 'Sports Officer approves');
ok((await call('POST', `/bookings/${b2.data.id}/approve`, peso.accessToken)).status === 409, 'double approve → 409');
const cancel = await call('POST', `/bookings/${b1.data.id}/cancel`, casual.accessToken);
ok(cancel.data.status === 'CANCELLED', 'owner cancels');
ok((await call('POST', `/bookings/${b2.data.id}/cancel`, peso.accessToken, { reason: 'Smoke test cleanup' })).data.status === 'CANCELLED', 'approver cancels with reason'); // keeps reruns under the booking cap

// verified attendance
const clubs = (await call('GET', '/clubs', coach.accessToken)).data;
const football = clubs.find((c) => c.name === 'Football Club');
ok(football.memberCount > 5, 'clubs listed', `football members ${football.memberCount}`);
const sess = await call('POST', '/attendance/sessions', coach.accessToken, { title: 'Smoke practice', facilityId: fb.id, clubId: football.id, endsAt: new Date(Date.now() + 3600e3).toISOString() });
ok(sess.status === 201 && !('secret' in sess.data), 'coach opens session (secret hidden)');
const otp = (await call('GET', `/attendance/sessions/${sess.data.id}/otp`, coach.accessToken)).data;
ok(/^\d{6}$/.test(otp.code) && otp.expiresInSec <= 30, 'rotating OTP', `${otp.code}, ${otp.expiresInSec}s left`);
ok((await call('GET', `/attendance/sessions/${sess.data.id}/otp`, anup.accessToken)).status === 403, 'student cannot read OTP → 403');
const inside = { latitude: fb.latitude + 20 / 111195, longitude: fb.longitude, accuracyM: 8 };
const wrong = await call('POST', '/attendance/check-in', anup.accessToken, { sessionId: sess.data.id, otp: otp.code === '000000' ? '111111' : '000000', ...inside, deviceId: 'device-anup-0001' });
ok(wrong.data.outcome === 'BAD_OTP', 'wrong OTP rejected');
const far = await call('POST', '/attendance/check-in', anup.accessToken, { sessionId: sess.data.id, otp: otp.code, latitude: fb.latitude + 0.01, longitude: fb.longitude, accuracyM: 8, deviceId: 'device-anup-0001' });
ok(far.data.outcome === 'OUT_OF_GEOFENCE', 'outside geofence rejected', `${far.data.distanceM} m`);
const coarse = await call('POST', '/attendance/check-in', anup.accessToken, { sessionId: sess.data.id, otp: otp.code, ...inside, accuracyM: 250, deviceId: 'device-anup-0001' });
ok(coarse.data.outcome === 'LOW_ACCURACY', 'coarse GPS rejected');
const good = await call('POST', '/attendance/check-in', anup.accessToken, { sessionId: sess.data.id, otp: otp.code, ...inside, deviceId: 'device-anup-0001' });
ok(good.data.outcome === 'ACCEPTED' && !('deviceId' in good.data.record), 'valid check-in ACCEPTED', `${good.data.distanceM} m from centre`);
const dup = await call('POST', '/attendance/check-in', anup.accessToken, { sessionId: sess.data.id, otp: otp.code, ...inside, deviceId: 'device-anup-0001' });
ok(dup.data.outcome === 'DUPLICATE', 'second check-in DUPLICATE');
const notMember = await call('POST', '/attendance/check-in', casual.accessToken, { sessionId: sess.data.id, otp: otp.code, ...inside, deviceId: 'device-casual-01' });
ok(notMember.data.outcome === 'NOT_ELIGIBLE', 'non-member NOT_ELIGIBLE');
const detail = (await call('GET', `/clubs/${football.id}`, coach.accessToken)).data;
const mate = detail.members.find((m) => m.status === 'ACTIVE' && m.user.email !== 'club.member@sportsos.demo');
const mateLogin = await login(mate.user.email);
const proxy = await call('POST', '/attendance/check-in', mateLogin.accessToken, { sessionId: sess.data.id, otp: otp.code, ...inside, deviceId: 'device-anup-0001' });
ok(proxy.data.outcome === 'DEVICE_REUSED', 'proxy from same device DEVICE_REUSED');
const roster = (await call('GET', `/attendance/sessions/${sess.data.id}`, coach.accessToken)).data;
ok(roster.records.length === 1 && roster.attendeeCount === 1, 'live roster', roster.records.map((r) => r.user.name).join(', '));
const closed = await call('POST', `/attendance/sessions/${sess.data.id}/close`, coach.accessToken);
ok(closed.data.status === 'CLOSED', 'session closed');
const late = await call('POST', '/attendance/check-in', mateLogin.accessToken, { sessionId: sess.data.id, otp: otp.code, ...inside, deviceId: 'device-mate-0001' });
ok(late.data.outcome === 'SESSION_CLOSED', 'closed session rejects');

// inventory
const items = (await call('GET', '/inventory/items', equip.accessToken)).data;
const ball = items.find((i) => i.name.startsWith('Basketball'));
const low = items.filter((i) => i.lowStock).map((i) => i.name);
ok(items.length === 15 && low.length >= 2, 'inventory listed', `low stock: ${low.join(', ')}`);
ok(items.every((i) => i.totalQty === i.availableQty + i.issuedQty + i.damagedQty), 'stock invariant total = available + issued + damaged');
const byQr = await call('GET', `/inventory/items/by-qr/${ball.qrCode}`, anup.accessToken);
ok(byQr.data.id === ball.id, 'lookup by QR');
const issue = await call('POST', '/inventory/issues', equip.accessToken, { qrCode: 'sportsos://equipment/' + ball.qrCode, borrower: '22ZZ0143', quantity: 2 });
ok(issue.status === 201 && issue.data.borrower.name === '[DEMO] Club Member', 'issue via QR + admission no.');
const over = await call('POST', '/inventory/issues', equip.accessToken, { equipmentId: ball.id, borrower: 'club.member@sportsos.demo', quantity: 99 });
ok(over.status === 400 || over.status === 409, 'over-issue rejected', over.data.message);
const ret = await call('POST', `/inventory/issues/${issue.data.id}/return`, equip.accessToken, { returnedQty: 2, damagedQty: 1 });
ok(ret.data.status === 'RETURNED' && ret.data.damagedQty === 1, 'return with damage');
const after = (await call('GET', `/inventory/items/${ball.id}`, anup.accessToken)).data;
ok(after.availableQty === ball.availableQty - 1 && after.damagedQty === ball.damagedQty + 1, 'stock updated', `available ${ball.availableQty}→${after.availableQty}`);
ok(after.issues.every((i) => i.borrowerId === anup.user.id), 'student sees only own loans on item');
const alerts = (await call('GET', '/inventory/alerts', equip.accessToken)).data;
ok(alerts.lowStock.length >= 2, 'alerts', `${alerts.lowStock.length} low, ${alerts.overdue.length} overdue`);
const verify = (await call('GET', '/audit/verify', peso.accessToken)).data;
ok(verify.valid && verify.checked > 500, 'audit chain valid', `${verify.checked} entries`);
ok((await call('GET', '/audit/verify', anup.accessToken)).status === 403, 'student cannot read audit → 403');

// tournaments
const t = await call('POST', '/tournaments', events.accessToken, { name: 'Smoke Cup', sport: 'Volleyball', format: 'SINGLE_ELIMINATION', startDate: new Date(Date.now() + 86400e3).toISOString() });
ok(t.data.status === 'PROPOSED', 'event committee creates a proposal', t.data.status);
ok((await call('POST', `/tournaments/${t.data.id}/approve`, events.accessToken, {})).status === 403, 'committee cannot approve its own proposal');
ok((await call('GET', `/tournaments/${t.data.id}`, anup.accessToken)).status === 404, 'students cannot see unapproved proposals');
ok((await call('POST', `/tournaments/${t.data.id}/approve`, peso.accessToken, { note: 'Smoke approval' })).data.status === 'DRAFT', 'Sports Officer approves proposal');
for (const [i, n] of ['A', 'B', 'C', 'D', 'E'].entries()) await call('POST', `/tournaments/${t.data.id}/teams`, events.accessToken, { name: `Team ${n}`, seed: i + 1 });
const gen = (await call('POST', `/tournaments/${t.data.id}/generate`, events.accessToken, {})).data;
ok(gen.status === 'ONGOING' && gen.matches.length === 7 && gen.matches.filter((m) => m.status === 'BYE').length === 3, 'bracket generated with byes', `${gen.matches.length} matches`);
let tour = gen;
for (let guard = 0; guard < 10 && tour.status !== 'COMPLETED'; guard++) {
  const next = tour.matches.find((m) => m.status === 'SCHEDULED' && m.homeTeamId && m.awayTeamId);
  if (!next) break;
  const tie = await call('PATCH', `/matches/${next.id}`, events.accessToken, { homeScore: 1, awayScore: 1, status: 'COMPLETED' });
  if (guard === 0) ok(tie.status === 400, 'knock-out draw rejected');
  await call('PATCH', `/matches/${next.id}`, events.accessToken, { homeScore: 3, awayScore: 1, status: 'COMPLETED' });
  tour = (await call('GET', `/tournaments/${t.data.id}`, anup.accessToken)).data;
}
ok(tour.status === 'COMPLETED' && tour.championId === tour.teams.find((x) => x.seed === 1).id, 'bracket played to a champion', tour.teams.find((x) => x.id === tour.championId)?.name);
const league = (await call('GET', '/tournaments', anup.accessToken)).data.find((x) => x.format === 'ROUND_ROBIN');
const lg = (await call('GET', `/tournaments/${league.id}`, anup.accessToken)).data;
ok(lg.standings?.length === 5, 'round-robin standings', lg.standings.map((s) => `${s.team} ${s.points}`).join(', '));

// analytics
for (const p of ['overview', 'participation?weeks=10', 'utilization?days=30', 'forecast?horizon=14', 'equipment', 'integrity?days=30']) {
  const r = await call('GET', `/analytics/${p}`, peso.accessToken);
  if (r.status !== 200) console.log('STATUS', p, r.status, JSON.stringify(r.data));
  ok(r.status === 200, `analytics/${p}`, r.status !== 200 ? '' : p.startsWith('forecast') ? `α=${r.data.model.alpha} β=${r.data.model.beta} γ=${r.data.model.gamma} MAPE=${r.data.model.mape}% points=${r.data.points.length}` : p === 'overview' ? JSON.stringify(r.data).slice(0, 160) : '');
}

// AI
const status = (await call('GET', '/ai/status', anup.accessToken)).data;
ok(status.indexedDocuments > 20, 'ai status', JSON.stringify(status));
const ask = (await call('POST', '/ai/ask', anup.accessToken, { question: 'Which equipment is low on stock?' })).data;
ok(ask.answer.length > 20 && ask.sources.length > 0, 'ai ask (offline RAG)', `top source: ${ask.sources[0]?.title}`);
const sse = await fetch(API + '/ai/ask/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anup.accessToken}` }, body: JSON.stringify({ question: 'Is the tennis court open?' }) });
const sseText = await sse.text();
const evs = sseText.split('\n\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, '')));
ok(sse.headers.get('content-type').startsWith('text/event-stream') && evs[0].type === 'sources' && evs.at(-1).type === 'done', 'ai SSE stream', evs.map((e) => e.type).join(','));
ok(evs[0].sources[0]?.title.includes('Tennis'), 'retrieval ranks tennis doc first', evs[0].sources[0]?.title);
const rep = await call('POST', '/ai/report', peso.accessToken, { period: 'week' });
ok(rep.status === 200 && rep.data.markdown.includes('## Summary'), 'executive report', rep.data.generatedBy);
ok((await call('POST', '/ai/report', anup.accessToken, { period: 'week' })).status === 403, 'student cannot generate report → 403');

// complaints, notifications, achievements
const c = await call('POST', '/complaints', anup.accessToken, { category: 'EQUIPMENT', subject: 'Torn net', description: 'Badminton net on court 2 is torn at the top.' });
ok(c.status === 201, 'raise complaint');
ok((await call('PATCH', `/complaints/${c.data.id}`, peso.accessToken, { status: 'RESOLVED' })).status === 400, 'resolve without note → 400');
ok((await call('PATCH', `/complaints/${c.data.id}`, peso.accessToken, { status: 'RESOLVED', resolution: 'Net replaced' })).data.status === 'RESOLVED', 'resolve complaint');
const unread = (await call('GET', '/notifications/unread-count', anup.accessToken)).data;
ok(unread.count >= 1, 'notifications', `${unread.count} unread for Anup`);
const bc = await call('POST', '/notifications/broadcast', peso.accessToken, { title: 'Ground closed Sunday', body: 'Main ground closed for maintenance.', roles: ['CLUB_MEMBER'] });
ok(bc.data.sent > 30, 'broadcast to club members', `${bc.data.sent} sent`);
const ach = await call('POST', '/achievements', anup.accessToken, { title: 'Smoke medal', sport: 'Football', level: 'HOSTEL', date: '2026-09-01' });
ok((await call('POST', `/achievements/${ach.data.id}/verify`, anup.accessToken)).status === 403, 'cannot self-verify (perm)');
ok((await call('POST', `/achievements/${ach.data.id}/verify`, coach.accessToken)).data.verified === true, 'coach verifies achievement');
const prof = (await call('GET', `/users/${anup.user.id}/profile`, anup.accessToken)).data;
ok(prof.stats.checkIns > 0 && prof.clubs.length === 2, 'profile', JSON.stringify(prof.stats));
ok((await call('GET', `/users/${peso.user.id}/profile`, anup.accessToken)).status === 403, "student can't view others' profile");
ok((await call('PATCH', `/users/${anup.user.id}`, peso.accessToken, { role: 'ADMIN' })).status === 400, 'roles cannot be set through PATCH /users');
ok((await call('POST', '/rbac/assignments', peso.accessToken, { userId: anup.user.id, role: 'ADMIN', reason: 'smoke' })).status === 403, 'PESO cannot grant ADMIN');
const verify2 = (await call('GET', '/audit/verify', peso.accessToken)).data;
ok(verify2.valid && verify2.checked > verify.checked, 'audit chain still valid after activity', `${verify2.checked} entries`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
