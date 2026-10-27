'use client';

import clsx from 'clsx';
import { BarChart3, Table2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui';

/**
 * Card wrapper for every chart: title, optional legend row, and a chart/table
 * toggle so no value is reachable only by hovering (a11y relief for low-contrast hues).
 */
export function ChartFrame({
  title,
  description,
  legend,
  chart,
  table,
  dimmed,
  className,
  aside,
}: {
  title: ReactNode;
  description?: ReactNode;
  legend?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  /** Refetch in progress: hold the previous render at reduced opacity. */
  dimmed?: boolean;
  className?: string;
  aside?: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description={description}
        actions={
          <div className="flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label="View">
            {(
              [
                { v: 'chart', icon: <BarChart3 className="size-3.5" />, label: 'Chart' },
                { v: 'table', icon: <Table2 className="size-3.5" />, label: 'Table' },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={view === o.v}
                onClick={() => setView(o.v)}
                className={clsx(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-xs',
                  view === o.v ? 'bg-surface-2 font-medium text-text' : 'text-muted hover:text-text',
                )}
              >
                {o.icon}
                {o.label}
              </button>
            ))}
          </div>
        }
      />
      <CardBody>
        <div className={clsx('transition-opacity', dimmed && 'opacity-60')}>
          {view === 'chart' ? (
            <>
              {legend && <div className="mb-3">{legend}</div>}
              {chart}
            </>
          ) : (
            <div className="max-h-[360px] overflow-auto">{table}</div>
          )}
        </div>
        {aside}
      </CardBody>
    </Card>
  );
}

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  value?: ReactNode;
  shape?: 'line' | 'rect' | 'dashed';
}

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-2 text-xs text-text-2">
          {i.shape === 'rect' ? (
            <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />
          ) : (
            <svg width="16" height="8" aria-hidden>
              <line
                x1="1"
                y1="4"
                x2="15"
                y2="4"
                stroke={i.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={i.shape === 'dashed' ? '3 3' : undefined}
              />
            </svg>
          )}
          <span>{i.label}</span>
          {i.value !== undefined && <span className="font-semibold text-text">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

export interface TooltipRow {
  key: string;
  label: string;
  color: string;
  value: ReactNode;
  shape?: 'line' | 'rect' | 'dashed';
}

/** Values lead, labels follow; rows keyed with a short line in the series color. */
export function TooltipBox({ title, rows }: { title: ReactNode; rows: TooltipRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="min-w-[160px] rounded-lg border border-border bg-surface px-3 py-2 shadow-[var(--shadow-lg)]">
      <p className="mb-1.5 text-[11px] font-medium text-muted">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            {r.shape === 'rect' ? (
              <span className="size-2.5 rounded-[3px]" style={{ background: r.color }} aria-hidden />
            ) : (
              <svg width="12" height="6" aria-hidden>
                <line x1="1" y1="3" x2="11" y2="3" stroke={r.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={r.shape === 'dashed' ? '3 2' : undefined} />
              </svg>
            )}
            <span className="text-sm font-semibold text-text tabular">{r.value}</span>
            <span className="text-xs text-text-2">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const AXIS_TICK = { fill: 'var(--chart-muted)', fontSize: 11 } as const;
export const AXIS_LINE = { stroke: 'var(--chart-axis)' } as const;
