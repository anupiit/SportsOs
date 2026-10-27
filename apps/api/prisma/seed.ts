/**
 * Demo data for SportsOS: one account per role, ~60 students, nine facilities,
 * clubs, and ~10 weeks of history (bookings, verified attendance, equipment
 * loans, tournaments) so dashboards and forecasts have something to show.
 *
 * Deterministic (seeded PRNG). Re-running wipes and recreates everything.
 * Facility coordinates are approximate placeholders near the IIT (ISM) campus;
 * survey the real grounds before relying on the geofence.
 */
import { AttemptOutcome, BookingStatus, BookingType, Prisma, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { computeHash, GENESIS_HASH } from '../src/common/hash-chain';
import { roundRobin, singleElimination } from '../src/tournaments/bracket';

const prisma = new PrismaClient();

// ------------------------------------------------------------------ deterministic randomness
let rngState = 20260811;
function rand() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
function shuffle<T>(xs: T[]) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ------------------------------------------------------------------ time helpers (IST)
const IST = 330 * 60_000;
const DAY = 86_400_000;
const now = new Date();
const todayIstMidnight = new Date(Math.floor((now.getTime() + IST) / DAY) * DAY - IST);
/** Instant for IST day offset `d` (0 = today) at minute-of-day `m`. */
const at = (d: number, m: number) => new Date(todayIstMidnight.getTime() + d * DAY + m * 60_000);
/** 0 = Monday … 6 = Sunday, for IST day offset d. */
const weekday = (d: number) => (new Date(at(d, 0).getTime() + IST).getUTCDay() + 6) % 7;

const HISTORY_DAYS = 70;
const FUTURE_DAYS = 10;

// ------------------------------------------------------------------ reference data
const HOSTELS = ['Jasper', 'Amber', 'Diamond', 'Sapphire', 'Topaz', 'Ruby', 'Emerald', 'Opal', 'Rosaline'];
const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Rohan', 'Ishaan', 'Kabir', 'Rahul', 'Siddharth', 'Karan', 'Nikhil', 'Pranav', 'Harsh', 'Yash', 'Ankit', 'Manish', 'Saurabh', 'Deepak', 'Rakesh', 'Abhishek', 'Ananya', 'Diya', 'Isha', 'Kavya', 'Meera', 'Nisha', 'Pooja', 'Priya', 'Riya', 'Sneha', 'Tanvi', 'Shreya'];
const LAST = ['Sharma', 'Verma', 'Singh', 'Kumar', 'Gupta', 'Mishra', 'Yadav', 'Das', 'Mahato', 'Prasad', 'Jha', 'Pandey', 'Sinha', 'Reddy', 'Nair', 'Patel', 'Mondal', 'Ghosh', 'Tiwari', 'Chauhan'];
const BRANCH = ['JE', 'JE', 'JE', 'JM', 'JP'];

interface StaffSeed {
  email: string;
  name: string;
  role: Role;
  hostel?: string;
  admissionNo?: string;
}

const STAFF: StaffSeed[] = [
  { email: 'admin@iitism.ac.in', name: 'System Administrator', role: 'ADMIN' },
  { email: 'director@iitism.ac.in', name: 'Office of the Director', role: 'DIRECTOR' },
  { email: 'dean.sw@iitism.ac.in', name: "Dean (Students' Welfare)", role: 'DEAN_SW' },
  { email: 'spec.president@iitism.ac.in', name: 'President, SPEC', role: 'SPEC_PRESIDENT' },
  { email: 'peso@iitism.ac.in', name: 'Sports Officer (PESO)', role: 'SPORTS_OFFICER' },
  { email: 'gsec.sports@iitism.ac.in', name: 'Aditya Raj (GSec Sports)', role: 'GENERAL_SECRETARY', hostel: 'Diamond', admissionNo: '22JE0901' },
  { email: 'events@iitism.ac.in', name: 'Event Committee Desk', role: 'EVENT_COMMITTEE' },
  { email: 'coach.football@iitism.ac.in', name: 'Coach Ramesh Oraon', role: 'COACH' },
  { email: 'coach.basketball@iitism.ac.in', name: 'Coach Sunita Kerketta', role: 'COACH' },
  { email: 'ground@iitism.ac.in', name: 'Ground Staff (Main Grounds)', role: 'GROUND_STAFF' },
  { email: 'equipment@iitism.ac.in', name: 'Equipment Room Manager', role: 'EQUIPMENT_MANAGER' },
  { email: 'security@iitism.ac.in', name: 'Sports Complex Security', role: 'SECURITY_STAFF' },
  { email: 'operations@iitism.ac.in', name: 'Sports Operations Desk', role: 'OPERATIONS_STAFF' },
  { email: 'council@iitism.ac.in', name: 'Sports Council', role: 'SPORTS_COUNCIL' },
  { email: 'coord.cricket@iitism.ac.in', name: 'Vikram Tudu (Cricket Coordinator)', role: 'SPORT_COORDINATOR', hostel: 'Topaz', admissionNo: '22JE0902' },
  { email: 'hostelsec.jasper@iitism.ac.in', name: 'Rohit Mahto (Jasper Sports Sec.)', role: 'HOSTEL_SECRETARY', hostel: 'Jasper', admissionNo: '23JE0903' },
  { email: 'media@iitism.ac.in', name: 'Sports Media Nominee', role: 'MEDIA_NOMINEE', hostel: 'Amber', admissionNo: '23JE0904' },
  { email: '22je0143@iitism.ac.in', name: 'Anup Kumar', role: 'CLUB_MEMBER', hostel: 'Jasper', admissionNo: '22JE0143' },
  { email: 'student@iitism.ac.in', name: 'Casual Student', role: 'STUDENT', hostel: 'Sapphire', admissionNo: '24JE0999' },
];

// ~23.814 N, 86.441 E — placeholder positions spread across a few hundred metres
const FACILITIES = [
  { code: 'FB-1', name: 'Main Football Ground', type: 'GROUND', sports: ['Football'], latitude: 23.8152, longitude: 86.4408, geofenceRadiusM: 90, openMinute: 360, closeMinute: 1200, slotMinutes: 90, capacity: 40, requiresApproval: true, demand: 1.6 },
  { code: 'CR-1', name: 'Cricket Ground', type: 'GROUND', sports: ['Cricket'], latitude: 23.8161, longitude: 86.4424, geofenceRadiusM: 100, openMinute: 360, closeMinute: 1080, slotMinutes: 120, capacity: 30, requiresApproval: true, demand: 1.0 },
  { code: 'BB-A', name: 'Basketball Court A', type: 'COURT', sports: ['Basketball'], latitude: 23.8139, longitude: 86.4419, geofenceRadiusM: 40, openMinute: 360, closeMinute: 1320, slotMinutes: 60, capacity: 15, requiresApproval: false, demand: 5.5 },
  { code: 'BB-B', name: 'Basketball Court B', type: 'COURT', sports: ['Basketball'], latitude: 23.8137, longitude: 86.4423, geofenceRadiusM: 40, openMinute: 360, closeMinute: 1320, slotMinutes: 60, capacity: 15, requiresApproval: false, demand: 3.5 },
  { code: 'TN-1', name: 'Lawn Tennis Courts', type: 'COURT', sports: ['Tennis'], latitude: 23.8133, longitude: 86.4402, geofenceRadiusM: 50, openMinute: 360, closeMinute: 1260, slotMinutes: 60, capacity: 8, requiresApproval: false, demand: 3.0 },
  { code: 'BD-1', name: 'Badminton Hall (Indoor)', type: 'INDOOR_HALL', sports: ['Badminton', 'Table Tennis'], latitude: 23.8144, longitude: 86.4431, geofenceRadiusM: 40, openMinute: 360, closeMinute: 1320, slotMinutes: 60, capacity: 16, requiresApproval: false, demand: 6.5 },
  { code: 'AT-1', name: 'Athletics Track', type: 'TRACK', sports: ['Athletics'], latitude: 23.8156, longitude: 86.4395, geofenceRadiusM: 120, openMinute: 300, closeMinute: 1200, slotMinutes: 60, capacity: 60, requiresApproval: true, demand: 1.2 },
  { code: 'SW-1', name: 'Swimming Pool', type: 'POOL', sports: ['Swimming'], latitude: 23.8128, longitude: 86.4415, geofenceRadiusM: 50, openMinute: 360, closeMinute: 1200, slotMinutes: 60, capacity: 25, requiresApproval: false, demand: 2.5 },
  { code: 'GY-1', name: 'Gymnasium', type: 'GYM', sports: ['Fitness', 'Weightlifting'], latitude: 23.8147, longitude: 86.4437, geofenceRadiusM: 35, openMinute: 330, closeMinute: 1320, slotMinutes: 60, capacity: 30, requiresApproval: false, demand: 4.0 },
] as const;

const CLUBS = [
  { name: 'Football Club', sport: 'Football', coach: 'coach.football@iitism.ac.in', description: 'Institute football team and practice squad.' },
  { name: 'Basketball Club', sport: 'Basketball', coach: 'coach.basketball@iitism.ac.in', description: 'Men’s and women’s basketball teams.' },
  { name: 'Cricket Club', sport: 'Cricket', coach: null, description: 'Institute cricket squad; run by the cricket coordinator.' },
  { name: 'Badminton Club', sport: 'Badminton', coach: null, description: 'Singles and doubles practice ladder.' },
  { name: 'Athletics Club', sport: 'Athletics', coach: null, description: 'Track and field training group.' },
];

/** Weekly practice: club → facility, IST weekdays (0 = Mon), start minute, duration. */
const PRACTICE = [
  { club: 'Football Club', facility: 'FB-1', days: [0, 2, 4], start: 990, minutes: 90 },
  { club: 'Basketball Club', facility: 'BB-A', days: [1, 3, 5], start: 1080, minutes: 60 },
  { club: 'Cricket Club', facility: 'CR-1', days: [5, 6], start: 360, minutes: 120 },
  { club: 'Badminton Club', facility: 'BD-1', days: [0, 3], start: 1140, minutes: 60 },
  { club: 'Athletics Club', facility: 'AT-1', days: [1, 4], start: 360, minutes: 60 },
];

const EQUIPMENT = [
  { name: 'Football (size 5)', sport: 'Football', category: 'Ball', totalQty: 24, minStock: 6, location: 'Equipment room, rack A' },
  { name: 'Training cones (set of 10)', sport: 'Football', category: 'Training aid', totalQty: 8, minStock: 2, location: 'Equipment room, rack A' },
  { name: 'Cricket bat (SH)', sport: 'Cricket', category: 'Bat', totalQty: 12, minStock: 3, location: 'Cricket pavilion store' },
  { name: 'Cricket ball (leather)', sport: 'Cricket', category: 'Ball', totalQty: 18, minStock: 6, location: 'Cricket pavilion store' },
  { name: 'Batting pads (pair)', sport: 'Cricket', category: 'Protective gear', totalQty: 10, minStock: 3, location: 'Cricket pavilion store' },
  { name: 'Basketball (size 7)', sport: 'Basketball', category: 'Ball', totalQty: 16, minStock: 4, location: 'Equipment room, rack B' },
  { name: 'Badminton racket', sport: 'Badminton', category: 'Racket', totalQty: 20, minStock: 5, location: 'Badminton hall cabinet' },
  { name: 'Shuttlecock tube (feather)', sport: 'Badminton', category: 'Consumable', totalQty: 30, minStock: 10, location: 'Badminton hall cabinet' },
  { name: 'Tennis racket', sport: 'Tennis', category: 'Racket', totalQty: 10, minStock: 3, location: 'Equipment room, rack C' },
  { name: 'Tennis balls (can of 3)', sport: 'Tennis', category: 'Consumable', totalQty: 14, minStock: 4, location: 'Equipment room, rack C' },
  { name: 'Table tennis paddle', sport: 'Table Tennis', category: 'Racket', totalQty: 12, minStock: 4, location: 'Badminton hall cabinet' },
  { name: 'Volleyball', sport: 'Volleyball', category: 'Ball', totalQty: 8, minStock: 2, location: 'Equipment room, rack B' },
  { name: 'Stopwatch', sport: 'Athletics', category: 'Timing', totalQty: 6, minStock: 2, location: 'Track office' },
  { name: 'Relay baton', sport: 'Athletics', category: 'Training aid', totalQty: 8, minStock: 2, location: 'Track office' },
  { name: 'Swimming kickboard', sport: 'Swimming', category: 'Training aid', totalQty: 15, minStock: 4, location: 'Pool store' },
] as const;

const PURPOSES: Record<string, string[]> = {
  Football: ['5-a-side with hostel mates', 'Shooting practice', 'Friendly match'],
  Cricket: ['Net session', 'Hostel practice match', 'Bowling practice'],
  Basketball: ['3-on-3 pickup game', 'Shooting drills', 'Hostel team practice'],
  Tennis: ['Singles practice', 'Doubles match', 'Serve practice'],
  Badminton: ['Doubles practice', 'Singles ladder match', 'Evening game'],
  'Table Tennis': ['Table tennis practice'],
  Athletics: ['Sprint training', 'Endurance run', 'Relay practice'],
  Swimming: ['Lap swimming', 'Swim practice'],
  Fitness: ['Strength training', 'Workout session'],
  Weightlifting: ['Weightlifting session'],
};

// ------------------------------------------------------------------ audit chain built in memory
const auditRows: Prisma.AuditLogCreateManyInput[] = [];
function audit(actorId: string | null, action: string, entity: string, entityId: string, payload: Record<string, unknown>, createdAt: Date) {
  auditRows.push({ actorId, action, entity, entityId, payload: payload as Prisma.InputJsonValue, createdAt, prevHash: '', hash: '' });
}
function sealAudit() {
  auditRows.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
  let prev = GENESIS_HASH;
  for (const row of auditRows) {
    const payload = JSON.parse(JSON.stringify(row.payload));
    row.payload = payload;
    row.prevHash = prev;
    row.hash = computeHash(prev, { actorId: row.actorId ?? null, action: row.action, entity: row.entity, entityId: row.entityId, payload, createdAt: row.createdAt as Date });
    prev = row.hash;
  }
}

function jitter(lat: number, lon: number, maxM: number) {
  const d = Math.sqrt(rand()) * maxM;
  const theta = rand() * 2 * Math.PI;
  return {
    latitude: lat + (d * Math.cos(theta)) / 111_195,
    longitude: lon + (d * Math.sin(theta)) / (111_195 * Math.cos((lat * Math.PI) / 180)),
    distanceM: d,
  };
}

async function main() {
  console.log('Resetting database…');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "AuditLog", "Notification", "Achievement", "Complaint", "Match", "Team", "Tournament",
    "EquipmentIssue", "Equipment", "AttendanceAttempt", "AttendanceRecord", "AttendanceSession",
    "ClubMembership", "Booking", "Club", "Facility", "User" RESTART IDENTITY CASCADE`);

  const passwordHash = await bcrypt.hash('sportsos123', 10);
  const seedStart = at(-HISTORY_DAYS - 1, 480);

  // ---------------------------------------------------------------- users
  const users: { id: string; email: string; name: string; role: Role; hostel: string | null; admissionNo: string | null }[] = [];
  for (const s of STAFF) {
    users.push({ id: randomUUID(), email: s.email, name: s.name, role: s.role, hostel: s.hostel ?? null, admissionNo: s.admissionNo ?? null });
  }
  const usedNames = new Set<string>();
  for (let i = 0; i < 60; i++) {
    let name: string;
    do name = `${pick(FIRST)} ${pick(LAST)}`;
    while (usedNames.has(name));
    usedNames.add(name);
    const year = pick(['22', '23', '24', '25']);
    const admissionNo = `${year}${pick(BRANCH)}${String(1000 + i * 7).padStart(4, '0')}`;
    users.push({ id: randomUUID(), email: `${admissionNo.toLowerCase()}@iitism.ac.in`, name, role: 'STUDENT', hostel: pick(HOSTELS), admissionNo });
  }
  const byEmail = (email: string) => users.find((u) => u.email === email)!;
  const students = users.filter((u) => u.role === 'STUDENT' && u.email !== 'student@iitism.ac.in');
  const anup = byEmail('22je0143@iitism.ac.in');

  // ---------------------------------------------------------------- facilities
  const facilities = FACILITIES.map(({ demand: _d, ...f }) => ({ id: randomUUID(), ...f, sports: [...f.sports] }));
  const facility = (code: string) => facilities.find((f) => f.code === code)!;

  // ---------------------------------------------------------------- clubs & memberships
  const clubs = CLUBS.map((c) => ({ id: randomUUID(), name: c.name, sport: c.sport, description: c.description, coachId: c.coach ? byEmail(c.coach).id : null, createdAt: seedStart }));
  const club = (name: string) => clubs.find((c) => c.name === name)!;
  const memberships: Prisma.ClubMembershipCreateManyInput[] = [];
  const activeMembers = new Map<string, string[]>(clubs.map((c) => [c.id, []]));
  const pool = shuffle(students);
  pool.forEach((s, i) => {
    const primary = clubs[i % clubs.length];
    const picks = [primary, ...(chance(0.3) ? [pick(clubs.filter((c) => c !== primary))] : [])];
    for (const c of picks) {
      const pending = i >= 52; // a few open join requests for coaches to approve
      memberships.push({ clubId: c.id, userId: s.id, status: pending ? 'PENDING' : 'ACTIVE', role: 'MEMBER', joinedAt: at(-HISTORY_DAYS + int(-120, 0), 600) });
      if (!pending) {
        activeMembers.get(c.id)!.push(s.id);
        s.role = 'CLUB_MEMBER';
      }
    }
  });
  // Anup plays football and basketball; captains for the bigger clubs
  for (const c of [club('Football Club'), club('Basketball Club')]) {
    memberships.push({ clubId: c.id, userId: anup.id, status: 'ACTIVE', role: 'MEMBER', joinedAt: at(-200, 600) });
    activeMembers.get(c.id)!.push(anup.id);
  }
  for (const c of clubs) {
    const captain = activeMembers.get(c.id)!.find((id) => id !== anup.id);
    const m = memberships.find((x) => x.clubId === c.id && x.userId === captain);
    if (m) m.role = 'CAPTAIN';
  }
  const coordinator = byEmail('coord.cricket@iitism.ac.in');
  memberships.push({ clubId: club('Cricket Club').id, userId: coordinator.id, status: 'ACTIVE', role: 'VICE_CAPTAIN', joinedAt: at(-300, 600) });

  await prisma.user.createMany({ data: users.map((u) => ({ ...u, passwordHash, createdAt: seedStart })) });
  await prisma.facility.createMany({ data: facilities.map((f) => ({ ...f, type: f.type, createdAt: seedStart })) });
  await prisma.club.createMany({ data: clubs });
  await prisma.clubMembership.createMany({ data: memberships });
  const peso = byEmail('peso@iitism.ac.in');
  audit(byEmail('admin@iitism.ac.in').id, 'system.seed', 'System', 'seed', { users: users.length, facilities: facilities.length }, seedStart);

  // ---------------------------------------------------------------- practice sessions, club bookings, attendance
  console.log('Generating attendance history…');
  const bookings: Prisma.BookingCreateManyInput[] = [];
  const taken = new Map<string, [number, number][]>(); // facilityId → [startMs, endMs]
  const reserve = (facilityId: string, s: Date, e: Date) => {
    const list = taken.get(facilityId) ?? [];
    if (list.some(([a, b]) => a < e.getTime() && b > s.getTime())) return false;
    list.push([s.getTime(), e.getTime()]);
    taken.set(facilityId, list);
    return true;
  };

  const sessions: Prisma.AttendanceSessionCreateManyInput[] = [];
  const records: Prisma.AttendanceRecordCreateManyInput[] = [];
  const attempts: Prisma.AttendanceAttemptCreateManyInput[] = [];
  for (let d = -HISTORY_DAYS; d <= FUTURE_DAYS; d++) {
    for (const p of PRACTICE) {
      if (!p.days.includes(weekday(d))) continue;
      const c = club(p.club);
      const f = facility(p.facility);
      const start = at(d, p.start);
      const end = new Date(start.getTime() + p.minutes * 60_000);
      const organiser = c.coachId ?? coordinator.id;
      reserve(f.id, start, end);
      const past = end < now;
      bookings.push({
        id: randomUUID(), facilityId: f.id, userId: organiser, clubId: c.id, start, end, purpose: `${c.name} practice`, type: 'CLUB_PRACTICE',
        status: past ? 'COMPLETED' : 'APPROVED', participants: Math.min(f.capacity, activeMembers.get(c.id)!.length), approvedById: peso.id,
        checkedInAt: past ? new Date(start.getTime() - 5 * 60_000) : null, createdAt: new Date(start.getTime() - 7 * DAY),
      });
      if (!past) continue;

      const sessionId = randomUUID();
      sessions.push({ id: sessionId, title: `${c.name} practice`, facilityId: f.id, clubId: c.id, createdById: organiser, startsAt: start, endsAt: end, status: 'CLOSED', secret: randomBytes(20).toString('hex'), createdAt: start });
      // turnout grows over the term and dips mid-week
      const turnout = 0.5 + 0.25 * ((d + HISTORY_DAYS) / HISTORY_DAYS) - (weekday(d) === 2 ? 0.08 : 0);
      const devices = new Map<string, string>();
      for (const userId of activeMembers.get(c.id)!) {
        if (!chance(turnout)) continue;
        const device = devices.get(userId) ?? `dev-${userId.slice(0, 8)}`;
        devices.set(userId, device);
        const t = new Date(start.getTime() + int(-8, 20) * 60_000);
        // occasional honest mistakes before the accepted attempt
        if (chance(0.05)) attempts.push({ sessionId, userId, outcome: 'BAD_OTP', accuracyM: 12, deviceId: device, createdAt: new Date(t.getTime() - 40_000) });
        if (chance(0.03)) attempts.push({ sessionId, userId, outcome: 'LOW_ACCURACY', accuracyM: int(120, 400), deviceId: device, createdAt: new Date(t.getTime() - 60_000) });
        if (chance(0.03)) attempts.push({ sessionId, userId, outcome: 'OUT_OF_GEOFENCE', distanceM: int(180, 900), accuracyM: 15, deviceId: device, createdAt: new Date(t.getTime() - 90_000) });
        const pos = jitter(f.latitude, f.longitude, f.geofenceRadiusM * 0.75);
        const accuracyM = int(4, 30);
        records.push({ sessionId, userId, checkedInAt: t, latitude: pos.latitude, longitude: pos.longitude, accuracyM, distanceM: Math.round(pos.distanceM * 10) / 10, deviceId: device });
        attempts.push({ sessionId, userId, outcome: 'ACCEPTED', distanceM: pos.distanceM, accuracyM, deviceId: device, createdAt: t });
      }
      // rare proxy attempt: someone absent tries from a friend's phone
      if (chance(0.06) && devices.size) {
        const absent = activeMembers.get(c.id)!.find((u) => !devices.has(u));
        if (absent) attempts.push({ sessionId, userId: absent, outcome: 'DEVICE_REUSED' as AttemptOutcome, accuracyM: 10, deviceId: [...devices.values()][0], createdAt: new Date(start.getTime() + 15 * 60_000) });
      }
    }
  }

  // ---------------------------------------------------------------- casual bookings with weekly seasonality and growth
  console.log('Generating bookings…');
  const weekdayFactor = [0.9, 0.9, 1.0, 1.0, 0.8, 1.35, 1.45];
  const hourWeight = (m: number) => (m < 480 ? 1.4 : m < 960 ? 0.5 : m < 1140 ? 2.2 : 1.6);
  const bookers = users.filter((u) => u.role === 'STUDENT' || u.role === 'CLUB_MEMBER');
  const upcoming = new Map<string, number>();
  for (const spec of FACILITIES) {
    const f = facility(spec.code);
    const slots: number[] = [];
    for (let m = f.openMinute; m + f.slotMinutes <= f.closeMinute; m += f.slotMinutes) slots.push(m);
    for (let d = -HISTORY_DAYS; d <= FUTURE_DAYS; d++) {
      const growth = 1 + 0.005 * (d + HISTORY_DAYS);
      const expected = spec.demand * weekdayFactor[weekday(d)] * growth * (d > 3 ? 0.55 : 1); // far-future days are only partly booked so far
      const count = Math.max(0, Math.round(expected * (0.7 + rand() * 0.6)));
      const weighted = shuffle(slots).sort((a, b) => hourWeight(b) * rand() - hourWeight(a) * rand());
      let made = 0;
      for (const m of weighted) {
        if (made >= count) break;
        const start = at(d, m);
        const end = new Date(start.getTime() + f.slotMinutes * 60_000);
        if (!reserve(f.id, start, end)) continue;
        made++;
        const past = end < now;
        // respect the live rule of at most 3 upcoming casual bookings (leave headroom for the demo)
        let user = pick(bookers);
        if (!past) {
          const candidates = bookers.filter((u) => u.id !== anup.id && (upcoming.get(u.id) ?? 0) < 2);
          if (!candidates.length) continue;
          user = pick(candidates);
        }
        let status: BookingStatus = past ? 'COMPLETED' : 'APPROVED';
        if (past && chance(0.05)) status = 'CANCELLED';
        if (!past && f.requiresApproval && chance(0.5)) status = 'PENDING';
        if (!past && !f.requiresApproval && chance(0.04)) status = 'CANCELLED';
        const type: BookingType = 'CASUAL';
        if (!past && status !== 'CANCELLED') upcoming.set(user.id, (upcoming.get(user.id) ?? 0) + 1);
        bookings.push({
          id: randomUUID(), facilityId: f.id, userId: user.id, start, end, purpose: pick(PURPOSES[pick(f.sports)] ?? ['Practice']), type, status,
          participants: int(2, Math.min(10, f.capacity)), approvedById: status === 'PENDING' ? null : f.requiresApproval ? peso.id : user.id,
          checkedInAt: status === 'COMPLETED' && chance(0.85) ? new Date(start.getTime() - int(0, 12) * 60_000) : null,
          createdAt: new Date(start.getTime() - int(1, 72) * 3_600_000),
        });
      }
    }
  }
  // Anup's upcoming bookings for the demo
  for (const [code, d, m] of [['BB-A', 1, 1020], ['BD-1', 2, 1200]] as const) {
    const f = facility(code);
    const start = at(d, m);
    const end = new Date(start.getTime() + f.slotMinutes * 60_000);
    if (reserve(f.id, start, end)) {
      bookings.push({ id: randomUUID(), facilityId: f.id, userId: anup.id, start, end, purpose: 'Evening game with hostel mates', type: 'CASUAL', status: 'APPROVED', participants: 4, approvedById: anup.id, createdAt: now });
    }
  }
  await prisma.booking.createMany({ data: bookings });
  await prisma.attendanceSession.createMany({ data: sessions });
  await prisma.attendanceRecord.createMany({ data: records });
  await prisma.attendanceAttempt.createMany({ data: attempts });

  // ---------------------------------------------------------------- equipment & loans
  console.log('Generating equipment ledger…');
  const manager = byEmail('equipment@iitism.ac.in');
  const items = EQUIPMENT.map((e) => ({ id: randomUUID(), ...e, qrCode: randomUUID().replace(/-/g, ''), availableQty: e.totalQty, damagedQty: 0, total: e.totalQty }));
  for (const it of items) audit(manager.id, 'inventory.create', 'Equipment', it.id, { name: it.name, sport: it.sport, totalQty: it.totalQty }, seedStart);
  const issues: Prisma.EquipmentIssueCreateManyInput[] = [];
  const weights = items.map((it) => (it.category === 'Ball' || it.category === 'Racket' || it.category === 'Consumable' ? 3 : 1));
  const pickItem = () => {
    let r = rand() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) if ((r -= weights[i]) < 0) return items[i];
    return items[0];
  };
  type Ev = { t: number; run: () => void };
  const events: Ev[] = [];
  for (let d = -60; d <= 0; d++) {
    const n = Math.round((weekday(d) >= 5 ? 6 : 4) * (0.6 + rand() * 0.8));
    for (let k = 0; k < n; k++) {
      const issuedAt = at(d, int(390, 1200));
      if (issuedAt > now) continue;
      events.push({ t: issuedAt.getTime(), run: () => {
        const it = pickItem();
        const qty = it.category === 'Consumable' || it.category === 'Ball' ? int(1, 2) : 1;
        if (it.availableQty < qty) return;
        it.availableQty -= qty;
        const borrower = pick(bookers);
        const id = randomUUID();
        const dueAt = new Date(issuedAt.getTime() + 4 * 3_600_000);
        const back = new Date(issuedAt.getTime() + int(45, 230) * 60_000);
        const row: Prisma.EquipmentIssueCreateManyInput = { id, equipmentId: it.id, borrowerId: borrower.id, issuedById: manager.id, quantity: qty, issuedAt, dueAt, status: 'ISSUED' };
        issues.push(row);
        audit(manager.id, 'inventory.issue', 'EquipmentIssue', id, { equipmentId: it.id, borrowerId: borrower.id, quantity: qty, dueAt: dueAt.toISOString() }, issuedAt);
        const overdueDemo = d === -1 && chance(0.25);
        if (back > now || overdueDemo) {
          if (dueAt < now) row.status = 'OVERDUE';
          return;
        }
        events.push({ t: back.getTime(), run: () => {
          // consumables and balls wear out faster than everything else
          const wear = it.category === 'Consumable' ? 0.18 : it.category === 'Ball' ? 0.07 : 0.02;
          const damaged = chance(wear) ? 1 : 0;
          const lost = chance(0.012) ? 1 : 0;
          const returnedQty = qty - lost;
          const dmg = Math.min(damaged, returnedQty);
          it.availableQty += returnedQty - dmg;
          it.damagedQty += dmg;
          it.totalQty -= lost;
          Object.assign(row, { status: lost ? 'LOST' : 'RETURNED', returnedAt: back, returnedQty, damagedQty: dmg, receivedById: manager.id });
          audit(manager.id, 'inventory.return', 'EquipmentIssue', id, { equipmentId: it.id, returnedQty, damagedQty: dmg, lostQty: lost }, back);
        } });
        events.sort((a, b) => a.t - b.t);
      } });
    }
  }
  events.sort((a, b) => a.t - b.t);
  while (events.length) events.shift()!.run();
  // two restocks so the ledger shows them
  for (const it of [items[7], items[3]]) {
    it.totalQty += 6;
    it.availableQty += 6;
    audit(peso.id, 'inventory.restock', 'Equipment', it.id, { quantity: 6, note: 'Monthly purchase order' }, at(-20, 660));
  }
  // leave shuttlecocks and cricket balls scarce for the low-stock alert demo
  for (const it of [items[7], items[3]]) {
    const writeOff = Math.max(0, it.availableQty - it.minStock + 1);
    it.availableQty -= writeOff;
    it.damagedQty += writeOff;
    audit(manager.id, 'inventory.damage', 'Equipment', it.id, { quantity: writeOff, note: 'Worn out — moved to damaged stock' }, at(-2, 1080));
  }
  await prisma.equipment.createMany({ data: items.map(({ total: _t, ...it }) => ({ ...it, createdAt: seedStart })) });
  await prisma.equipmentIssue.createMany({ data: issues });

  // ---------------------------------------------------------------- tournaments
  console.log('Generating tournaments…');
  const eventsDesk = byEmail('events@iitism.ac.in');
  const fbHostels = ['Jasper', 'Amber', 'Diamond', 'Sapphire', 'Topaz', 'Emerald'];
  const cup = { id: randomUUID(), name: 'Inter-Hostel Football Cup 2026', sport: 'Football', format: 'SINGLE_ELIMINATION' as const, status: 'ONGOING' as const, description: 'Knock-out cup between hostel teams. Top two seeds receive byes.', startDate: at(-6, 990), facilityId: facility('FB-1').id, organizerId: eventsDesk.id, createdAt: at(-20, 600) };
  const cupTeams = fbHostels.map((h, i) => ({ id: randomUUID(), tournamentId: cup.id, name: `${h} FC`, hostel: h, seed: i + 1 }));
  const bbHostels = ['Ruby', 'Opal', 'Jasper', 'Diamond', 'Topaz'];
  const league = { id: randomUUID(), name: 'Inter-Hostel Basketball League 2026', sport: 'Basketball', format: 'ROUND_ROBIN' as const, status: 'ONGOING' as const, description: 'Every hostel plays every other once; 3 points for a win.', startDate: at(-12, 1080), facilityId: facility('BB-B').id, organizerId: eventsDesk.id, createdAt: at(-25, 600) };
  const leagueTeams = bbHostels.map((h) => ({ id: randomUUID(), tournamentId: league.id, name: `${h} Ballers`, hostel: h, seed: null }));
  const open = { id: randomUUID(), name: "Freshers' Badminton Open", sport: 'Badminton', format: 'SINGLE_ELIMINATION' as const, status: 'DRAFT' as const, description: 'Singles knock-out for first-year students. Registrations open.', startDate: at(9, 1080), facilityId: facility('BD-1').id, organizerId: eventsDesk.id, createdAt: at(-3, 600) };
  const openTeams = ['Kavya Nair', 'Arjun Das', 'Isha Ghosh', 'Pranav Jha'].map((n) => ({ id: randomUUID(), tournamentId: open.id, name: n, hostel: null, seed: null }));
  await prisma.tournament.createMany({ data: [cup, league, open] });
  await prisma.team.createMany({ data: [...cupTeams, ...leagueTeams, ...openTeams] });

  // knock-out: round 1 played, first semi played, second semi and final upcoming
  const ko = singleElimination(cupTeams.length);
  const koIds = new Map(ko.map((m) => [`${m.round}:${m.position}`, randomUUID()]));
  const koRows = ko.map((m) => ({
    id: koIds.get(`${m.round}:${m.position}`)!, tournamentId: cup.id, round: m.round, position: m.position,
    homeTeamId: m.home === null ? null : cupTeams[m.home].id, awayTeamId: m.away === null ? null : cupTeams[m.away].id,
    winnerId: m.winner === null ? null : cupTeams[m.winner].id, status: m.bye ? ('BYE' as const) : ('SCHEDULED' as const),
    homeScore: null as number | null, awayScore: null as number | null, scheduledAt: null as Date | null, facilityId: cup.facilityId,
    nextMatchId: m.next ? koIds.get(`${m.next.round}:${m.next.position}`)! : null, nextSlot: m.next?.slot ?? null,
  }));
  const playKo = (row: (typeof koRows)[number], hs: number, as: number) => {
    Object.assign(row, { homeScore: hs, awayScore: as, status: 'COMPLETED', winnerId: hs > as ? row.homeTeamId : row.awayTeamId });
    const next = koRows.find((r) => r.id === row.nextMatchId);
    if (next) next[row.nextSlot === 0 ? 'homeTeamId' : 'awayTeamId'] = row.winnerId;
    audit(eventsDesk.id, 'match.update', 'Match', row.id, { homeScore: hs, awayScore: as, status: 'COMPLETED', winnerId: row.winnerId }, row.scheduledAt ?? now);
  };
  const playable = koRows.filter((r) => r.status !== 'BYE').sort((a, b) => a.round - b.round || a.position - b.position);
  playable.forEach((r, i) => (r.scheduledAt = at(-6 + i * 2, 990)));
  const r1 = playable.filter((r) => r.round === 1);
  playKo(r1[0], 2, 1);
  playKo(r1[1], 0, 3);
  const semis = playable.filter((r) => r.round === 2);
  if (semis[0].scheduledAt! < now) playKo(semis[0], 1, 0);
  await prisma.match.createMany({ data: koRows });

  // round robin: matches in the past are played
  const rr = roundRobin(leagueTeams.length);
  const rrRows = rr.map((m, i) => {
    const scheduledAt = at(-12 + i * 2, 1080);
    const played = scheduledAt < now;
    const hs = played ? int(38, 78) : null;
    let as = played ? int(38, 78) : null;
    if (played && as === hs) as = (as as number) + 2;
    return {
      id: randomUUID(), tournamentId: league.id, round: m.round, position: m.position, homeTeamId: leagueTeams[m.home!].id, awayTeamId: leagueTeams[m.away!].id,
      homeScore: hs, awayScore: as, winnerId: played ? (hs! > as! ? leagueTeams[m.home!].id : leagueTeams[m.away!].id) : null,
      status: played ? ('COMPLETED' as const) : ('SCHEDULED' as const), scheduledAt, facilityId: league.facilityId,
    };
  });
  await prisma.match.createMany({ data: rrRows });

  // ---------------------------------------------------------------- complaints, achievements, notifications
  const ops = byEmail('operations@iitism.ac.in');
  const ground = byEmail('ground@iitism.ac.in');
  await prisma.complaint.createMany({
    data: [
      { raisedById: anup.id, category: 'FACILITY', subject: 'Floodlight flickering on Basketball Court A', description: 'Two of the four floodlights on Court A flicker after 7 pm, making evening games hard.', facilityId: facility('BB-A').id, status: 'IN_PROGRESS', priority: 'HIGH', assignedToId: ground.id, createdAt: at(-3, 1200) },
      { raisedById: pick(bookers).id, category: 'EQUIPMENT', subject: 'Shuttlecocks run out by evening', description: 'Feather shuttlecocks are usually unavailable after 6 pm on weekdays.', equipmentId: items[7].id, status: 'OPEN', priority: 'MEDIUM', createdAt: at(-1, 1150) },
      { raisedById: pick(bookers).id, category: 'BOOKING', subject: 'Slot shown free but court occupied', description: 'Booked Tennis court 1 at 6 am; another group was already playing without a booking.', facilityId: facility('TN-1').id, status: 'RESOLVED', priority: 'MEDIUM', assignedToId: ops.id, resolution: 'Security now checks passes at the tennis gate during morning hours.', createdAt: at(-9, 400) },
      { raisedById: pick(bookers).id, category: 'FACILITY', subject: 'Pool changing room drain blocked', description: 'Water collects in the men’s changing room.', facilityId: facility('SW-1').id, status: 'OPEN', priority: 'HIGH', createdAt: at(-2, 700) },
      { raisedById: pick(bookers).id, category: 'OTHER', subject: 'Request: extend gym hours during end-sems', description: 'Could the gym stay open until 11 pm during exam weeks?', status: 'CLOSED', priority: 'LOW', assignedToId: peso.id, resolution: 'Hours unchanged this semester; will review before next end-sems.', createdAt: at(-25, 900) },
    ],
  });
  await prisma.achievement.createMany({
    data: [
      { userId: anup.id, title: 'Inter-Hostel Football Cup — Runners-up', sport: 'Football', level: 'HOSTEL', position: '2nd', date: at(-120, 600), verifiedById: byEmail('coach.football@iitism.ac.in').id },
      { userId: anup.id, title: 'Institute Basketball Trials — Selected', sport: 'Basketball', level: 'INSTITUTE', position: 'Squad', date: at(-40, 600), verifiedById: null },
      { userId: students[0].id, title: 'Inter-IIT Sports Meet — Athletics 4×100 m relay', sport: 'Athletics', level: 'INTER_IIT', position: 'Bronze', date: at(-300, 600), verifiedById: peso.id },
      { userId: students[1].id, title: 'State Badminton Championship — Quarter-finalist', sport: 'Badminton', level: 'STATE', position: 'QF', date: at(-90, 600), verifiedById: null },
      { userId: students[2].id, title: 'Inter-Hostel Cricket League — Best Bowler', sport: 'Cricket', level: 'HOSTEL', position: 'Award', date: at(-150, 600), verifiedById: coordinator.id },
    ],
  });
  const welcome = users.map((u) => ({ userId: u.id, title: 'Welcome to SportsOS', body: 'Book facilities, check in to practice and track your sports record in one place.', type: 'INFO' as const, createdAt: seedStart, readAt: u.role === 'STUDENT' ? null : seedStart }));
  await prisma.notification.createMany({
    data: [
      ...welcome,
      { userId: anup.id, title: 'Fixtures out: Inter-Hostel Football Cup 2026', body: 'Jasper FC play the semi-final this week.', type: 'INFO', link: `/events/${cup.id}`, createdAt: at(-6, 600) },
      { userId: peso.id, title: 'Low stock: Shuttlecock tube (feather)', body: `${items[7].availableQty} left in store (reorder level ${items[7].minStock}).`, type: 'ALERT', link: '/inventory', createdAt: at(-2, 1085) },
      { userId: manager.id, title: 'Low stock: Cricket ball (leather)', body: `${items[3].availableQty} left in store (reorder level ${items[3].minStock}).`, type: 'ALERT', link: '/inventory', createdAt: at(-2, 1085) },
    ],
  });
  // ground staff closed the tennis courts for resurfacing
  await prisma.facility.update({ where: { id: facility('TN-1').id }, data: { status: 'MAINTENANCE', statusNote: 'Court 2 resurfacing; expected to reopen in 3 days' } });
  audit(ground.id, 'facility.status', 'Facility', facility('TN-1').id, { from: 'OPEN', to: 'MAINTENANCE', note: 'Court 2 resurfacing; expected to reopen in 3 days' }, at(0, 420) < now ? at(0, 420) : now);

  sealAudit();
  await prisma.auditLog.createMany({ data: auditRows });

  console.log(
    `Seeded ${users.length} users, ${facilities.length} facilities, ${clubs.length} clubs, ${bookings.length} bookings, ` +
      `${sessions.length} attendance sessions (${records.length} check-ins), ${issues.length} equipment loans, ` +
      `3 tournaments, ${auditRows.length} audit entries. Password for all accounts: sportsos123`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
