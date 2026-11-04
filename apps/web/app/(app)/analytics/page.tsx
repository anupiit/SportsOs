'use client';

import type {
  EquipmentInsight,
  Facility,
  ForecastReport,
  IntegrityReport,
  OverviewKpis,
  ParticipationPoint,
  UtilizationReport,
} from '@sportsos/shared';
import { AlertTriangle, CalendarCheck, MapPin, Package, ShieldAlert, ShieldCheck, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/components/auth';
import {
  ForecastChart,
  IntegrityChart,
  ParticipationChart,
  UtilizationChart,
  UtilizationHeatmap,
} from '@/components/charts/analytics-charts';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  StatTile,
} from '@/components/ui';
import { fmtNumber, fmtPct } from '@/lib/format';
import { useApi } from '@/lib/hooks';

type Range = '4' | '12' | '26';

function Loading({ h = 'h-80' }: { h?: string }) {
  return <Skeleton className={h} />;
}

function EquipmentTable() {
  const { data, error, isLoading, mutate } = useApi<EquipmentInsight[]>('/analytics/equipment');
  const rows = [...(data ?? [])].sort((a, b) => (a.daysToStockout ?? Infinity) - (b.daysToStockout ?? Infinity));
  return (
    <Card>
      <CardHeader
        title="Equipment wear & stock-out risk"
        description="Units issued per day, damage rate on returns, and projected days until available stock runs out"
        icon={<Package className="size-4" />}
      />
      <CardBody>
        {error ? (
          <ErrorState error={error} onRetry={() => mutate()} />
        ) : isLoading ? (
          <Loading h="h-48" />
        ) : !rows.length ? (
          <EmptyState title="No equipment data" />
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Avail.</th>
                  <th className="num">Out/day</th>
                  <th className="num">Damage</th>
                  <th className="num">Stock-out</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const risk = r.daysToStockout !== null && r.daysToStockout < 7;
                  return (
                    <tr key={r.equipmentId}>
                      <td className="font-medium text-text">{r.name}</td>
                      <td className="num">{fmtNumber(r.availableQty)}</td>
                      <td className="num">{r.avgDailyIssues.toFixed(2)}</td>
                      <td className="num">{fmtPct(r.damageRatePct, 1)}</td>
                      <td className="num">
                        {r.daysToStockout === null ? (
                          <span className="text-muted">—</span>
                        ) : risk ? (
                          <Badge tone="terracotta" icon={<AlertTriangle className="size-3" />}>
                            {r.daysToStockout.toFixed(1)} d
                          </Badge>
                        ) : (
                          `${Math.round(r.daysToStockout)} d`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { can } = useAuth();
  const allowed = can('analytics.view');
  const [range, setRange] = useState<Range>('12');
  const [facilityId, setFacilityId] = useState('');
  const [horizon, setHorizon] = useState('14');
  const weeks = Number(range);
  const days = weeks * 7;

  const { data: facilities } = useApi<Facility[]>(allowed ? '/facilities' : null);
  const overview = useApi<OverviewKpis>(allowed ? '/analytics/overview' : null);
  const participation = useApi<ParticipationPoint[]>(allowed ? '/analytics/participation' : null, { weeks });
  const utilization = useApi<UtilizationReport>(allowed ? '/analytics/utilization' : null, { days });
  const forecast = useApi<ForecastReport>(allowed ? '/analytics/forecast' : null, {
    facilityId: facilityId || undefined,
    horizon,
    history: Math.min(Math.max(days, 28), 120),
  });
  const integrity = useApi<IntegrityReport>(allowed ? '/analytics/integrity' : null, { days });

  if (!allowed) {
    return <EmptyState icon={<ShieldAlert className="size-5" />} title="Restricted" description="Analytics are available to administrators and institute leadership." />;
  }

  const k = overview.data;
  const facilityName = facilityId ? facilities?.find((f) => f.id === facilityId)?.name ?? 'Facility' : 'All facilities';

  return (
    <div>
      <PageHeader
        eyebrow="AI analytics suite"
        title="Analytics"
        description="Participation trends, facility demand and integrity metrics — the data-driven view the paper registers never offered."
        actions={
          <Link href="/assistant">
            <Button variant="accent" icon={<Sparkles className="size-4" />}>
              Generate executive report
            </Button>
          </Link>
        }
      />

      {/* One filter row scopes everything below it. */}
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-surface px-4 py-3">
        <Field label="Time range">
          <Segmented<Range>
            ariaLabel="Time range"
            value={range}
            onChange={setRange}
            options={[
              { value: '4', label: 'Last 4 weeks' },
              { value: '12', label: 'Last 12 weeks' },
              { value: '26', label: 'Last 26 weeks' },
            ]}
          />
        </Field>
        <Field label="Forecast facility" htmlFor="fc-fac">
          <Select id="fc-fac" value={facilityId} onChange={(e) => setFacilityId(e.target.value)} className="w-56">
            <option value="">All facilities</option>
            {(facilities ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Forecast horizon" htmlFor="fc-h">
          <Select id="fc-h" value={horizon} onChange={(e) => setHorizon(e.target.value)} className="w-36">
            {['7', '14', '28'].map((h) => (
              <option key={h} value={h}>
                {h} days
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {overview.error ? (
        <ErrorState error={overview.error} onRetry={() => overview.mutate()} />
      ) : !k ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px]" />
          ))}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Active users" value={fmtNumber(k.activeUsers)} icon={<Users className="size-4" />} />
          <StatTile
            label="Check-ins this week"
            value={fmtNumber(k.attendanceThisWeek)}
            icon={<ShieldCheck className="size-4" />}
            delta={{ value: k.attendanceChangePct, goodWhenUp: true, period: 'vs last week' }}
          />
          <StatTile label="Bookings today" value={fmtNumber(k.bookingsToday)} icon={<CalendarCheck className="size-4" />} sub={`${k.pendingApprovals} pending approval`} />
          <StatTile label="Facilities open" value={`${k.facilities.open}/${k.facilities.total}`} icon={<MapPin className="size-4" />} />
          <StatTile
            label="Equipment out"
            value={fmtNumber(k.equipmentIssued)}
            icon={<Package className="size-4" />}
            sub={`${k.overdueIssues} overdue`}
            tone={k.overdueIssues ? 'warn' : 'neutral'}
          />
          <StatTile label="Rejected check-ins" value={fmtNumber(k.rejectedCheckInsThisWeek)} icon={<ShieldAlert className="size-4" />} sub="this week" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="xl:col-span-2">
          {forecast.error ? (
            <ErrorState error={forecast.error} onRetry={() => forecast.mutate()} />
          ) : !forecast.data ? (
            <Loading h="h-[420px]" />
          ) : (
            <ForecastChart report={forecast.data} facilityName={facilityName} dimmed={forecast.isValidating} />
          )}
        </div>
        {participation.error ? (
          <ErrorState error={participation.error} onRetry={() => participation.mutate()} />
        ) : !participation.data ? (
          <Loading />
        ) : (
          <ParticipationChart data={participation.data} dimmed={participation.isValidating} />
        )}
        {utilization.error ? (
          <ErrorState error={utilization.error} onRetry={() => utilization.mutate()} />
        ) : !utilization.data ? (
          <Loading />
        ) : (
          <UtilizationChart report={utilization.data} dimmed={utilization.isValidating} />
        )}
        <div className="xl:col-span-2">
          {utilization.data && <UtilizationHeatmap report={utilization.data} dimmed={utilization.isValidating} />}
        </div>
        {integrity.error ? (
          <ErrorState error={integrity.error} onRetry={() => integrity.mutate()} />
        ) : !integrity.data ? (
          <Loading />
        ) : (
          <IntegrityChart report={integrity.data} dimmed={integrity.isValidating} />
        )}
        <EquipmentTable />
      </div>
    </div>
  );
}
