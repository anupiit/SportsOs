import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators';
import { AnalyticsService } from './analytics.service';

const clamp = (raw: string | undefined, def: number, min: number, max: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && raw !== undefined && raw !== '' ? Math.min(max, Math.max(min, Math.floor(n))) : def;
};

@Controller('analytics')
@RequirePermission('analytics:read')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview() {
    return this.analytics.overview();
  }

  @Get('participation')
  participation(@Query('weeks') weeks?: string) {
    return this.analytics.participation(clamp(weeks, 12, 1, 52));
  }

  @Get('utilization')
  utilization(@Query('days') days?: string) {
    return this.analytics.utilization(clamp(days, 30, 1, 365));
  }

  @Get('forecast')
  forecast(@Query('facilityId') facilityId?: string, @Query('horizon') horizon?: string, @Query('history') history?: string) {
    return this.analytics.forecast(facilityId || undefined, clamp(horizon, 14, 1, 60), clamp(history, 56, 14, 365));
  }

  @Get('equipment')
  equipment() {
    return this.analytics.equipment();
  }

  @Get('integrity')
  integrity(@Query('days') days?: string) {
    return this.analytics.integrity(clamp(days, 30, 1, 365));
  }
}
