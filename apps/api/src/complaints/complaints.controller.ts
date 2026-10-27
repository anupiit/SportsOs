import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { ComplaintCategory, ComplaintStatus, Priority } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { ComplaintsService } from './complaints.service';

const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH'];

export class CreateComplaintDto {
  @IsIn(['FACILITY', 'EQUIPMENT', 'STAFF', 'BOOKING', 'OTHER']) category: ComplaintCategory;
  @IsString() @MinLength(4) @MaxLength(120) subject: string;
  @IsString() @MinLength(10) @MaxLength(4000) description: string;
  @IsOptional() @IsString() facilityId?: string;
  @IsOptional() @IsString() equipmentId?: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
}

export class UpdateComplaintDto {
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) status?: ComplaintStatus;
  @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsString() @MaxLength(2000) resolution?: string;
}

@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.complaints.list(user, status);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateComplaintDto) {
    return this.complaints.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission('complaints:manage')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateComplaintDto) {
    return this.complaints.update(user, id, dto);
  }
}
