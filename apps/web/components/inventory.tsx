'use client';

import { QR_PREFIX, type EquipmentIssue, type EquipmentItem } from '@sportsos/shared';
import { PackageCheck, PackagePlus, Printer, ScanLine } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IssueStatusBadge } from '@/components/status';
import { useToast } from '@/components/toast';
import { Badge, Button, Drawer, EmptyState, Field, Input, Modal, Notice, Select, Skeleton, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { SPORTS } from '@/lib/constants';
import { fmtDate, fmtDateTime, fmtRelative, fromLocalInput, toLocalInput } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';
import { LedgerSection, StockMovementSection } from './inventory-extra';

const INVENTORY_PREFIXES = ['/inventory', '/analytics', '/audit'];

/** Accepts a printed label payload (`sportsos://equipment/<code>`) or the bare code. */
export function stripEquipmentPrefix(value: string): string {
  const v = value.trim();
  return v.startsWith(QR_PREFIX.equipment) ? v.slice(QR_PREFIX.equipment.length) : v;
}

function defaultDue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return toLocalInput(d);
}

// ---------------------------------------------------------------- issue

export function IssueModal({
  open,
  onClose,
  items,
  presetItemId,
}: {
  open: boolean;
  onClose: () => void;
  items: EquipmentItem[];
  presetItemId?: string | null;
}) {
  const toast = useToast();
  const [equipmentId, setEquipmentId] = useState('');
  const [qr, setQr] = useState('');
  const [qrItem, setQrItem] = useState<EquipmentItem | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [borrower, setBorrower] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [dueAt, setDueAt] = useState(defaultDue);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEquipmentId(presetItemId ?? '');
      setQr('');
      setQrItem(null);
      setQrError(null);
      setBorrower('');
      setQuantity('1');
      setDueAt(defaultDue());
    }
  }, [open, presetItemId]);

  async function lookupQr() {
    const code = stripEquipmentPrefix(qr);
    if (!code) return;
    setQrError(null);
    try {
      const item = await api.get<EquipmentItem>(`/inventory/items/by-qr/${encodeURIComponent(code)}`);
      setQrItem(item);
      setEquipmentId(item.id);
    } catch (err) {
      setQrItem(null);
      setQrError(errorMessage(err));
    }
  }

  const selected = qrItem ?? items.find((i) => i.id === equipmentId) ?? null;

  async function submit() {
    if (!equipmentId) return toast.warning('Choose an item or scan its label');
    if (!borrower.trim()) return toast.warning('Enter the borrower', 'Institute email or admission number');
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) return toast.warning('Quantity must be at least 1');
    if (selected && qty > selected.availableQty) return toast.warning('Not enough stock', `Only ${selected.availableQty} available`);
    setBusy(true);
    try {
      const issue = await api.post<EquipmentIssue>('/inventory/issues', {
        equipmentId,
        borrower: borrower.trim(),
        quantity: qty,
        dueAt: dueAt ? fromLocalInput(dueAt) : undefined,
      });
      toast.success('Equipment issued', `${issue.quantity} × ${issue.equipment?.name ?? selected?.name ?? 'item'} to ${issue.borrower?.name ?? borrower}`);
      await revalidate(...INVENTORY_PREFIXES);
      onClose();
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
      title="Issue equipment"
      description="Every issue is written to the hash-chained audit ledger."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit} icon={<PackageCheck className="size-4" />}>
            Issue
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Item" htmlFor="iss-item">
          <Select
            id="iss-item"
            value={equipmentId}
            onChange={(e) => {
              setEquipmentId(e.target.value);
              setQrItem(null);
            }}
          >
            <option value="">Select an item…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id} disabled={i.availableQty === 0}>
                {i.name} — {i.availableQty} available
              </option>
            ))}
          </Select>
        </Field>
        <Field label="…or scan / type the label code" htmlFor="iss-qr" error={qrError ?? undefined}>
          <div className="flex gap-2">
            <Input
              id="iss-qr"
              value={qr}
              onChange={(e) => setQr(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void lookupQr();
                }
              }}
              placeholder="sportsos://equipment/…"
              className="font-mono"
            />
            <Button onClick={lookupQr} icon={<ScanLine className="size-4" />}>
              Look up
            </Button>
          </div>
        </Field>
        {selected && (
          <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span className="font-medium text-text">{selected.name}</span>
            <span className="text-muted"> · {selected.sport} · </span>
            <span className={selected.lowStock ? 'text-warn-ink' : 'text-text-2'}>{selected.availableQty} available</span>
          </div>
        )}
        <Field label="Borrower" htmlFor="iss-borrower" hint="Institute email or admission number" required>
          <Input id="iss-borrower" value={borrower} onChange={(e) => setBorrower(e.target.value)} placeholder="Institute email or admission no." />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Quantity" htmlFor="iss-qty">
            <Input id="iss-qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Due back" htmlFor="iss-due">
            <Input id="iss-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- return

