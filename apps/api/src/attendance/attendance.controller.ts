import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { CheckInDto, CreateSessionDto } from './attendance.dto';
import { AttendanceService } from './attendance.service';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('sessions')
  @RequirePermission('attendance:manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSessionDto) {
    return this.attendance.create(user, dto);
  }

  @Get('sessions')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.attendance.list(user, status);
  }

  @Get('sessions/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.attendance.get(user, id);
  }

  @Get('sessions/:id/otp')
  @RequirePermission('attendance:manage')
  otp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.attendance.otp(user, id);
  }

  @Post('sessions/:id/close')
  @HttpCode(200)
  @RequirePermission('attendance:manage')
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.attendance.close(user, id);
  }

  @Post('check-in')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  checkIn(@CurrentUser() user: AuthUser, @Body() dto: CheckInDto) {
    return this.attendance.checkIn(user, dto);
  }

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.attendance.mine(user);
  }
}
