'use client';

import type { Facility, FacilityStatus } from '@sportsos/shared';
import { Clock, MapPin, Plus, Radar, Users, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '@/components/auth';
import { FacilityFormModal, FacilityStatusModal } from '@/components/facilities';
import { FacilityStatusBadge } from '@/components/status';
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { FACILITY_TYPE_LABEL } from '@/lib/constants';
import { fmtRelative, minutesToHHMM } from '@/lib/format';
import { useApi } from '@/lib/hooks';

type Filter = 'ALL' | FacilityStatus;

export default function FacilitiesPage() {
  const { can } = useAuth();
  const { data, error, isLoading, mutate } = useApi<Facility[]>('/facilities', undefined, { refreshInterval: 60000 });
  const [filter, setFilter] = useState<Filter>('ALL');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [statusFor, setStatusFor] = useState<Facility | null>(null);

  const facilities = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter(
      (f) =>
        (filter === 'ALL' || f.status === filter) &&
        (!needle ||
          f.name.toLowerCase().includes(needle) ||
          f.code.toLowerCase().includes(needle) ||
          f.sports.some((s) => s.toLowerCase().includes(needle))),
    );
  }, [data, filter, q]);

  const counts = useMemo(() => {
    const c = { OPEN: 0, MAINTENANCE: 0, CLOSED: 0 };
    for (const f of data ?? []) c[f.status]++;
    return c;
  }, [data]);

  return (
    <div>
      <PageHeader
        eyebrow="Asset & Club Hub"
        title="Facilities"
        description="Live status of grounds, courts and halls. Pick a facility to see free slots and book."
        actions={
          can('facility.manage') && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New facility
            </Button>
          )
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented<Filter>
          ariaLabel="Filter by status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: `All (${data?.length ?? 0})` },
            { value: 'OPEN', label: `Open (${counts.OPEN})` },
            { value: 'MAINTENANCE', label: `Maintenance (${counts.MAINTENANCE})` },
            { value: 'CLOSED', label: `Closed (${counts.CLOSED})` },
          ]}
        />
        <Input
          placeholder="Search by name, code or sport"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
          aria-label="Search facilities"
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : !facilities.length ? (
        <div className="card">
          <EmptyState icon={<MapPin className="size-5" />} title="No facilities match" description="Try a different filter or search term." />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {facilities.map((f) => (
            <article key={f.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                    {f.code} · {FACILITY_TYPE_LABEL[f.type]}
                  </p>
                  <h2 className="mt-0.5 truncate text-base font-semibold text-text">{f.name}</h2>
                </div>
                <FacilityStatusBadge status={f.status} />
              </div>
              {f.statusNote && (
                <p className="mt-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-text-2">
                  {f.statusNote}
                  <span className="ml-1 text-muted">· {fmtRelative(f.updatedAt)}</span>
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1">
                {f.sports.map((s) => (
                  <Badge key={s} tone="neutral">
                    {s}
                  </Badge>
                ))}
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="flex items-center gap-1 text-muted">
                    <Clock className="size-3" /> Hours
                  </dt>
                  <dd className="mt-0.5 font-medium text-text">
                    {minutesToHHMM(f.openMinute)}–{minutesToHHMM(f.closeMinute)}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-muted">
                    <Users className="size-3" /> Capacity
                  </dt>
                  <dd className="mt-0.5 font-medium text-text">{f.capacity}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-muted">
                    <Radar className="size-3" /> Geofence
                  </dt>
                  <dd className="mt-0.5 font-medium text-text">{f.geofenceRadiusM} m</dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                <Link href={`/facilities/${f.id}`} className="flex-1">
                  <Button variant={f.status === 'OPEN' ? 'accent' : 'secondary'} className="w-full">
                    {f.status === 'OPEN' ? 'View slots & book' : 'View details'}
                  </Button>
                </Link>
                {can('facility.update_status') && (
                  <Button variant="secondary" icon={<Wrench className="size-3.5" />} onClick={() => setStatusFor(f)}>
                    Status
                  </Button>
                )}
              </div>
              {f.requiresApproval && <p className="mt-2 text-[11px] text-muted">Casual bookings need approval</p>}
            </article>
          ))}
        </div>
      )}

      <FacilityFormModal open={creating} onClose={() => setCreating(false)} />
      <FacilityStatusModal facility={statusFor} onClose={() => setStatusFor(null)} />
    </div>
  );
}
