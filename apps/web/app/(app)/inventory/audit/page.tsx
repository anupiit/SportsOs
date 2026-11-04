'use client';

import type { AuditEntry, AuditVerification } from '@sportsos/shared';
import { roleLabel } from '@sportsos/shared';
import { ArrowLeft, ChevronDown, ChevronRight, Link2, ShieldAlert, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { useAuth } from '@/components/auth';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Notice, PageHeader, Select, SkeletonRows } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime, fmtNumber } from '@/lib/format';
import { useApi } from '@/lib/hooks';

const ENTITIES = [
  '',
  'Equipment',
  'EquipmentIssue',
  'Booking',
  'AttendanceSession',
  'AttendanceRecord',
  'Facility',
  'Club',
  'ClubMembership',
  'Tournament',
  'Match',
  'Complaint',
  'Achievement',
  'User',
];

function short(hash: string) {
  return hash.length > 16 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;
}

export default function AuditPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [entity, setEntity] = useState('');
  const [limit, setLimit] = useState('50');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [verification, setVerification] = useState<AuditVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const { data, error, isLoading, mutate } = useApi<AuditEntry[]>(can('audit.view') ? '/audit' : null, { entity, limit });

  async function verify() {
    setVerifying(true);
    try {
      const v = await api.get<AuditVerification>('/audit/verify');
      setVerification(v);
      if (v.valid) toast.success('Ledger intact', `${fmtNumber(v.checked)} entries re-hashed`);
      else toast.error('Ledger tampering detected', `Chain breaks at entry #${v.brokenAtSeq}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setVerifying(false);
    }
  }

  if (!can('audit.view')) {
    return <EmptyState icon={<ShieldAlert className="size-5" />} title="Restricted" description="The audit ledger is available to the Sports Officer and institute leadership." />;
  }

  return (
    <div>
      <Link href="/inventory" className="mb-3 inline-flex items-center gap-1 text-sm text-text-2 hover:text-text">
        <ArrowLeft className="size-4" /> Inventory
      </Link>
      <PageHeader
        eyebrow="Tamper-evident records"
        title="Audit ledger"
        description="Every equipment movement, approval and verified check-in is appended to a SHA-256 hash chain: each entry's hash covers the previous one, so editing any past record breaks every hash after it."
        actions={
          <Button variant="primary" icon={<ShieldCheck className="size-4" />} loading={verifying} onClick={verify}>
            Verify hash chain
          </Button>
        }
      />

      {verification && (
        <div className="mb-6">
          {verification.valid ? (
            <Notice tone="green" icon={<ShieldCheck className="size-5" />} title="Chain verified — no tampering detected">
              Re-computed {fmtNumber(verification.checked)} entries.{' '}
              {verification.headHash && (
                <>
                  Head hash <code className="font-mono text-xs break-all">{verification.headHash}</code>
                </>
              )}
            </Notice>
          ) : (
            <Notice tone="red" icon={<ShieldAlert className="size-5" />} title={`Chain broken at entry #${verification.brokenAtSeq}`}>
              The stored hash for that entry no longer matches its contents or its predecessor. Entries checked: {fmtNumber(verification.checked)}.
            </Notice>
          )}
        </div>
      )}

      <Card>
        <CardHeader
          title="Ledger entries"
          description="Newest first"
          icon={<Link2 className="size-4" />}
          actions={
            <>
              <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="w-48" aria-label="Filter by entity">
                {ENTITIES.map((e) => (
                  <option key={e} value={e}>
                    {e || 'All entities'}
                  </option>
                ))}
              </Select>
              <Select value={limit} onChange={(e) => setLimit(e.target.value)} className="w-28" aria-label="Rows">
                {['50', '100', '200'].map((l) => (
                  <option key={l} value={l}>
                    {l} rows
                  </option>
                ))}
              </Select>
            </>
          }
        />
        <CardBody>
          {error ? (
            <ErrorState error={error} onRetry={() => mutate()} />
          ) : isLoading ? (
            <SkeletonRows rows={8} />
          ) : !data?.length ? (
            <EmptyState title="No ledger entries" />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Hash</th>
                    <th>Prev hash</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.map((e) => {
                    const open = expanded === e.seq;
                    const broken = verification && !verification.valid && verification.brokenAtSeq === e.seq;
                    return (
                      <Fragment key={e.seq}>
                        <tr className={broken ? 'bg-danger-soft' : undefined}>
                          <td className="num text-muted">{e.seq}</td>
                          <td className="whitespace-nowrap">{fmtDateTime(e.createdAt)}</td>
                          <td>
                            <div className="text-text">{e.actor?.name ?? 'System'}</div>
                            {e.actor && <div className="text-[11px] text-muted">{roleLabel(e.actor.role)}</div>}
                          </td>
                          <td>
                            <Badge tone="blue">{e.action}</Badge>
                          </td>
                          <td className="whitespace-nowrap">
                            <span className="text-text">{e.entity}</span>
                            <span className="block font-mono text-[11px] text-muted">{short(e.entityId)}</span>
                          </td>
                          <td className="font-mono text-xs text-text-2" title={e.hash}>
                            {short(e.hash)}
                          </td>
                          <td className="font-mono text-xs text-muted" title={e.prevHash}>
                            {short(e.prevHash)}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => setExpanded(open ? null : e.seq)}
                              className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
                              aria-expanded={open}
                              aria-label={open ? 'Hide payload' : 'Show payload'}
                            >
                              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            </button>
                          </td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={8} className="bg-surface-2">
                              <pre className="max-h-64 overflow-auto font-mono text-xs whitespace-pre-wrap text-text-2">
                                {JSON.stringify(e.payload, null, 2)}
                              </pre>
                              <p className="mt-2 font-mono text-[11px] break-all text-muted">hash {e.hash}</p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
