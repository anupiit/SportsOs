import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptOutcome, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { evaluateGeofence } from '../common/geo';
import { currentOtp, newOtpSecret, verifyOtp } from '../common/otp';
import { QR_PREFIX, qrDataUrl } from '../common/qr';
import { userSummary } from '../common/selects';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { can, canIn, permissionScope } from '../rbac/access';
import { CheckInDto, CorrectionDto, CreateSessionDto } from './attendance.dto';

const MAX_SESSION_HOURS = 6;
/** Wrong-OTP attempts allowed per student per session in a 10-minute window (brute-force guard). */
const MAX_BAD_OTP = 5;
/** Students may check in from this long before the session starts. */
const EARLY_MIN = 10;

const sessionInclude = {
  facility: { select: { id: true, name: true, latitude: true, longitude: true, geofenceRadiusM: true } },
  club: { select: { id: true, name: true } },
  _count: { select: { records: true } },
} satisfies Prisma.AttendanceSessionInclude;


const MESSAGES: Record<AttemptOutcome, string> = {
  ACCEPTED: 'Attendance recorded.',
  BAD_OTP: 'The code is wrong or has expired. Read the current code from the coach’s screen.',
  OUT_OF_GEOFENCE: 'You are outside the facility’s geofence. Move onto the ground and try again.',
  LOW_ACCURACY: 'Your GPS fix is too coarse. Enable precise location, step into the open and retry.',
  DUPLICATE: 'You have already checked in to this session.',
  DEVICE_REUSED: 'This device was already used by another student for this session.',
  SESSION_CLOSED: 'This session is not open for check-in.',
  NOT_ELIGIBLE: 'This session is for active members of the club only.',
};

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(actor: AuthUser, dto: CreateSessionDto) {
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt || endsAt <= new Date()) throw new BadRequestException('endsAt must be in the future and after startsAt');
    if (endsAt.getTime() - startsAt.getTime() > MAX_SESSION_HOURS * 3_600_000) throw new BadRequestException(`Sessions last at most ${MAX_SESSION_HOURS} hours`);
    const facility = await this.prisma.facility.findUnique({ where: { id: dto.facilityId } });
    if (!facility) throw new NotFoundException('Facility not found');
    if (facility.status === 'CLOSED') throw new ConflictException(`${facility.name} is closed`);
    if (dto.clubId) {
      const club = await this.prisma.club.findUnique({ where: { id: dto.clubId } });
      if (!club) throw new NotFoundException('Club not found');
      if (!canIn(actor, 'attendance.manage', { clubId: club.id, sport: club.sport })) {
        throw new ForbiddenException('Only the club’s coach, its sport coordinator or the Sports Officer can open a session for it');
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.attendanceSession.create({
        data: { title: dto.title, facilityId: facility.id, clubId: dto.clubId ?? null, createdById: actor.id, startsAt, endsAt, secret: newOtpSecret() },
        include: sessionInclude,
      });
      await this.audit.append(tx, {
        actorId: actor.id,
        action: 'attendance.session.open',
        entity: 'AttendanceSession',
        entityId: session.id,
        payload: { facilityId: facility.id, clubId: dto.clubId ?? null, endsAt: endsAt.toISOString() },
      });
      return shape(session);
    });
  }

  async list(user: AuthUser, status?: string) {
    const now = new Date();
    const wantActive = status !== 'CLOSED';
    const timeFilter: Prisma.AttendanceSessionWhereInput = wantActive
      ? { status: 'ACTIVE', endsAt: { gt: now } }
      : { OR: [{ status: 'CLOSED' }, { endsAt: { lte: now } }] };

    let where: Prisma.AttendanceSessionWhereInput;
    if (can(user, 'attendance.manage') || can(user, 'attendance.view_team')) {
      where = { AND: [timeFilter, this.teamScope(user)] };
    } else {
      const clubs = await this.prisma.clubMembership.findMany({ where: { userId: user.id, status: 'ACTIVE' }, select: { clubId: true } });
      where = { AND: [timeFilter, { OR: [{ clubId: null }, { clubId: { in: clubs.map((c) => c.clubId) } }] }] };
    }
    const rows = await this.prisma.attendanceSession.findMany({ where, include: sessionInclude, orderBy: { startsAt: 'desc' }, take: 100 });
    return rows.map(shape);
  }

  async get(user: AuthUser, id: string) {
    const session = await this.prisma.attendanceSession.findUnique({ where: { id }, include: sessionInclude });
    if (!session) throw new NotFoundException('Session not found');
    const manager = await this.canViewTeam(user, session);
    const records = await this.prisma.attendanceRecord.findMany({
      where: { sessionId: id, ...(manager ? {} : { userId: user.id }) },
      include: { user: { select: userSummary } },
      orderBy: { checkedInAt: 'asc' },
    });
    return { ...shape(session), records: records.map(stripDevice) };
  }

  async otp(user: AuthUser, id: string) {
    const session = await this.prisma.attendanceSession.findUnique({ where: { id }, omit: { secret: false } });
    if (!session) throw new NotFoundException('Session not found');
    await this.assertCanManage(user, session);
    if (!isOpen(session)) throw new ConflictException('Session is closed');
    const { code, step, expiresInSec } = currentOtp(session.secret, session.otpStepSeconds);
    return { sessionId: id, code, step, expiresInSec, qrDataUrl: await qrDataUrl(QR_PREFIX.checkin + id) };
  }

  async close(user: AuthUser, id: string) {
    const session = await this.prisma.attendanceSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    await this.assertCanManage(user, session);
    return this.prisma.$transaction(async (tx) => {
      const closed = await tx.attendanceSession.update({ where: { id }, data: { status: 'CLOSED', endsAt: session.endsAt < new Date() ? session.endsAt : new Date() }, include: sessionInclude });
      await this.audit.append(tx, { actorId: user.id, action: 'attendance.session.close', entity: 'AttendanceSession', entityId: id, payload: { attendees: closed._count.records } });
      return shape(closed);
    });
  }

  /**
   * Verified check-in. Every attempt is logged (accepted or not) so proxy
   * attempts show up in the integrity report. Checks, in order: session open →
   * club eligibility → duplicate → device reuse → brute-force guard → rotating
   * OTP → GPS accuracy and geofence.
   */
  async checkIn(user: AuthUser, dto: CheckInDto) {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: dto.sessionId },
      omit: { secret: false },
      include: { facility: true },
    });
    if (!session) throw new NotFoundException('Session not found');

    const reject = async (outcome: AttemptOutcome, distanceM: number | null = null) => {
      await this.prisma.attendanceAttempt.create({
        data: { sessionId: session.id, userId: user.id, outcome, distanceM, accuracyM: dto.accuracyM, deviceId: dto.deviceId },
      });
      return { outcome, message: MESSAGES[outcome], distanceM: distanceM === null ? null : Math.round(distanceM), record: null as null | ReturnType<typeof stripDevice> };
    };

    const now = Date.now();
    if (!isOpen(session) || now < session.startsAt.getTime() - EARLY_MIN * 60_000) return reject('SESSION_CLOSED');

    if (session.clubId) {
      const member = await this.prisma.clubMembership.findUnique({ where: { clubId_userId: { clubId: session.clubId, userId: user.id } } });
      if (member?.status !== 'ACTIVE') return reject('NOT_ELIGIBLE');
    }

    const existing = await this.prisma.attendanceRecord.findUnique({ where: { sessionId_userId: { sessionId: session.id, userId: user.id } } });
    if (existing) return reject('DUPLICATE');

    if (dto.deviceId) {
      const reused = await this.prisma.attendanceRecord.findFirst({ where: { sessionId: session.id, deviceId: dto.deviceId, userId: { not: user.id } }, include: { user: { select: { name: true } } } });
      if (reused) {
        await this.notifications.notifyUsers([session.createdById], {
          title: 'Possible proxy check-in',
          body: `${user.name} tried to check in to “${session.title}” from the device ${reused.user.name} used.`,
          type: 'ALERT',
          link: '/attendance',
        });
        return reject('DEVICE_REUSED');
      }
    }

    const recentBad = await this.prisma.attendanceAttempt.count({
      where: { sessionId: session.id, userId: user.id, outcome: 'BAD_OTP', createdAt: { gt: new Date(now - 10 * 60_000) } },
    });
    if (recentBad >= MAX_BAD_OTP || !verifyOtp(session.secret, session.otpStepSeconds, dto.otp, now)) return reject('BAD_OTP');

    const fence = evaluateGeofence({
      centerLat: session.facility.latitude,
      centerLon: session.facility.longitude,
      radiusM: session.facility.geofenceRadiusM,
      lat: dto.latitude,
      lon: dto.longitude,
      accuracyM: dto.accuracyM,
    });
    if (!fence.ok) return reject(fence.reason, fence.distanceM);

    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const rec = await tx.attendanceRecord.create({
          data: {
            sessionId: session.id,
            userId: user.id,
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracyM: dto.accuracyM,
            distanceM: fence.distanceM,
            deviceId: dto.deviceId,
          },
          include: { user: { select: userSummary } },
        });
        await tx.attendanceAttempt.create({
          data: { sessionId: session.id, userId: user.id, outcome: 'ACCEPTED', distanceM: fence.distanceM, accuracyM: dto.accuracyM, deviceId: dto.deviceId },
        });
        await this.audit.append(tx, {
          actorId: user.id,
          action: 'attendance.checkin',
          entity: 'AttendanceRecord',
          entityId: rec.id,
          payload: { sessionId: session.id, distanceM: Math.round(fence.distanceM * 10) / 10, accuracyM: dto.accuracyM },
        });
        return rec;
      });
      return { outcome: 'ACCEPTED' as AttemptOutcome, message: MESSAGES.ACCEPTED, distanceM: Math.round(fence.distanceM) as number | null, record: stripDevice(record) };
    } catch (e) {
      // two concurrent submissions from the same student: the unique index decides
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return reject('DUPLICATE');
      throw e;
    }
  }

  /**
   * Manual correction: add a student who could not check in (e.g. phone failure) or
   * remove a wrong record. Always needs a reason; the record is marked MANUAL and
   * carries no coordinates. Every correction is kept in AttendanceCorrection and the audit ledger.
   */
  async correct(actor: AuthUser, sessionId: string, dto: CorrectionDto) {
    const session = await this.prisma.attendanceSession.findUnique({ where: { id: sessionId }, include: { club: true } });
    if (!session) throw new NotFoundException('Session not found');
    await this.assertCanManage(actor, session);
    const key = dto.student.trim();
    const target = await this.prisma.user.findFirst({
      where: { OR: [{ id: key }, { email: { equals: key, mode: 'insensitive' } }, { admissionNo: { equals: key, mode: 'insensitive' } }] },
      select: { id: true, name: true },
    });
    if (!target) throw new NotFoundException('No user with that id, email or admission number');
    if (target.id === actor.id) throw new ForbiddenException('You cannot correct your own attendance');

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendanceRecord.findUnique({ where: { sessionId_userId: { sessionId, userId: target.id } } });
      let recordId: string;
      if (dto.action === 'ADD') {
        if (existing) throw new ConflictException(`${target.name} is already marked present`);
        if (session.clubId) {
          const m = await tx.clubMembership.findUnique({ where: { clubId_userId: { clubId: session.clubId, userId: target.id } } });
          if (m?.status !== 'ACTIVE') throw new ConflictException(`${target.name} is not an active member of ${session.club?.name}`);
        }
        const rec = await tx.attendanceRecord.create({ data: { sessionId, userId: target.id, method: 'MANUAL', checkedInAt: session.startsAt } });
        recordId = rec.id;
      } else {
        if (!existing) throw new NotFoundException(`${target.name} has no attendance record for this session`);
        await tx.attendanceRecord.delete({ where: { id: existing.id } });
        recordId = existing.id;
      }
      const c = await tx.attendanceCorrection.create({
        data: { sessionId, userId: target.id, action: dto.action, reason: dto.reason, actorId: actor.id },
        include: { user: { select: userSummary }, actor: { select: { id: true, name: true } } },
      });
      await this.audit.append(tx, {
        actorId: actor.id,
        action: dto.action === 'ADD' ? 'attendance.correction.add' : 'attendance.correction.remove',
        entity: 'AttendanceRecord',
        entityId: recordId,
        payload: { sessionId, userId: target.id, reason: dto.reason },
      });
      return c;
    });
    await this.notifications.notifyUsers([target.id], {
      title: dto.action === 'ADD' ? 'Attendance added by staff' : 'Attendance record removed',
      body: `${session.title}: ${dto.reason}`,
      type: 'INFO',
      link: '/attendance',
    });
    return result;
  }

  async corrections(user: AuthUser, sessionId: string) {
    const session = await this.prisma.attendanceSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (!(await this.canViewTeam(user, session))) throw new ForbiddenException('Not your team');
    return this.prisma.attendanceCorrection.findMany({
      where: { sessionId },
      include: { user: { select: userSummary }, actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Per-member attendance rate for one club across its sessions in the window. */
  async teamReport(user: AuthUser, clubId: string, days: number) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club not found');
    if (!canIn(user, 'attendance.view_team', { clubId, sport: club.sport })) throw new ForbiddenException('You can only see attendance for teams you are responsible for');
    const from = new Date(Date.now() - days * 86_400_000);
    const [sessions, members] = await Promise.all([
      this.prisma.attendanceSession.findMany({ where: { clubId, startsAt: { gte: from } }, select: { id: true, records: { select: { userId: true, method: true } } } }),
      this.prisma.clubMembership.findMany({ where: { clubId, status: 'ACTIVE' }, include: { user: { select: userSummary } } }),
    ]);
    const rows = members.map((m) => {
      const attended = sessions.filter((s) => s.records.some((r) => r.userId === m.userId)).length;
      const manual = sessions.filter((s) => s.records.some((r) => r.userId === m.userId && r.method === 'MANUAL')).length;
      return { user: m.user, attended, manual, sessions: sessions.length, rate: sessions.length ? Math.round((attended / sessions.length) * 1000) / 10 : null };
    });
    return { club: { id: club.id, name: club.name }, days, sessions: sessions.length, members: rows.sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)) };
  }

  /** Session visibility for staff: everything if unscoped, else sessions they created or for clubs/sports in scope. */
  private teamScope(user: AuthUser): Prisma.AttendanceSessionWhereInput {
    const a = permissionScope(user, 'attendance.manage');
    const v = permissionScope(user, 'attendance.view_team');
    if (a.all || v.all) return {};
    const clubIds = [...a.clubIds, ...v.clubIds];
    const sports = [...a.sports, ...v.sports];
    return {
      OR: [
        { createdById: user.id },
        ...(clubIds.length ? [{ clubId: { in: clubIds } }] : []),
        ...sports.map((sport) => ({ club: { sport: { equals: sport, mode: 'insensitive' as const } } })),
      ],
    };
  }

  private async canViewTeam(user: AuthUser, session: { createdById: string; clubId: string | null }) {
    if (session.createdById === user.id) return true;
    const scope = permissionScope(user, 'attendance.view_team');
    if (scope.all) return true;
    if (!session.clubId) return false;
    const club = await this.prisma.club.findUnique({ where: { id: session.clubId }, select: { id: true, sport: true } });
    return !!club && (canIn(user, 'attendance.view_team', { clubId: club.id, sport: club.sport }) || canIn(user, 'attendance.manage', { clubId: club.id, sport: club.sport }));
  }

  private async assertCanManage(user: AuthUser, session: { createdById: string; clubId: string | null; club?: { id: string; sport: string } | null }) {
    if (session.createdById === user.id && can(user, 'attendance.manage')) return;
    if (permissionScope(user, 'attendance.manage').all) return;
    const club = session.club ?? (session.clubId ? await this.prisma.club.findUnique({ where: { id: session.clubId }, select: { id: true, sport: true } }) : null);
    if (club && canIn(user, 'attendance.manage', { clubId: club.id, sport: club.sport })) return;
    throw new ForbiddenException('Only the session’s creator or staff responsible for the team can do this');
  }

  async mine(user: AuthUser) {
    const rows = await this.prisma.attendanceRecord.findMany({
      where: { userId: user.id },
      include: { session: { select: { id: true, title: true, startsAt: true } } },
      orderBy: { checkedInAt: 'desc' },
      take: 100,
    });
    return rows.map(stripDevice);
  }

}

function isOpen(s: { status: string; endsAt: Date }) {
  return s.status === 'ACTIVE' && s.endsAt.getTime() > Date.now();
}

function shape<T extends { status: string; endsAt: Date; _count: { records: number } }>(s: T) {
  const { _count, ...rest } = s;
  return { ...rest, status: isOpen(s) ? ('ACTIVE' as const) : ('CLOSED' as const), attendeeCount: _count.records };
}

/** Device identifiers are kept for proxy detection but never sent back to clients. */
function stripDevice<T extends { deviceId?: string | null }>(r: T): Omit<T, 'deviceId'> {
  const { deviceId: _omit, ...rest } = r;
  return rest;
}
