import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptOutcome, Prisma } from '@prisma/client';
import { hasPermission } from '@sportsos/shared';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { evaluateGeofence } from '../common/geo';
import { currentOtp, newOtpSecret, verifyOtp } from '../common/otp';
import { QR_PREFIX, qrDataUrl } from '../common/qr';
import { userSummary } from '../common/selects';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckInDto, CreateSessionDto } from './attendance.dto';

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
      if (club.coachId !== actor.id && !hasPermission(actor.role, 'clubs:manage') && actor.role !== 'SPORT_COORDINATOR') {
        throw new ForbiddenException('Only the club’s coach can open a session for it');
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
    if (hasPermission(user.role, 'attendance:manage')) {
      where = user.role === 'SPORTS_OFFICER' ? timeFilter : { AND: [timeFilter, { createdById: user.id }] };
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
    const manager = session.createdById === user.id || hasPermission(user.role, 'attendance:manage');
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
    this.assertManager(user, session.createdById);
    if (!isOpen(session)) throw new ConflictException('Session is closed');
    const { code, step, expiresInSec } = currentOtp(session.secret, session.otpStepSeconds);
    return { sessionId: id, code, step, expiresInSec, qrDataUrl: await qrDataUrl(QR_PREFIX.checkin + id) };
  }

  async close(user: AuthUser, id: string) {
    const session = await this.prisma.attendanceSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    this.assertManager(user, session.createdById);
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

  async mine(user: AuthUser) {
    const rows = await this.prisma.attendanceRecord.findMany({
      where: { userId: user.id },
      include: { session: { select: { id: true, title: true, startsAt: true } } },
      orderBy: { checkedInAt: 'desc' },
      take: 100,
    });
    return rows.map(stripDevice);
  }

  private assertManager(user: AuthUser, createdById: string) {
    const allowed = createdById === user.id || user.role === 'SPORTS_OFFICER' || user.role === 'ADMIN';
    if (!allowed) throw new ForbiddenException('Only the session’s creator can do this');
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
