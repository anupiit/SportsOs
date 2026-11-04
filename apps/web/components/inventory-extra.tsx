'use client';

import type { Club, EquipmentItem, EquipmentRequest, InventoryTransaction } from '@sportsos/shared';
import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth';
import { useToast } from '@/components/toast';
import { Badge, Button, EmptyState, ErrorState, Field, Input, Modal, Select, SkeletonRows, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

const PREFIXES = ['/inventory', '/analytics', '/audit'];

type Movement = 'damage' | 'repair' | 'write-off-available' | 'write-off-damaged' | 'adjust';
const MOVEMENT_LABEL: Record<Movement, string> = {
  damage: 'Report damage (store → damaged)',
  repair: 'Repaired (damaged → store)',
  'write-off-available': 'Write off from store',
  'write-off-damaged': 'Write off damaged stock',
  adjust: 'Stock-count adjustment (±)',
};

/** Every quantity change goes through a ledgered endpoint; there is no direct "edit quantity". */
export function StockMovementSection({ itemId }: { itemId: string }) {
  const toast = useToast();
  const [kind, setKind] = useState<Movement>('damage');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const n = Number(qty);
    if (!Number.isInteger(n) || n === 0 || (kind !== 'adjust' && n < 1)) return toast.warning(kind === 'adjust' ? 'Enter a non-zero whole number (negative to reduce)' : 'Enter a whole quantity of at least 1');
    if (note.trim().length < (kind === 'adjust' ? 5 : 3)) return toast.warning('Add a note explaining the change');
    if (kind.startsWith('write-off') && !window.confirm(`Permanently write off ${n} unit(s)? This reduces total stock.`)) return;
    setBusy(true);
    try {
      const path =
        kind === 'adjust'
          ? ['adjust', { availableDelta: n, note }]
          : kind === 'damage'
            ? ['damage', { quantity: n, note }]
            : kind === 'repair'
              ? ['repair', { quantity: n, note }]
              : ['write-off', { quantity: n, note, from: kind === 'write-off-damaged' ? 'DAMAGED' : 'AVAILABLE' }];
      await api.post(`/inventory/items/${itemId}/${path[0]}`, path[1]);
      toast.success('Stock movement recorded', MOVEMENT_LABEL[kind]);
      setQty('');
      setNote('');
      await revalidate(...PREFIXES);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-text">Damage, repair & adjustments</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_6rem]">
        <Field label="Movement" htmlFor="mv-kind">
          <Select id="mv-kind" value={kind} onChange={(e) => setKind(e.target.value as Movement)}>
            {(Object.keys(MOVEMENT_LABEL) as Movement[]).map((k) => (
              <option key={k} value={k}>
                {MOVEMENT_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Units" htmlFor="mv-qty">
          <Input id="mv-qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="Note (required)" htmlFor="mv-note" className="min-w-40 flex-1">
          <Input id="mv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened" />
        </Field>
        <Button loading={busy} onClick={submit}>
          Record
        </Button>
      </div>
    </section>
  );
}

const TX_TONE: Record<InventoryTransaction['type'], 'green' | 'red' | 'neutral' | 'blue' | 'terracotta'> = {
  INITIAL: 'neutral',
  RESTOCK: 'green',
  ISSUE: 'blue',
  RETURN: 'green',
  DAMAGE_REPORT: 'terracotta',
  REPAIR: 'green',
  LOSS: 'red',
  WRITE_OFF: 'red',
  ADJUSTMENT: 'neutral',
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function LedgerSection({ itemId }: { itemId: string }) {
  const { can } = useAuth();
  const { data, error, isLoading } = useApi<InventoryTransaction[]>(can('inventory.audit') ? `/inventory/items/${itemId}/transactions` : null);
  if (!can('inventory.audit')) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-text">Stock ledger</h3>
      {error ? (
        <ErrorState error={error} />
      ) : isLoading ? (
        <SkeletonRows rows={3} />
      ) : !data?.length ? (
        <EmptyState title="No stock movements" className="py-6" />
      ) : (
        <ul className="divide-y divide-border text-xs">
          {data.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-2">
              <Badge tone={TX_TONE[t.type]}>{t.type.replace('_', ' ').toLowerCase()}</Badge>
              <span className="tabular text-text-2">
                store {signed(t.availableDelta)} · damaged {signed(t.damagedDelta)} · total {signed(t.totalDelta)}
              </span>
              <span className="ml-auto text-right text-muted">
                → {t.balanceAvailable}/{t.balanceDamaged}/{t.balanceTotal}
                <br />
                {t.actor?.name ?? ''} · {fmtRelative(t.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const REQ_TONE: Record<EquipmentRequest['status'], 'neutral' | 'green' | 'red' | 'blue' | 'terracotta'> = {
  PENDING: 'terracotta',
  APPROVED: 'blue',
  REJECTED: 'red',
  FULFILLED: 'green',
  CANCELLED: 'neutral',
};

export function RequestsPanel({ items }: { items: EquipmentItem[] }) {
  const { can, user } = useAuth();
  const toast = useToast();
  const staff = can('inventory.approve_request') || can('inventory.issue');
  const { data, error, isLoading, mutate } = useApi<EquipmentRequest[]>('/inventory/requests', { scope: staff ? 'all' : undefined });
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(r: EquipmentRequest, action: 'approve' | 'reject' | 'fulfil' | 'cancel') {
    let body: Record<string, unknown> = {};
    if (action === 'reject') {
      const note = window.prompt('Reason for declining this request?');
      if (!note) return;
      body = { note };
    }
    if (action === 'cancel' && !window.confirm('Cancel this request?')) return;
    setBusy(r.id);
    try {
      await api.post(`/inventory/requests/${r.id}/${action}`, body);
      toast.success(`Request ${action === 'fulfil' ? 'fulfilled' : action + (action.endsWith('e') ? 'd' : 'ed')}`);
      await Promise.all([mutate(), revalidate(...PREFIXES)]);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{staff ? 'Requests from clubs, coaches and students.' : 'Your equipment requests.'}</p>
        {can('inventory.request') && (
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
            New request
          </Button>
        )}
      </div>
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading ? (
        <SkeletonRows rows={4} />
      ) : !data?.length ? (
        <EmptyState icon={<ClipboardList className="size-5" />} title="No requests" />
      ) : (
        <ul className="divide-y divide-border">
          {data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">
                  {r.quantity} × {r.itemName}
                  {r.club ? <span className="text-text-2"> · {r.club.name}</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {staff && r.requester ? `${r.requester.name} · ` : ''}
                  {r.reason}
                  {r.neededBy ? ` · needed by ${fmtDate(r.neededBy)}` : ''} · {fmtDateTime(r.createdAt)}
                </p>
                {r.decisionNote && <p className="text-xs text-text-2">Note: {r.decisionNote}</p>}
              </div>
              <Badge tone={REQ_TONE[r.status]}>{r.status.toLowerCase()}</Badge>
              {r.status === 'PENDING' && can('inventory.approve_request') && r.requester?.id !== user?.id && (
                <>
                  <Button size="sm" variant="primary" loading={busy === r.id} onClick={() => act(r, 'approve')}>
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r, 'reject')}>
                    Decline
                  </Button>
                </>
              )}
              {r.status === 'APPROVED' && can('inventory.issue') && r.equipmentId && (
                <Button size="sm" variant="accent" loading={busy === r.id} onClick={() => act(r, 'fulfil')}>
                  Issue now
                </Button>
              )}
              {(r.status === 'PENDING' || r.status === 'APPROVED') && r.requester?.id === user?.id && (
                <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r, 'cancel')}>
                  Cancel
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <NewRequestModal open={creating} onClose={() => setCreating(false)} items={items} onCreated={() => mutate()} />
    </div>
  );
}

function NewRequestModal({ open, onClose, items, onCreated }: { open: boolean; onClose: () => void; items: EquipmentItem[]; onCreated: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const { data: clubs } = useApi<Club[]>(open ? '/clubs' : null);
  const mine = (clubs ?? []).filter((c) => c.myMembership?.status === 'ACTIVE' || c.coachId === user?.id || c.canManage);
  const [equipmentId, setEquipmentId] = useState('');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [clubId, setClubId] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const q = Number(quantity);
    if (!equipmentId && itemName.trim().length < 2) return toast.warning('Pick a catalogue item or name the item you need');
    if (!Number.isInteger(q) || q < 1) return toast.warning('Quantity must be a whole number of at least 1');
    if (reason.trim().length < 5) return toast.warning('Explain what the equipment is for');
    setBusy(true);
    try {
      await api.post('/inventory/requests', {
        equipmentId: equipmentId || undefined,
        itemName: equipmentId ? undefined : itemName.trim(),
        quantity: q,
        clubId: clubId || undefined,
        neededBy: neededBy ? new Date(`${neededBy}T00:00:00+05:30`).toISOString() : undefined,
        reason: reason.trim(),
      });
      toast.success('Request submitted', 'The equipment manager has been notified.');
      onCreated();
      onClose();
      setReason('');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request equipment"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Submit request
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Catalogue item" htmlFor="rq-item">
          <Select id="rq-item" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
            <option value="">Not in the catalogue (describe below)</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.availableQty} available)
              </option>
            ))}
          </Select>
        </Field>
        {!equipmentId && (
          <Field label="Item name" htmlFor="rq-name">
            <Input id="rq-name" value={itemName} onChange={(e) => setItemName(e.target.value)} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" htmlFor="rq-qty">
            <Input id="rq-qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Needed by (optional)" htmlFor="rq-date">
            <Input id="rq-date" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
          </Field>
        </div>
        <Field label="For club (optional)" htmlFor="rq-club">
          <Select id="rq-club" value={clubId} onChange={(e) => setClubId(e.target.value)}>
            <option value="">Personal request</option>
            {mine.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" htmlFor="rq-reason">
          <Textarea id="rq-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
