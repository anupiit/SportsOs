import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { RequireAnyPermission, RequirePermission } from '../common/decorators';
import { AnalyticsService } from './analytics.service';

const clamp = (raw: string | undefined, def: number, min: number, max: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && raw !== undefined && raw !== '' ? Math.min(max, Math.max(min, Math.floor(n))) : def;
};

/** Every figure is computed from the database at request time; nothing is cached or estimated except the labelled forecast. */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @RequirePermission('analytics.view')
  overview() {
    return this.analytics.overview();
  }

  @Get('participation')
  @RequireAnyPermission('analytics.view', 'analytics.participation')
  participation(@Query('weeks') weeks?: string) {
    return this.analytics.participation(clamp(weeks, 12, 1, 52));
  }

  @Get('utilization')
  @RequirePermission('analytics.view')
  utilization(@Query('days') days?: string) {
    return this.analytics.utilization(clamp(days, 30, 1, 365));
  }

  @Get('forecast')
  @RequirePermission('analytics.view')
  forecast(@Query('facilityId') facilityId?: string, @Query('horizon') horizon?: string, @Query('history') history?: string) {
    return this.analytics.forecast(facilityId || undefined, clamp(horizon, 14, 1, 60), clamp(history, 56, 14, 365));
  }

  @Get('equipment')
  @RequireAnyPermission('analytics.view', 'inventory.audit')
  equipment() {
    return this.analytics.equipment();
  }

  @Get('integrity')
  @RequirePermission('analytics.view')
  integrity(@Query('days') days?: string) {
    return this.analytics.integrity(clamp(days, 30, 1, 365));
  }

  @Get('complaints')
  @RequireAnyPermission('analytics.view', 'complaint.view_all')
  complaints(@Query('days') days?: string) {
    return this.analytics.complaints(clamp(days, 90, 1, 365));
  }

  @Get('bookings')
  @RequirePermission('analytics.view')
  bookings(@Query('days') days?: string) {
    return this.analytics.bookingTrends(clamp(days, 30, 1, 365));
  }

  /** CSV export of one report. */
  @Get('export')
  @RequirePermission('analytics.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@Query('report') report?: string, @Query('days') days?: string) {
    const d = clamp(days, 30, 1, 365);
    let rows: Record<string, unknown>[];
    if (report === 'participation') rows = (await this.analytics.participation(clamp(days, 12, 1, 52))) as unknown as Record<string, unknown>[];
    else if (report === 'bookings') rows = await this.analytics.bookingTrends(d);
    else if (report === 'utilization') rows = (await this.analytics.utilization(d)).facilities as unknown as Record<string, unknown>[];
    else if (report === 'complaints') rows = (await this.analytics.complaints(d)).byCategory;
    else throw new BadRequestException('report must be one of participation, bookings, utilization, complaints');
    return toCsv(rows);
  }
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object' || rows[0][k] === null);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    // neutralise spreadsheet formula injection and quote when needed
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}
