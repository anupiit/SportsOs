'use client';

import type {
  AttemptOutcome,
  ForecastReport,
  IntegrityReport,
  ParticipationPoint,
  UtilizationReport,
} from '@sportsos/shared';
import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/ui';
import { ATTEMPT_OUTCOME_LABEL } from '@/lib/constants';
import { fmtNumber, fmtPct, fmtShortDate } from '@/lib/format';
import { AXIS_LINE, AXIS_TICK, ChartFrame, ChartLegend, TooltipBox } from './frame';

const S1 = 'var(--series-1)';
const S2 = 'var(--series-2)';
const S3 = 'var(--series-3)';
const GRID = 'var(--chart-grid)';

// ---------------------------------------------------------------- participation (multi-line, 3 series)

const PARTICIPATION_SERIES = [
  { key: 'checkIns', label: 'Verified check-ins', color: S1 },
  { key: 'uniqueParticipants', label: 'Unique participants', color: S2 },
  { key: 'bookings', label: 'Bookings', color: S3 },
] as const;

export function ParticipationChart({ data: raw, dimmed }: { data: ParticipationPoint[]; dimmed?: boolean }) {
  // Drop leading empty weeks (before go-live); the last week is still in progress.
  const start = raw.findIndex((p) => p.checkIns + p.uniqueParticipants + p.bookings > 0);
  const data = start > 0 ? raw.slice(start) : raw;
  const last = data[data.length - 1];
  const partialWeek = last ? Date.now() - new Date(`${last.weekStart}T00:00:00+05:30`).getTime() < 7 * 86400000 : false;
  return (
    <ChartFrame
      title="Weekly participation"
      description={`Verified attendance, distinct students and facility bookings per week${partialWeek ? ' · latest week to date' : ''}`}
      dimmed={dimmed}
      legend={
        <ChartLegend
          items={PARTICIPATION_SERIES.map((s) => ({
            key: s.key,
            label: s.label,
            color: s.color,
            value: last ? fmtNumber(last[s.key]) : undefined,
          }))}
        />
      }
      chart={
        !data.length ? (
          <EmptyState title="No participation data yet" />
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="weekStart" tickFormatter={(v: string) => fmtShortDate(v)} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={16} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
                <Tooltip
                  cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
                  content={(p) => {
                    if (!p.active || !p.payload?.length) return null;
                    const row = p.payload[0].payload as ParticipationPoint;
                    return (
                      <TooltipBox
                        title={`Week of ${fmtShortDate(row.weekStart)}${partialWeek && row.weekStart === last?.weekStart ? ' (to date)' : ''}`}
                        rows={PARTICIPATION_SERIES.map((s) => ({ key: s.key, label: s.label, color: s.color, value: fmtNumber(row[s.key]) }))}
                      />
                    );
                  }}
                />
                {PARTICIPATION_SERIES.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 4, fill: s.color, stroke: 'var(--chart-surface)', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      }
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th>Week of</th>
              {PARTICIPATION_SERIES.map((s) => (
                <th key={s.key} className="num">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.weekStart}>
                <td>{fmtShortDate(r.weekStart)}</td>
                <td className="num">{fmtNumber(r.checkIns)}</td>
                <td className="num">{fmtNumber(r.uniqueParticipants)}</td>
                <td className="num">{fmtNumber(r.bookings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

// ---------------------------------------------------------------- utilization (horizontal bars, single series)

export function UtilizationChart({ report, dimmed }: { report: UtilizationReport; dimmed?: boolean }) {
  const rows = useMemo(() => [...report.facilities].sort((a, b) => b.utilizationPct - a.utilizationPct), [report]);
  const height = Math.max(160, rows.length * 34 + 32);
  return (
    <ChartFrame
      title="Facility utilization"
      description={`Booked hours as a share of open hours, last ${report.days} days`}
      dimmed={dimmed}
      chart={
        !rows.length ? (
          <EmptyState title="No facilities" />
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK, fill: 'var(--chart-ink)' }} axisLine={false} tickLine={false} width={150} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={(p) => {
                    if (!p.active || !p.payload?.length) return null;
                    const r = p.payload[0].payload as (typeof rows)[number];
                    return (
                      <TooltipBox
                        title={r.name}
                        rows={[
                          { key: 'u', label: 'utilized', color: S1, value: fmtPct(r.utilizationPct, 1), shape: 'rect' },
                          { key: 'b', label: `of ${fmtNumber(Math.round(r.availableHours))} open hours`, color: 'transparent', value: `${fmtNumber(Math.round(r.bookedHours))} h`, shape: 'rect' },
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="utilizationPct" fill={S1} barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  <LabelList
                    dataKey="utilizationPct"
                    position="right"
                    formatter={(v: unknown) => fmtPct(Number(v), 0)}
                    style={{ fill: 'var(--chart-ink)', fontSize: 11, fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      }
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th>Facility</th>
              <th className="num">Booked h</th>
              <th className="num">Open h</th>
              <th className="num">Utilization</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.facilityId}>
                <td>{r.name}</td>
                <td className="num">{fmtNumber(Math.round(r.bookedHours * 10) / 10)}</td>
                <td className="num">{fmtNumber(Math.round(r.availableHours))}</td>
                <td className="num">{fmtPct(r.utilizationPct, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

// ---------------------------------------------------------------- heatmap (sequential blue)

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SEQ = ['var(--seq-0)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)', 'var(--seq-6)', 'var(--seq-7)'];

function hourLabel(h: number) {
  const suffix = h < 12 ? 'am' : 'pm';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${suffix}`;
}

export function UtilizationHeatmap({ report, dimmed }: { report: UtilizationReport; dimmed?: boolean }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const { hours, max } = useMemo(() => {
    let lo = 24;
    let hi = -1;
    let mx = 0;
    report.heatmap.forEach((row) =>
      row.forEach((v, h) => {
        if (v > 0) {
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
          mx = Math.max(mx, v);
        }
      }),
    );
    if (hi < 0) {
      lo = 6;
      hi = 21;
    }
    return { hours: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), max: mx };
  }, [report]);

  const step = (v: number) => (v <= 0 || max === 0 ? 0 : Math.min(7, 1 + Math.floor((v / max) * 6.999)));
  const hovered = hover ? report.heatmap[hover.d]?.[hover.h] ?? 0 : null;

  return (
    <ChartFrame
      title="When facilities are busiest"
      description={`Booked hours by weekday and hour of day (IST), last ${report.days} days`}
      dimmed={dimmed}
      chart={
        <div>
          <div className="overflow-x-auto">
            <div
              className="grid gap-[2px]"
              style={{ gridTemplateColumns: `40px repeat(${hours.length}, minmax(22px, 1fr))`, minWidth: 40 + hours.length * 24 }}
              onMouseLeave={() => setHover(null)}
            >
              <div />
              {hours.map((h) => (
                <div key={h} className="pb-1 text-center text-[10px] text-muted tabular">
                  {h % 2 === 0 ? hourLabel(h) : ''}
                </div>
              ))}
              {DAYS.map((day, d) => (
                <div key={day} className="contents">
                  <div className="flex items-center text-[11px] text-text-2">{day}</div>
                  {hours.map((h) => {
                    const v = report.heatmap[d]?.[h] ?? 0;
                    const active = hover?.d === d && hover?.h === h;
                    return (
                      <div
                        key={h}
                        role="img"
                        tabIndex={0}
                        aria-label={`${day} ${hourLabel(h)}: ${v.toFixed(1)} booked hours`}
                        onMouseEnter={() => setHover({ d, h })}
                        onFocus={() => setHover({ d, h })}
                        className="h-7 rounded-[3px] outline-offset-1"
                        style={{
                          background: SEQ[step(v)],
                          boxShadow: active ? '0 0 0 2px var(--chart-surface), 0 0 0 3px var(--text)' : undefined,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <span>Less</span>
              <div className="flex gap-[2px]">
                {SEQ.map((c, i) => (
                  <span key={i} className="h-3 w-5 rounded-[2px]" style={{ background: c }} aria-hidden />
                ))}
              </div>
              <span>More ({max.toFixed(1)} h)</span>
            </div>
            <p className="min-h-4 text-xs text-text-2" aria-live="polite">
              {hover && hovered !== null ? (
                <>
                  <span className="font-semibold text-text tabular">{hovered.toFixed(1)} h</span> booked · {DAYS[hover.d]} {hourLabel(hover.h)}–
                  {hourLabel((hover.h + 1) % 24)}
                </>
              ) : (
                'Hover a cell for details'
              )}
            </p>
          </div>
        </div>
      }
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th>Hour</th>
              {DAYS.map((d) => (
                <th key={d} className="num">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h}>
                <td>{hourLabel(h)}</td>
                {DAYS.map((_, d) => (
                  <td key={d} className="num">
                    {(report.heatmap[d]?.[h] ?? 0).toFixed(1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

// ---------------------------------------------------------------- forecast (actual vs Holt-Winters projection + band)

interface ForecastRow {
  date: string;
  actual: number | null;
  /** Model value: in-sample fit on history, projection on future dates. */
  forecast: number | null;
  /** Dashed projection line: starts at the last actual so the two lines join. */
  projection: number | null;
  band: [number, number] | null;
  lower: number | null;
  upper: number | null;
}

export function ForecastChart({ report, facilityName, dimmed }: { report: ForecastReport; facilityName: string; dimmed?: boolean }) {
  const rows: ForecastRow[] = useMemo(() => {
    // Skip the leading run of zero-activity days (before the system went live).
    const firstActive = report.points.findIndex((p) => p.actual === null || p.actual > 0);
    const points = report.points.slice(Math.max(0, firstActive - 1));
    let lastActual = -1;
    points.forEach((p, i) => {
      if (p.actual !== null) lastActual = i;
    });
    return points.map((p, i) => ({
      ...p,
      projection: i === lastActual ? p.actual : p.actual === null ? p.forecast : null,
      band: p.lower !== null && p.upper !== null ? [Math.max(0, p.lower), p.upper] : null,
    }));
  }, [report]);
  const firstForecast = report.points.find((p) => p.actual === null && p.forecast !== null)?.date;
  const horizon = report.points.filter((p) => p.actual === null && p.forecast !== null);
  const projected = horizon.reduce((s, p) => s + (p.forecast ?? 0), 0);
  const m = report.model;

  return (
    <ChartFrame
      title="Booking demand forecast"
      description={`Daily booked hours — ${facilityName}. Holt-Winters additive model with weekly seasonality.`}
      dimmed={dimmed}
      legend={
        <ChartLegend
          items={[
            { key: 'a', label: 'Actual', color: S1 },
            { key: 'f', label: 'Forecast', color: S2, shape: 'dashed' },
            { key: 'b', label: '95% interval', color: 'color-mix(in srgb, var(--series-2) 18%, transparent)', shape: 'rect' },
          ]}
        />
      }
      chart={
        !rows.length ? (
          <EmptyState title="Not enough history to forecast" />
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 16, right: 16, bottom: 0, left: -8 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="date" tickFormatter={(v: string) => fmtShortDate(v)} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={24} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${v}h`} />
                <Tooltip
                  cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
                  content={(p) => {
                    if (!p.active || !p.payload?.length) return null;
                    const r = p.payload[0].payload as ForecastRow;
                    const out = [];
                    if (r.actual !== null) out.push({ key: 'a', label: 'actual', color: S1, value: `${r.actual.toFixed(1)} h` });
                    if (r.forecast !== null)
                      out.push({
                        key: 'f',
                        label: r.actual !== null ? 'model fit' : 'forecast',
                        color: S2,
                        value: `${r.forecast.toFixed(1)} h`,
                        shape: 'dashed' as const,
                      });
                    if (r.lower !== null && r.upper !== null)
                      out.push({ key: 'b', label: '95% interval', color: 'transparent', value: `${Math.max(0, r.lower).toFixed(1)}–${r.upper.toFixed(1)}`, shape: 'rect' as const });
                    return <TooltipBox title={fmtShortDate(r.date)} rows={out} />;
                  }}
                />
                <Area dataKey="band" stroke="none" fill={S2} fillOpacity={0.12} isAnimationActive={false} connectNulls={false} activeDot={false} />
                {firstForecast && (
                  <ReferenceLine
                    x={firstForecast}
                    stroke="var(--chart-axis)"
                    label={{ value: 'Forecast →', position: 'insideTopLeft', fill: 'var(--chart-muted)', fontSize: 11 }}
                  />
                )}
                <Line type="monotone" dataKey="actual" stroke={S1} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} activeDot={{ r: 4, stroke: 'var(--chart-surface)', strokeWidth: 2, fill: S1 }} />
                <Line
                  type="monotone"
                  dataKey="projection"
                  stroke={S2}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, stroke: 'var(--chart-surface)', strokeWidth: 2, fill: S2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )
      }
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th className="num">Actual (h)</th>
              <th className="num">Model (h)</th>
              <th className="num">Lower</th>
              <th className="num">Upper</th>
            </tr>
          </thead>
          <tbody>
            {report.points.map((p) => (
              <tr key={p.date}>
                <td>{fmtShortDate(p.date)}</td>
                <td className="num">{p.actual?.toFixed(1) ?? '—'}</td>
                <td className="num">{p.forecast?.toFixed(1) ?? '—'}</td>
                <td className="num">{p.lower !== null ? Math.max(0, p.lower).toFixed(1) : '—'}</td>
                <td className="num">{p.upper?.toFixed(1) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
      aside={
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs sm:grid-cols-3 lg:grid-cols-6">
          {[
            { k: 'Level α', v: m.alpha.toFixed(2) },
            { k: 'Trend β', v: m.beta.toFixed(2) },
            { k: 'Season γ', v: m.gamma.toFixed(2) },
            { k: 'Season length', v: `${m.seasonLength} days` },
            { k: 'MAPE', v: m.mape !== null ? fmtPct(m.mape, 1) : '—' },
            { k: 'RMSE', v: `${m.rmse.toFixed(2)} h` },
          ].map((x) => (
            <div key={x.k}>
              <dt className="text-muted">{x.k}</dt>
              <dd className="mt-0.5 font-semibold text-text tabular">{x.v}</dd>
            </div>
          ))}
          {horizon.length > 0 && (
            <div className="col-span-2 sm:col-span-3 lg:col-span-6">
              <dt className="text-muted">Projected demand, next {horizon.length} days</dt>
              <dd className="mt-0.5 text-sm font-semibold text-text">{fmtNumber(Math.round(projected))} booked hours</dd>
            </div>
          )}
        </dl>
      }
    />
  );
}

// ---------------------------------------------------------------- integrity (rejected attempts by reason)

export function IntegrityChart({ report, dimmed }: { report: IntegrityReport; dimmed?: boolean }) {
  const rows = useMemo(
    () =>
      (Object.entries(report.rejected) as [Exclude<AttemptOutcome, 'ACCEPTED'>, number][])
        .map(([reason, count]) => ({ reason, label: ATTEMPT_OUTCOME_LABEL[reason].title, count }))
        .sort((a, b) => b.count - a.count),
    [report],
  );
  const rejected = rows.reduce((s, r) => s + r.count, 0);
  const total = rejected + report.accepted;
  const rate = total ? (rejected / total) * 100 : 0;

  return (
    <ChartFrame
      title="Attendance integrity"
      description={`Rejected check-in attempts by reason, last ${report.days} days`}
      dimmed={dimmed}
      legend={
        <div className="flex flex-wrap gap-6 text-xs text-muted">
          <span>
            <span className="text-lg font-semibold text-text">{fmtNumber(report.accepted)}</span> verified
          </span>
          <span>
            <span className="text-lg font-semibold text-text">{fmtNumber(rejected)}</span> rejected
          </span>
          <span>
            <span className="text-lg font-semibold text-text">{fmtPct(rate, 1)}</span> rejection rate
          </span>
        </div>
      }
      chart={
        !rejected ? (
          <EmptyState title="No rejected attempts" description="Every check-in in this window passed OTP and geofence checks." />
        ) : (
          <div style={{ height: rows.length * 34 + 24 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis type="category" dataKey="label" tick={{ ...AXIS_TICK, fill: 'var(--chart-ink)' }} axisLine={false} tickLine={false} width={190} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={(p) => {
                    if (!p.active || !p.payload?.length) return null;
                    const r = p.payload[0].payload as (typeof rows)[number];
                    return <TooltipBox title={r.label} rows={[{ key: 'c', label: 'attempts', color: S1, value: fmtNumber(r.count), shape: 'rect' }]} />;
                  }}
                />
                <Bar dataKey="count" fill={S1} barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  <LabelList dataKey="count" position="right" style={{ fill: 'var(--chart-ink)', fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      }
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th>Reason</th>
              <th className="num">Attempts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.reason}>
                <td>{r.label}</td>
                <td className="num">{fmtNumber(r.count)}</td>
              </tr>
            ))}
            <tr>
              <td className="font-semibold">Verified (accepted)</td>
              <td className="num font-semibold">{fmtNumber(report.accepted)}</td>
            </tr>
          </tbody>
        </table>
      }
    />
  );
}
