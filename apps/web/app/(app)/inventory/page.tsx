'use client';

import type { EquipmentIssue, EquipmentItem, InventoryAlerts, IssueStatus } from '@sportsos/shared';
import { AlertTriangle, Package, PackageCheck, PackagePlus, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '@/components/auth';
import { IssueModal, ItemDrawer, NewItemModal, ReturnModal } from '@/components/inventory';
import { IssueStatusBadge } from '@/components/status';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  SkeletonRows,
  Tabs,
} from '@/components/ui';
import { fmtDate, fmtRelative, humanize } from '@/lib/format';
import { useApi } from '@/lib/hooks';

type Tab = 'items' | 'issues' | 'mine';

function AlertsPanel({ onReturn }: { onReturn: (i: EquipmentIssue) => void }) {
  const { data, isLoading } = useApi<InventoryAlerts>('/inventory/alerts', undefined, { refreshInterval: 60000 });
  if (isLoading || !data) return null;
  if (!data.lowStock.length && !data.overdue.length) return null;
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      {data.lowStock.length > 0 && (
        <Card>
          <CardHeader
            title="Low stock"
            description="Available quantity is at or below the threshold"
            icon={<AlertTriangle className="size-4 text-warn" />}
            actions={<Badge tone="terracotta">{data.lowStock.length}</Badge>}
          />
          <CardBody>
            <ul className="divide-y divide-border text-sm">
              {data.lowStock.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="truncate text-text">{i.name}</span>
                  <span className="shrink-0 text-xs text-warn-ink tabular">
                    {i.availableQty} / min {i.minStock}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
      {data.overdue.length > 0 && (
        <Card>
          <CardHeader
            title="Overdue returns"
            icon={<AlertTriangle className="size-4 text-danger" />}
            actions={<Badge tone="red">{data.overdue.length}</Badge>}
          />
          <CardBody>
            <ul className="divide-y divide-border text-sm">
              {data.overdue.slice(0, 6).map((iss) => (
                <li key={iss.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-text">
                      {iss.quantity} × {iss.equipment?.name ?? 'item'}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {iss.borrower?.name ?? 'borrower'} · due {fmtRelative(iss.dueAt)}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onReturn(iss)}>
                    Receive
                  </Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function IssuesTable({ scope, onReturn, canIssue }: { scope: 'all' | 'mine'; onReturn: (i: EquipmentIssue) => void; canIssue: boolean }) {
  const [status, setStatus] = useState<IssueStatus | ''>(scope === 'all' ? 'ISSUED' : '');
  const { data, error, isLoading, mutate } = useApi<EquipmentIssue[]>('/inventory/issues', { scope, status });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value as IssueStatus | '')} className="w-44" aria-label="Filter by status">
          <option value="">Any status</option>
          {(['ISSUED', 'OVERDUE', 'RETURNED', 'LOST'] as IssueStatus[]).map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading ? (
        <SkeletonRows rows={5} />
      ) : !data?.length ? (
        <EmptyState icon={<PackageCheck className="size-5" />} title={scope === 'mine' ? 'You have not borrowed anything' : 'No issues match'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                {scope === 'all' && <th>Borrower</th>}
                <th className="num">Qty</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Status</th>
                {canIssue && scope === 'all' && <th />}
              </tr>
            </thead>
            <tbody>
              {data.map((iss) => (
                <tr key={iss.id}>
                  <td className="font-medium text-text">{iss.equipment?.name ?? '—'}</td>
                  {scope === 'all' && (
                    <td>
                      <div className="text-text">{iss.borrower?.name ?? '—'}</div>
                      <div className="text-xs text-muted">{iss.borrower?.admissionNo ?? iss.borrower?.email}</div>
                    </td>
                  )}
                  <td className="num">
                    {iss.quantity}
                    {iss.returnedQty !== null && iss.returnedQty !== iss.quantity && (
                      <span className="block text-[11px] text-muted">{iss.returnedQty} back</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">{fmtDate(iss.issuedAt)}</td>
                  <td className="whitespace-nowrap">{fmtDate(iss.dueAt)}</td>
                  <td>
                    <IssueStatusBadge status={iss.status} />
                  </td>
                  {canIssue && scope === 'all' && (
                    <td className="text-right">
                      {(iss.status === 'ISSUED' || iss.status === 'OVERDUE') && (
                        <Button size="sm" variant="ghost" onClick={() => onReturn(iss)}>
                          Return
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const { can } = useAuth();
  const canIssue = can('inventory:issue');
  const canManage = can('inventory:manage');
  const [tab, setTab] = useState<Tab>('items');
  const [q, setQ] = useState('');
  const [sport, setSport] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const { data: all } = useApi<EquipmentItem[]>('/inventory/items');
  const { data, error, isLoading, mutate } = useApi<EquipmentItem[]>('/inventory/items', {
    q: q.trim() || undefined,
    sport: sport || undefined,
    lowStock: lowOnly ? 'true' : undefined,
  });
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issuePreset, setIssuePreset] = useState<string | null>(null);
  const [returning, setReturning] = useState<EquipmentIssue | null>(null);
  const [creating, setCreating] = useState(false);

  const sports = useMemo(() => Array.from(new Set((all ?? []).map((i) => i.sport))).sort(), [all]);

  const tabs: { value: Tab; label: string }[] = [
    { value: 'items', label: 'Equipment' },
    ...(canIssue ? [{ value: 'issues' as Tab, label: 'Issues & returns' }] : []),
    { value: 'mine', label: 'My borrowed' },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="High-fidelity tracking"
        title="Inventory"
        description="QR-labelled equipment with live stock, issue/return logs and automated low-stock alerts."
        actions={
          <>
            {can('audit:read') && (
              <Link href="/inventory/audit">
                <Button icon={<ScrollText className="size-4" />}>Audit ledger</Button>
              </Link>
            )}
            {canManage && (
              <Button icon={<PackagePlus className="size-4" />} onClick={() => setCreating(true)}>
                New item
              </Button>
            )}
            {canIssue && (
              <Button
                variant="primary"
                icon={<PackageCheck className="size-4" />}
                onClick={() => {
                  setIssuePreset(null);
                  setIssueOpen(true);
                }}
              >
                Issue equipment
              </Button>
            )}
          </>
        }
      />

      {canIssue && <AlertsPanel onReturn={setReturning} />}

      <Card>
        <div className="px-5 pt-2">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
        </div>
        <CardBody className="pt-5">
          {tab === 'items' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Input placeholder="Search equipment" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="Search equipment" />
                <Select value={sport} onChange={(e) => setSport(e.target.value)} className="w-44" aria-label="Filter by sport">
                  <option value="">All sports</option>
                  {sports.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
                <Checkbox checked={lowOnly} onChange={setLowOnly} label="Low stock only" />
              </div>
              {error ? (
                <ErrorState error={error} onRetry={() => mutate()} />
              ) : isLoading && !data ? (
                <SkeletonRows rows={6} />
              ) : !data?.length ? (
                <EmptyState icon={<Package className="size-5" />} title="No equipment matches" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Sport</th>
                        <th>Category</th>
                        <th className="num">Available</th>
                        <th className="num">Issued</th>
                        <th className="num">Damaged</th>
                        <th className="num">Total</th>
                        <th>Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((item) => (
                        <tr key={item.id} className="cursor-pointer" onClick={() => setDrawerId(item.id)}>
                          <td>
                            <button
                              type="button"
                              className="text-left font-medium text-text hover:text-accent-ink"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDrawerId(item.id);
                              }}
                            >
                              {item.name}
                            </button>
                            {item.lowStock && (
                              <Badge tone="terracotta" className="ml-2" icon={<AlertTriangle className="size-3" />}>
                                Low
                              </Badge>
                            )}
                          </td>
                          <td>{item.sport}</td>
                          <td className="text-text-2">{item.category}</td>
                          <td className={`num font-semibold ${item.lowStock ? 'text-warn-ink' : 'text-text'}`}>{item.availableQty}</td>
                          <td className="num">{item.issuedQty}</td>
                          <td className="num">{item.damagedQty}</td>
                          <td className="num">{item.totalQty}</td>
                          <td className="text-text-2">{item.location ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {tab === 'issues' && canIssue && <IssuesTable scope="all" onReturn={setReturning} canIssue={canIssue} />}
          {tab === 'mine' && <IssuesTable scope="mine" onReturn={setReturning} canIssue={false} />}
        </CardBody>
      </Card>

      <ItemDrawer
        itemId={drawerId}
        onClose={() => setDrawerId(null)}
        canIssue={canIssue}
        canManage={canManage}
        onIssue={(id) => {
          setIssuePreset(id);
          setIssueOpen(true);
        }}
        onReturn={setReturning}
      />
      <IssueModal open={issueOpen} onClose={() => setIssueOpen(false)} items={all ?? []} presetItemId={issuePreset} />
      <ReturnModal issue={returning} onClose={() => setReturning(null)} />
      <NewItemModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
