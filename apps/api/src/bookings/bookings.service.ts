import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { BookingStatus, Prisma } from '@prisma/client';
import { hasPermission, rolesWith } from '@sportsos/shared';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { QR_PREFIX, qrDataUrl, stripQrPrefix } from '../common/qr';
import { userSummary } from '../common/selects';
import { istDateString, istMinuteOfDay } from '../common/time';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { CreateBookingDto } from './bookings.dto';

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
    if (all && !hasPermission(user.role, 'bookings:read_all')) throw new ForbiddenException('Requires permission: bookings:read_all');
    const where: Prisma.BookingWhereInput = {
      ...(all ? {} : { userId: user.id }),
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
    if (!b || (b.userId !== user.id && !hasPermission(user.role, 'bookings:read_all'))) throw new NotFoundException('Booking not found');
    return b;
  }

  async create(user: AuthUser, dto: CreateBookingDto) {
    const start = new Date(dto.start);
    const end = new Date(dto.end);
    const now = Date.now();
    if (!(end > start)) throw new BadRequestException('end must be after start');
    if ((end.getTime() - start.getTime()) / 60_000 > MAX_DURATION_MIN) throw new BadRequestException(`Bookings are limited to ${MAX_DURATION_MIN / 60} hours`);
    if (start.getTime() < now - 5 * 60_000) throw new BadRequestException('Cannot book a slot in the past');
    if (start.getTime() > now + MAX_ADVANCE_DAYS * 86_400_000) throw new BadRequestException(`Bookings open ${MAX_ADVANCE_DAYS} days in advance`);

    const facility = await this.prisma.facility.findUnique({ where: { id: dto.facilityId } });
    if (!facility) throw new NotFoundException('Facility not found');
    if (dto.type !== 'MAINTENANCE' && facility.status !== 'OPEN') throw new ConflictException(`${facility.name} is currently ${facility.status.toLowerCase()}`);
    const endMinute = istMinuteOfDay(end) || 1440;
    if (istDateString(start) !== istDateString(new Date(end.getTime() - 1)) || istMinuteOfDay(start) < facility.openMinute || endMinute > facility.closeMinute) {
      throw new BadRequestException(`${facility.name} is open ${hhmm(facility.openMinute)}–${hhmm(facility.closeMinute)} IST`);
    }
    const participants = dto.participants ?? 1;
    if (participants > facility.capacity) throw new BadRequestException(`Capacity is ${facility.capacity}`);

    await this.assertTypeAllowed(user, dto);
    if (dto.type === 'CASUAL') {
      const active = await this.prisma.booking.count({ where: { userId: user.id, type: 'CASUAL', status: { in: HOLDING }, end: { gt: new Date() } } });
      if (active >= MAX_ACTIVE_CASUAL) throw new ConflictException(`You already hold ${MAX_ACTIVE_CASUAL} upcoming casual bookings`);
    }

    const autoApprove =
      dto.type === 'MAINTENANCE' ||
      hasPermission(user.role, 'bookings:approve') ||
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
      await this.notifications.notifyRoles(rolesWith('bookings:approve').filter((r) => r !== 'ADMIN'), {
        title: 'Booking awaiting approval',
        body: `${user.name} requested ${facility.name} (${fmtRange(start, end)}) — ${dto.purpose}`,
        type: 'APPROVAL',
        link: '/bookings?tab=approvals',
      });
    }
    return booking;
  }

  async approve(actor: AuthUser, id: string) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const b = await this.pending(tx, id);
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
      await this.pending(tx, id);
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

  async cancel(actor: AuthUser, id: string) {
    const b = await this.prisma.booking.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.userId !== actor.id && !hasPermission(actor.role, 'bookings:approve')) throw new ForbiddenException('Not your booking');
    if (!HOLDING.includes(b.status)) throw new ConflictException(`Booking is already ${b.status.toLowerCase()}`);
    if (b.end <= new Date()) throw new ConflictException('Booking has already ended');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({ where: { id }, data: { status: 'CANCELLED' }, include });
      await this.audit.append(tx, { actorId: actor.id, action: 'booking.cancel', entity: 'Booking', entityId: id });
      return updated;
    });
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
      const updated = await tx.booking.update({ where: { id: b.id }, data: { checkedInAt: b.checkedInAt ?? new Date() }, include });
      if (!b.checkedInAt) {
        await this.audit.append(tx, { actorId: actor.id, action: 'booking.checkin', entity: 'Booking', entityId: b.id });
      }
      return updated;
    });
  }

  // ------------------------------------------------------------ helpers

  private async assertTypeAllowed(user: AuthUser, dto: CreateBookingDto) {
    if (dto.type === 'MAINTENANCE' && !hasPermission(user.role, 'facilities:status')) throw new ForbiddenException('Only facility staff can block slots for maintenance');
    if (dto.type === 'EVENT' && !hasPermission(user.role, 'events:manage')) throw new ForbiddenException('Only event organisers can book for events');
    if (dto.type === 'CLUB_PRACTICE') {
      if (!dto.clubId) throw new BadRequestException('clubId is required for club practice');
      const club = await this.prisma.club.findUnique({
        where: { id: dto.clubId },
        include: { members: { where: { userId: user.id, status: 'ACTIVE' } } },
      });
      if (!club) throw new NotFoundException('Club not found');
      const leads = club.coachId === user.id || club.members.some((m) => m.role !== 'MEMBER');
      if (!leads && !hasPermission(user.role, 'clubs:manage')) throw new ForbiddenException("Only the club's coach or captains can book practice");
    }
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

function hhmm(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function fmtRange(start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false };
  const day = start.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  return `${day} ${start.toLocaleTimeString('en-IN', opts)}–${end.toLocaleTimeString('en-IN', opts)}`;
}
