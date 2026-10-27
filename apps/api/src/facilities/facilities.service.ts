import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { FacilityAvailability } from '@sportsos/shared';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { istMidnight, todayIst } from '../common/time';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFacilityDto, FacilityStatusDto, UpdateFacilityDto } from './facilities.dto';

@Injectable()
export class FacilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  list() {
    return this.prisma.facility.findMany({ orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const facility = await this.prisma.facility.findUnique({ where: { id } });
    if (!facility) throw new NotFoundException('Facility not found');
    return facility;
  }

  async create(actor: AuthUser, dto: CreateFacilityDto) {
    if (dto.closeMinute <= dto.openMinute) throw new BadRequestException('closeMinute must be after openMinute');
    return this.prisma.$transaction(async (tx) => {
      const facility = await tx.facility.create({ data: dto });
      await this.audit.append(tx, { actorId: actor.id, action: 'facility.create', entity: 'Facility', entityId: facility.id, payload: { ...dto } });
      return facility;
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateFacilityDto) {
    const current = await this.get(id);
    if ((dto.closeMinute ?? current.closeMinute) <= (dto.openMinute ?? current.openMinute)) {
      throw new BadRequestException('closeMinute must be after openMinute');
    }
    return this.prisma.$transaction(async (tx) => {
      const facility = await tx.facility.update({ where: { id }, data: dto });
      await this.audit.append(tx, { actorId: actor.id, action: 'facility.update', entity: 'Facility', entityId: id, payload: { ...dto } });
      return facility;
    });
  }

  /** Live ground status from ground staff; people booked there today are told when it closes. */
  async setStatus(actor: AuthUser, id: string, dto: FacilityStatusDto) {
    const before = await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const facility = await tx.facility.update({ where: { id }, data: { status: dto.status, statusNote: dto.note ?? null } });
      await this.audit.append(tx, {
        actorId: actor.id,
        action: 'facility.status',
        entity: 'Facility',
        entityId: id,
        payload: { from: before.status, to: dto.status, note: dto.note ?? null },
      });
      if (dto.status !== 'OPEN' && before.status === 'OPEN') {
        const now = new Date();
        const endOfDay = new Date(istMidnight(todayIst()).getTime() + 86_400_000);
        const affected = await tx.booking.findMany({
          where: { facilityId: id, status: { in: ['APPROVED', 'PENDING'] }, end: { gt: now }, start: { lt: endOfDay } },
          select: { userId: true },
        });
        await this.notifications.notifyUsers(
          affected.map((b) => b.userId),
          {
            title: `${facility.name} is ${dto.status === 'MAINTENANCE' ? 'under maintenance' : 'closed'}`,
            body: dto.note ? `Ground staff: ${dto.note}` : 'Your booking today may be affected.',
            type: 'ALERT',
            link: `/facilities/${id}`,
          },
          tx,
        );
      }
      return facility;
    });
  }

  async availability(id: string, date: string): Promise<FacilityAvailability> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('date must be YYYY-MM-DD');
    const facility = await this.get(id);
    const dayStart = istMidnight(date);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const bookings = await this.prisma.booking.findMany({
      where: { facilityId: id, status: { in: ['PENDING', 'APPROVED', 'COMPLETED'] }, start: { lt: dayEnd }, end: { gt: dayStart } },
      select: { id: true, purpose: true, type: true, status: true, start: true, end: true },
      orderBy: { start: 'asc' },
    });
    const now = Date.now();
    const slots = [];
    for (let m = facility.openMinute; m + facility.slotMinutes <= facility.closeMinute; m += facility.slotMinutes) {
      const start = new Date(dayStart.getTime() + m * 60_000);
      const end = new Date(start.getTime() + facility.slotMinutes * 60_000);
      const clash = bookings.find((b) => b.start < end && b.end > start);
      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        available: !clash && facility.status === 'OPEN' && end.getTime() > now,
        booking: clash ? { id: clash.id, purpose: clash.purpose, type: clash.type, status: clash.status } : null,
      });
    }
    return { facility: { ...facility, updatedAt: facility.updatedAt.toISOString() }, date, slots };
  }
}
