import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { todayIst } from '../common/time';
import { CreateFacilityDto, FacilityStatusDto, UpdateFacilityDto } from './facilities.dto';
import { FacilitiesService } from './facilities.service';

@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilities: FacilitiesService) {}

  @Get()
  list() {
    return this.facilities.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.facilities.get(id);
  }

  @Get(':id/availability')
  availability(@Param('id') id: string, @Query('date') date?: string) {
    return this.facilities.availability(id, date || todayIst());
  }

  @Post()
  @RequirePermission('facilities:manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFacilityDto) {
    return this.facilities.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission('facilities:manage')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateFacilityDto) {
    return this.facilities.update(user, id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('facilities:status')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: FacilityStatusDto) {
    return this.facilities.setStatus(user, id, dto);
  }
}
