import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { MembershipRole, MembershipStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { ClubsService } from './clubs.service';

class CreateClubDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsString() @MinLength(2) @MaxLength(40) sport: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() coachId?: string;
}

class UpdateMemberDto {
  @IsOptional() @IsIn(['PENDING', 'ACTIVE', 'REJECTED', 'LEFT']) status?: MembershipStatus;
  @IsOptional() @IsIn(['MEMBER', 'CAPTAIN', 'VICE_CAPTAIN']) role?: MembershipRole;
}

@Controller('clubs')
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
  @RequirePermission('clubs:manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClubDto) {
    return this.clubs.create(user, dto);
  }

  @Post(':id/join')
  join(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clubs.join(user, id);
  }

  @Patch(':id/members/:membershipId')
  @RequirePermission('clubs:roster')
  updateMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('membershipId') membershipId: string, @Body() dto: UpdateMemberDto) {
    return this.clubs.updateMember(user, id, membershipId, dto);
  }
}