export function ReturnModal({ issue, onClose }: { issue: EquipmentIssue | null; onClose: () => void }) {
  const toast = useToast();
  const [returnedQty, setReturnedQty] = useState('1');
  const [damagedQty, setDamagedQty] = useState('0');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (issue) {
      setReturnedQty(String(issue.quantity));
      setDamagedQty('0');
      setNote('');
    }
  }, [issue]);

  async function submit() {
    if (!issue) return;
    const r = Number(returnedQty);
    const d = Number(damagedQty);
    if (!Number.isInteger(r) || r < 0 || r > issue.quantity) return toast.warning(`Returned quantity must be 0–${issue.quantity}`);
    if (!Number.isInteger(d) || d < 0 || d > r) return toast.warning('Damaged quantity cannot exceed the returned quantity');
    setBusy(true);
    try {
      await api.post(`/inventory/issues/${issue.id}/return`, { returnedQty: r, damagedQty: d, note: note.trim() || undefined });
      toast.success('Return recorded', r < issue.quantity ? `${issue.quantity - r} unit(s) still outstanding / lost` : undefined);
      await revalidate(...INVENTORY_PREFIXES);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!issue}
      onClose={onClose}
      title="Receive return"
      description={issue ? `${issue.quantity} × ${issue.equipment?.name ?? 'item'} · ${issue.borrower?.name ?? ''}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Record return
          </Button>
        </>
      }
    >
      {issue && (
        <div className="space-y-4">
          {new Date(issue.dueAt).getTime() < Date.now() && (
            <Notice tone="amber">This return is overdue (was due {fmtRelative(issue.dueAt)}).</Notice>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Returned" htmlFor="ret-qty" hint={`of ${issue.quantity} issued`}>
              <Input id="ret-qty" type="number" min={0} max={issue.quantity} value={returnedQty} onChange={(e) => setReturnedQty(e.target.value)} />
            </Field>
            <Field label="Of which damaged" htmlFor="ret-dmg">
              <Input id="ret-dmg" type="number" min={0} value={damagedQty} onChange={(e) => setDamagedQty(e.target.value)} />
            </Field>
          </div>
          <Field label="Condition note" htmlFor="ret-note">
            <Textarea id="ret-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. One shuttle cork damaged" />
          </Field>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- create item

export function NewItemModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const empty = { name: '', sport: SPORTS[0], category: 'Balls', totalQty: '10', minStock: '2', location: '' };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    if (!form.name.trim()) return toast.warning('Name is required');
    setBusy(true);
    try {
      await api.post('/inventory/items', {
        name: form.name.trim(),
        sport: form.sport,
        category: form.category.trim() || 'General',
        totalQty: Number(form.totalQty),
        minStock: Number(form.minStock),
        location: form.location.trim() || undefined,
      });
      toast.success('Item added', 'Print its QR label from the item drawer.');
      await revalidate(...INVENTORY_PREFIXES);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New equipment item"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit} icon={<PackagePlus className="size-4" />}>
            Add item
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="ni-name" required className="sm:col-span-2">
          <Input id="ni-name" value={form.name} onChange={set('name')} placeholder="Yonex Mavis 350 shuttle tube" />
        </Field>
        <Field label="Sport" htmlFor="ni-sport">
          <Select id="ni-sport" value={form.sport} onChange={set('sport')}>
            {SPORTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="ni-cat">
          <Input id="ni-cat" value={form.category} onChange={set('category')} list="ni-cat-list" />
          <datalist id="ni-cat-list">
            {['Balls', 'Rackets', 'Bats', 'Nets', 'Protective gear', 'Training aids', 'Shuttles', 'Apparel'].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Total quantity" htmlFor="ni-total">
          <Input id="ni-total" type="number" min={0} value={form.totalQty} onChange={set('totalQty')} />
        </Field>
        <Field label="Low-stock threshold" htmlFor="ni-min" hint="Alerts fire below this level">
          <Input id="ni-min" type="number" min={0} value={form.minStock} onChange={set('minStock')} />
        </Field>
        <Field label="Storage location" htmlFor="ni-loc" className="sm:col-span-2">
          <Input id="ni-loc" value={form.location} onChange={set('location')} placeholder="Sports complex store, rack B" />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- item drawer

export function ItemDrawer({
  itemId,
  onClose,
  canIssue,
  canManage,
  onIssue,
  onReturn,
}: {
  itemId: string | null;
  onClose: () => void;
  canIssue: boolean;
  canManage: boolean;
  onIssue: (itemId: string) => void;
  onReturn: (issue: EquipmentIssue) => void;
}) {
  const toast = useToast();
  const { data: item, isLoading } = useApi<EquipmentItem & { issues: EquipmentIssue[] }>(itemId ? `/inventory/items/${itemId}` : null);
  const { data: qr } = useApi<{ qrCode: string; qrDataUrl: string }>(itemId ? `/inventory/items/${itemId}/qr` : null);
  const [restockQty, setRestockQty] = useState('');
  const [restockNote, setRestockNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRestockQty('');
    setRestockNote('');
  }, [itemId]);

  async function restock() {
    const q = Number(restockQty);
    if (!itemId || !Number.isInteger(q) || q < 1) return toast.warning('Enter a whole quantity of at least 1');
    setBusy(true);
    try {
      await api.post(`/inventory/items/${itemId}/restock`, { quantity: q, note: restockNote.trim() || undefined });
      toast.success('Stock added', `+${q} units`);
      setRestockQty('');
      setRestockNote('');
      await revalidate(...INVENTORY_PREFIXES);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  const issues = [...(item?.issues ?? [])].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

  return (
    <Drawer open={!!itemId} onClose={onClose} title={item?.name ?? 'Item'} description={item ? `${item.sport} · ${item.category}` : undefined}>
      {isLoading || !item ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'Available', value: item.availableQty, warn: item.lowStock },
              { label: 'Issued', value: item.issuedQty },
              { label: 'Damaged', value: item.damagedQty },
              { label: 'Total', value: item.totalQty },
            ].map((s) => (
              <div key={s.label} className={`rounded-lg px-2 py-2.5 ${s.warn ? 'bg-warn-soft' : 'bg-surface-2'}`}>
                <div className={`text-xl font-semibold ${s.warn ? 'text-warn-ink' : 'text-text'}`}>{s.value}</div>
                <div className="text-[11px] text-muted">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">
            Low-stock threshold {item.minStock}
            {item.location ? ` · stored at ${item.location}` : ''} · updated {fmtRelative(item.updatedAt)}
          </p>

          <section className="rounded-xl border border-border p-4">
            <div className="print-area flex items-center gap-4">
              <div className="flex size-32 shrink-0 items-center justify-center rounded-lg border border-border bg-white p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {qr ? <img src={qr.qrDataUrl} alt={`QR label for ${item.name}`} className="size-full" /> : <Skeleton className="size-full" />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-widest text-muted uppercase">SportsOS · IIT (ISM)</p>
                <p className="text-base font-semibold text-text">{item.name}</p>
                <p className="text-xs text-text-2">
                  {item.sport} · {item.category}
                </p>
                <p className="mt-1 font-mono text-[10px] break-all text-muted">{qr?.qrCode ?? item.qrCode}</p>
              </div>
            </div>
            <div className="no-print mt-3 flex gap-2">
              <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()} disabled={!qr}>
                Print label
              </Button>
              {canIssue && (
                <Button size="sm" variant="accent" icon={<PackageCheck className="size-3.5" />} onClick={() => onIssue(item.id)} disabled={item.availableQty === 0}>
                  Issue this item
                </Button>
              )}
            </div>
          </section>

          {canManage && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-text">Restock</h3>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Units" htmlFor="rs-qty" className="w-24">
                  <Input id="rs-qty" type="number" min={1} value={restockQty} onChange={(e) => setRestockQty(e.target.value)} />
                </Field>
                <Field label="Note" htmlFor="rs-note" className="min-w-40 flex-1">
                  <Input id="rs-note" value={restockNote} onChange={(e) => setRestockNote(e.target.value)} placeholder="PO / vendor reference" />
                </Field>
                <Button variant="primary" loading={busy} onClick={restock}>
                  Add stock
                </Button>
              </div>
            </section>
          )}

          {canManage && <StockMovementSection itemId={item.id} />}
          <LedgerSection itemId={item.id} />

          <section>
            <h3 className="mb-2 text-sm font-semibold text-text">Issue history</h3>
            {!issues.length ? (
              <EmptyState title="Never issued" className="py-6" />
            ) : (
              <ul className="divide-y divide-border">
                {issues.map((iss) => (
                  <li key={iss.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text">
                        {iss.quantity} × to <span className="font-medium">{iss.borrower?.name ?? 'borrower'}</span>
                      </p>
                      <p className="text-xs text-muted">
                        {fmtDateTime(iss.issuedAt)} · due {fmtDate(iss.dueAt)}
                        {iss.returnedAt ? ` · returned ${iss.returnedQty ?? 0}${iss.damagedQty ? ` (${iss.damagedQty} damaged)` : ''}` : ''}
                      </p>
                    </div>
                    <IssueStatusBadge status={iss.status} />
                    {canIssue && (iss.status === 'ISSUED' || iss.status === 'OVERDUE') && (
                      <Button size="sm" variant="ghost" onClick={() => onReturn(iss)}>
                        Return
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {item.lowStock && <Badge tone="terracotta">Below low-stock threshold — restock recommended</Badge>}
        </div>
      )}
    </Drawer>
  );
}
