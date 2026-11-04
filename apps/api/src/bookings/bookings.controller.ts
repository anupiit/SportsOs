import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { CancelBookingDto, CheckInBookingDto, CreateBookingDto, RejectBookingDto, RescheduleBookingDto } from './bookings.dto';
import { todayIst } from '../common/time';
import { BookingsService } from './bookings.service';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @RequirePermission('booking.view_own')
  list(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('facilityId') facilityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.bookings.list(user, { scope, status, facilityId, from, to });
  }

  @Get('entry-log')
  @RequirePermission('booking.verify')
  entryLog(@Query('date') date?: string) {
    return this.bookings.entryLog(date || todayIst());
  }

  @Post()
  @RequirePermission('booking.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookings.create(user, dto);
  }

  @Post('check-in')
  @HttpCode(200)
  @RequirePermission('booking.verify')
  checkIn(@CurrentUser() user: AuthUser, @Body() dto: CheckInBookingDto) {
    return this.bookings.checkIn(user, dto.token);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('booking.approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.approve(user, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('booking.reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RejectBookingDto) {
    return this.bookings.reject(user, id, dto.reason);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CancelBookingDto) {
    return this.bookings.cancel(user, id, dto.reason);
  }

  @Post(':id/reschedule')
  @HttpCode(200)
  reschedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RescheduleBookingDto) {
    return this.bookings.reschedule(user, id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.get(user, id);
  }

  @Get(':id/pass')
  pass(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.pass(user, id);
  }
}
