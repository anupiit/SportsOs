import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { BookingStatus, Facility, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { QR_PREFIX, qrDataUrl, stripQrPrefix } from '../common/qr';
import { userMinimal, userSummary } from '../common/selects';
import { istDateString, istMinuteOfDay } from '../common/time';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { can, canIn, permissionScope } from '../rbac/access';
import { CreateBookingDto, RescheduleBookingDto } from './bookings.dto';

const MAX_DURATION_MIN = 240;
const MAX_ADVANCE_DAYS = 30;
const MAX_ACTIVE_CASUAL = 3;
/** Statuses that hold a slot. */
const HOLDING: BookingStatus[] = ['PENDING', 'APPROVED'];

const include = {
  facility: { select: { id: true, name: true, code: true } },
  user: { select: userSummary },
  club: { select: { id: true, name: true } },
} satisfies Prisma.BookingInclude;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  list(user: AuthUser, q: { scope?: string; status?: string; facilityId?: string; from?: string; to?: string }) {
    const all = q.scope === 'all';
    if (all && !can(user, 'booking.view_all')) throw new ForbiddenException('Requires permission: booking.view_all');
    const where: Prisma.BookingWhereInput = {
      ...(all ? this.scheduleScope(user) : { userId: user.id }),
      ...(q.status ? { status: q.status as BookingStatus } : {}),
      ...(q.facilityId ? { facilityId: q.facilityId } : {}),
      ...(q.from || q.to
        ? { start: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } }
        : {}),
    };
    return this.prisma.booking.findMany({ where, include, orderBy: { start: all ? 'asc' : 'desc' }, take: 300 });
  }

  async get(user: AuthUser, id: string) {
    const b = await this.prisma.booking.findUnique({ where: { id }, include });
    if (!b || (b.userId !== user.id && !canIn(user, 'booking.view_all', { facilityId: b.facilityId }))) throw new NotFoundException('Booking not found');
    return b;
  }

  /** Gate entry log for security staff: minimum identification only. */
  async entryLog(date: string) {
    const dayStart = new Date(`${date}T00:00:00+05:30`);
    if (Number.isNaN(dayStart.getTime())) throw new BadRequestException('date must be YYYY-MM-DD');
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    return this.prisma.booking.findMany({
      where: { status: { in: ['APPROVED', 'COMPLETED'] }, start: { lt: dayEnd }, end: { gt: dayStart } },
      select: {
        id: true, start: true, end: true, type: true, status: true, participants: true, checkedInAt: true,
        facility: { select: { id: true, name: true, code: true } },
        user: { select: userMinimal },
      },
      orderBy: { start: 'asc' },
    });
  }

  async create(user: AuthUser, dto: CreateBookingDto) {
    const start = new Date(dto.start);
    const end = new Date(dto.end);
    const facility = await this.prisma.facility.findUnique({ where: { id: dto.facilityId } });
    if (!facility) throw new NotFoundException('Facility not found');
    const participants = dto.participants ?? 1;
    validateSlot(facility, start, end, participants, dto.type);

    await this.assertTypeAllowed(user, dto);
    if (dto.type === 'CASUAL') {
      const active = await this.prisma.booking.count({ where: { userId: user.id, type: 'CASUAL', status: { in: HOLDING }, end: { gt: new Date() } } });
      if (active >= MAX_ACTIVE_CASUAL) throw new ConflictException(`You already hold ${MAX_ACTIVE_CASUAL} upcoming casual bookings`);
    }

    const autoApprove =
      dto.type === 'MAINTENANCE' ||
      can(user, 'booking.manage') ||
      (dto.type === 'CASUAL' && !facility.requiresApproval);

    const booking = await this.prisma.$transaction(async (tx) => {
      await this.lockFacility(tx, facility.id);
      await this.assertFree(tx, facility.id, start, end);
      const created = await tx.booking.create({
        data: {
          facilityId: facility.id,
          userId: user.id,
          clubId: dto.type === 'CLUB_PRACTICE' ? dto.clubId : null,
          start,
          end,
          purpose: dto.purpose,
          type: dto.type,
          participants,
          status: autoApprove ? 'APPROVED' : 'PENDING',
          approvedById: autoApprove ? user.id : null,
        },
        include,
      });
      await this.audit.append(tx, {
        actorId: user.id,
        action: 'booking.create',
        entity: 'Booking',
        entityId: created.id,
        payload: { facilityId: facility.id, start: start.toISOString(), end: end.toISOString(), type: dto.type, status: created.status },
      });
      return created;
    });

    if (booking.status === 'PENDING') {
      await this.notifications.notifyPermission('booking.approve', {
        title: 'Booking awaiting approval',
        body: `${user.name} requested ${facility.name} (${fmtRange(start, end)}) — ${dto.purpose}`,
        type: 'APPROVAL',
        link: '/bookings?tab=approvals',
      }, undefined, [user.id]);
    }
    return booking;
  }

  /** Moves a booking to a new slot on the same facility, with the same checks as a new booking. */
  async reschedule(actor: AuthUser, id: string, dto: RescheduleBookingDto) {
    const b = await this.prisma.booking.findUnique({ where: { id }, include: { facility: true } });
    if (!b) throw new NotFoundException('Booking not found');
    const owner = b.userId === actor.id;
    if (!owner && !can(actor, 'booking.cancel')) throw new ForbiddenException('Not your booking');
    if (!HOLDING.includes(b.status)) throw new ConflictException(`Booking is already ${b.status.toLowerCase()}`);
    if (b.start <= new Date()) throw new ConflictException('A booking that has started cannot be rescheduled');
    if (b.rescheduleCount >= 3 && !can(actor, 'booking.manage')) throw new ConflictException('This booking has been rescheduled the maximum of 3 times');
    const start = new Date(dto.start);
    const end = new Date(dto.end);
    validateSlot(b.facility, start, end, b.participants, b.type);
    // an approved slot needing approval goes back to the queue unless an approver moves it
    const needsReview = b.status === 'APPROVED' && b.type !== 'MAINTENANCE' && (b.facility.requiresApproval || b.type !== 'CASUAL') && !can(actor, 'booking.approve');
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockFacility(tx, b.facilityId);
      await this.assertFree(tx, b.facilityId, start, end, b.id);
      const u = await tx.booking.update({
        where: { id },
        data: { start, end, rescheduleCount: { increment: 1 }, ...(needsReview ? { status: 'PENDING', approvedById: null } : {}) },
        include,
      });
      await this.audit.append(tx, {
        actorId: actor.id,
        action: 'booking.reschedule',
        entity: 'Booking',
        entityId: id,
        payload: { from: { start: b.start.toISOString(), end: b.end.toISOString() }, to: { start: start.toISOString(), end: end.toISOString() }, status: u.status, reason: dto.reason ?? null },
      });
      return u;
    });
    if (!owner) {
      await this.notifications.notifyUsers([b.userId], { title: 'Booking rescheduled', body: `${b.facility.name} moved to ${fmtRange(start, end)}${dto.reason ? `: ${dto.reason}` : ''}`, type: 'ALERT', link: '/bookings' });
    }
    if (needsReview) {
      await this.notifications.notifyPermission('booking.approve', { title: 'Rescheduled booking needs approval', body: `${b.facility.name}, ${fmtRange(start, end)}`, type: 'APPROVAL', link: '/bookings?tab=approvals' }, undefined, [actor.id]);
    }
    return updated;
  }

  async approve(actor: AuthUser, id: string) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const b = await this.pending(tx, id);
      if (b.userId === actor.id) throw new ForbiddenException('You cannot approve your own booking');
      await this.lockFacility(tx, b.facilityId);
      await this.assertFree(tx, b.facilityId, b.start, b.end, b.id, ['APPROVED']);
      const updated = await tx.booking.update({ where: { id }, data: { status: 'APPROVED', approvedById: actor.id }, include });
      await this.audit.append(tx, { actorId: actor.id, action: 'booking.approve', entity: 'Booking', entityId: id });
      return updated;
    });
    await this.notifications.notifyUsers([booking.userId], {
      title: 'Booking approved',
      body: `${booking.facility.name}, ${fmtRange(booking.start, booking.end)}. Show your pass at the gate.`,
      type: 'APPROVAL',
      link: '/bookings',
    });
    return booking;
  }

  async reject(actor: AuthUser, id: string, reason: string) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const b = await this.pending(tx, id);
      if (b.userId === actor.id) throw new ForbiddenException('You cannot decide on your own booking');
      const updated = await tx.booking.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: reason, approvedById: actor.id }, include });
      await this.audit.append(tx, { actorId: actor.id, action: 'booking.reject', entity: 'Booking', entityId: id, payload: { reason } });
      return updated;
    });
    await this.notifications.notifyUsers([booking.userId], {
      title: 'Booking declined',
      body: `${booking.facility.name}, ${fmtRange(booking.start, booking.end)}: ${reason}`,
      type: 'APPROVAL',
      link: '/bookings',
    });
    return booking;
  }

  async cancel(actor: AuthUser, id: string, reason?: string) {
    const b = await this.prisma.booking.findUnique({ where: { id }, include: { facility: { select: { name: true } } } });
    if (!b) throw new NotFoundException('Booking not found');
    const owner = b.userId === actor.id;
    if (!owner && !can(actor, 'booking.cancel')) throw new ForbiddenException('Not your booking');
    if (!owner && !reason) throw new BadRequestException('A reason is required when cancelling someone else’s booking');
    if (!HOLDING.includes(b.status)) throw new ConflictException(`Booking is already ${b.status.toLowerCase()}`);
    if (b.end <= new Date()) throw new ConflictException('Booking has already ended');
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.booking.update({ where: { id }, data: { status: 'CANCELLED', cancelledById: actor.id, cancelReason: reason ?? null }, include });
      await this.audit.append(tx, { actorId: actor.id, action: 'booking.cancel', entity: 'Booking', entityId: id, payload: { reason: reason ?? null } });
      return u;
    });
    if (!owner) {
      await this.notifications.notifyUsers([b.userId], { title: 'Booking cancelled', body: `${b.facility.name}, ${fmtRange(b.start, b.end)}: ${reason}`, type: 'ALERT', link: '/bookings' });
    }
    return updated;
  }

  async pass(actor: AuthUser, id: string) {
    const b = await this.prisma.booking.findUnique({ where: { id } });
    if (!b || b.userId !== actor.id) throw new NotFoundException('Booking not found');
    if (b.status !== 'APPROVED') throw new ConflictException('Only approved bookings have a gate pass');
    return { bookingId: b.id, token: b.passToken, qrDataUrl: await qrDataUrl(QR_PREFIX.pass + b.passToken) };
  }

  /** Security staff scan the pass at the gate: valid from 15 minutes before start until the end. */
  async checkIn(actor: AuthUser, rawToken: string) {
    const token = stripQrPrefix(rawToken, QR_PREFIX.pass);
    const b = await this.prisma.booking.findUnique({ where: { passToken: token } });
    if (!b) throw new NotFoundException('Unknown pass');
    if (b.status !== 'APPROVED') throw new ConflictException(`Pass is not valid: booking is ${b.status.toLowerCase()}`);
    const now = Date.now();
    if (now < b.start.getTime() - 15 * 60_000) throw new ConflictException('Too early: entry opens 15 minutes before the slot');
    if (now > b.end.getTime()) throw new ConflictException('Pass has expired');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: b.id },
        data: b.checkedInAt ? {} : { checkedInAt: new Date(), checkedInById: actor.id },
        // the gate sees who the pass belongs to, not their email or hostel
        include: { facility: include.facility, club: include.club, user: { select: userMinimal } },
      });
      if (!b.checkedInAt) {
        await this.audit.append(tx, { actorId: actor.id, action: 'booking.checkin', entity: 'Booking', entityId: b.id });
      }
      return updated;
    });
  }

  // ------------------------------------------------------------ helpers

  private async assertTypeAllowed(user: AuthUser, dto: CreateBookingDto) {
    if (dto.type === 'MAINTENANCE' && !canIn(user, 'facility.update_status', { facilityId: dto.facilityId }) && !can(user, 'booking.manage')) {
      throw new ForbiddenException('Only staff assigned to this facility can block slots for maintenance');
    }
    if (dto.type === 'EVENT' && !can(user, 'event.create') && !can(user, 'booking.manage')) throw new ForbiddenException('Only event organisers can book for events');
    if (dto.type === 'CLUB_PRACTICE') {
      if (!dto.clubId) throw new BadRequestException('clubId is required for club practice');
      const club = await this.prisma.club.findUnique({
        where: { id: dto.clubId },
        include: { members: { where: { userId: user.id, status: 'ACTIVE' } } },
      });
      if (!club) throw new NotFoundException('Club not found');
      const leads = club.coachId === user.id || club.members.some((m) => m.role !== 'MEMBER') || canIn(user, 'club.manage_own', { clubId: club.id, sport: club.sport });
      if (!leads && !can(user, 'club.manage')) throw new ForbiddenException("Only the club's coach, coordinator or captains can book practice");
    }
  }

  /** booking.view_all for ground staff is limited to their assigned facilities. */
  private scheduleScope(user: AuthUser): Prisma.BookingWhereInput {
    const scope = permissionScope(user, 'booking.view_all');
    return scope.all ? {} : { facilityId: { in: [...scope.facilityIds] } };
  }

  /** Serialises bookings per facility so two requests cannot both pass the overlap check. */
  private async lockFacility(tx: Tx, facilityId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'booking:' + facilityId}))`;
  }

  private async assertFree(tx: Tx, facilityId: string, start: Date, end: Date, excludeId?: string, statuses: BookingStatus[] = HOLDING) {
    const clash = await tx.booking.findFirst({
      where: { facilityId, status: { in: statuses }, start: { lt: end }, end: { gt: start }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { start: true, end: true, purpose: true },
    });
    if (clash) throw new ConflictException(`Slot overlaps an existing booking (${fmtRange(clash.start, clash.end)}: ${clash.purpose})`);
  }

  private async pending(tx: Tx, id: string) {
    const b = await tx.booking.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status !== 'PENDING') throw new ConflictException(`Booking is already ${b.status.toLowerCase()}`);
    return b;
  }
}

/** Shared slot rules for new and rescheduled bookings. */
function validateSlot(facility: Facility, start: Date, end: Date, participants: number, type: string) {
  const now = Date.now();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !(end > start)) throw new BadRequestException('end must be after start');
  if ((end.getTime() - start.getTime()) / 60_000 > MAX_DURATION_MIN) throw new BadRequestException(`Bookings are limited to ${MAX_DURATION_MIN / 60} hours`);
  if (start.getTime() < now - 5 * 60_000) throw new BadRequestException('Cannot book a slot in the past');
  if (start.getTime() > now + MAX_ADVANCE_DAYS * 86_400_000) throw new BadRequestException(`Bookings open ${MAX_ADVANCE_DAYS} days in advance`);
  if (type !== 'MAINTENANCE' && facility.status !== 'OPEN') throw new ConflictException(`${facility.name} is currently ${facility.status.toLowerCase()}`);
  const endMinute = istMinuteOfDay(end) || 1440;
  if (istDateString(start) !== istDateString(new Date(end.getTime() - 1)) || istMinuteOfDay(start) < facility.openMinute || endMinute > facility.closeMinute) {
    throw new BadRequestException(`${facility.name} is open ${hhmm(facility.openMinute)}–${hhmm(facility.closeMinute)} IST`);
  }
  if (participants > facility.capacity) throw new BadRequestException(`Capacity is ${facility.capacity}`);
}

function hhmm(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function fmtRange(start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false };
  const day = start.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  return `${day} ${start.toLocaleTimeString('en-IN', opts)}–${end.toLocaleTimeString('en-IN', opts)}`;
}
