'use client';

import type { InstitutionalKind, InstitutionalRecord } from '@sportsos/shared';
import { BookUser } from 'lucide-react';
import { useState } from 'react';
import { Badge, Card, CardBody, EmptyState, ErrorState, Input, PageHeader, Segmented, SkeletonRows } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { useApi } from '@/lib/hooks';

type Kind = InstitutionalKind | 'ALL';

/** Public directory: only records an administrator has marked VERIFIED against a cited source. */
export default function DirectoryPage() {
  const [kind, setKind] = useState<Kind>('ALL');
  const [q, setQ] = useState('');
  const { data, error, isLoading, mutate } = useApi<InstitutionalRecord[]>('/institution/records', { kind: kind === 'ALL' ? undefined : kind, q: q.trim() || undefined });

  return (
    <div>
      <PageHeader
        eyebrow="IIT (ISM) Dhanbad"
        title="Sports directory"
        description="Verified sports personnel, office-bearers, facilities and sports, each with its source and verification date. Unverified or expired records are not shown here."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<Kind>
          ariaLabel="Record type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'PERSONNEL', label: 'Personnel' },
            { value: 'OFFICE_BEARER', label: 'Office-bearers' },
            { value: 'FACILITY', label: 'Facilities' },
            { value: 'SPORT', label: 'Sports' },
          ]}
        />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="max-w-xs" aria-label="Search directory" />
      </div>
      <Card>
        <CardBody className="pt-4">
          {error ? (
            <ErrorState error={error} onRetry={() => mutate()} />
          ) : isLoading ? (
            <SkeletonRows rows={5} />
          ) : !data?.length ? (
            <EmptyState
              icon={<BookUser className="size-5" />}
              title="No verified records yet"
              description="Institutional data appears here once an administrator imports it from an authorised IIT (ISM) source and marks it verified. SportsOS does not ship any names of its own."
            />
          ) : (
            <ul className="divide-y divide-border">
              {data.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text">{r.name}</p>
                    <p className="text-xs text-text-2">
                      {[r.designation, r.department, r.sport, r.hostel].filter(Boolean).join(' · ')}
                      {r.email ? ` · ${r.email}` : ''}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      Source:{' '}
                      {r.sourceUrl ? (
                        <a href={r.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-accent-ink hover:underline">
                          {r.sourceUrl}
                        </a>
                      ) : (
                        r.sourceDocument
                      )}
                      {r.verifiedAt ? ` · verified ${fmtDate(r.verifiedAt)}` : ''}
                      {r.validUntil ? ` · valid until ${fmtDate(r.validUntil)}` : ''}
                    </p>
                  </div>
                  <Badge tone="green">verified</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
