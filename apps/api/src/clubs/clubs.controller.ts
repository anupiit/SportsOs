import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { MembershipRole, MembershipStatus } from '@prisma/client';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { ClubsService } from './clubs.service';

export class CreateClubDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsString() @MinLength(2) @MaxLength(40) sport: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() coachId?: string;
}

export class UpdateClubDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  /** a coach's user id, or "" to unassign */
  @IsOptional() @IsString() coachId?: string;
}

class UpdateMemberDto {
  @IsOptional() @IsIn(['PENDING', 'ACTIVE', 'REJECTED', 'LEFT']) status?: MembershipStatus;
  @IsOptional() @IsIn(['MEMBER', 'CAPTAIN', 'VICE_CAPTAIN']) role?: MembershipRole;
}

export class ClubAnnouncementDto {
  @IsString() @MinLength(3) @MaxLength(120) title: string;
  @IsString() @MinLength(3) @MaxLength(2000) body: string;
}

@Controller('clubs')
@RequirePermission('club.view')
export class ClubsController {
  constructor(private readonly clubs: ClubsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.clubs.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clubs.get(user, id);
  }

  @Post()
  @RequirePermission('club.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClubDto) {
    return this.clubs.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission('club.manage')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateClubDto) {
    return this.clubs.update(user, id, dto);
  }

  @Post(':id/join')
  join(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clubs.join(user, id);
  }

  @Post(':id/leave')
  @HttpCode(200)
  leave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clubs.leave(user, id);
  }

  @Patch(':id/members/:membershipId')
  updateMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('membershipId') membershipId: string, @Body() dto: UpdateMemberDto) {
    return this.clubs.updateMember(user, id, membershipId, dto);
  }

  @Get(':id/announcements')
  announcements(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clubs.announcements(user, id);
  }

  @Post(':id/announcements')
  announce(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ClubAnnouncementDto) {
    return this.clubs.announce(user, id, dto);
  }

  @Get(':id/calendar')
  calendar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.clubs.calendar(user, id, from, to);
  }
}

export class CalendarQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
