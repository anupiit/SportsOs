'use client';

import type {
  Complaint,
  ComplaintCategory,
  ComplaintStatus,
  EquipmentItem,
  Facility,
  Priority,
  User,
} from '@sportsos/shared';
import { roleLabel } from '@sportsos/shared';
import { MessageSquareWarning, Plus, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@/components/auth';
import { ComplaintStatusBadge, PriorityBadge } from '@/components/status';
import { useToast } from '@/components/toast';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Segmented,
  Select,
  SkeletonRows,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api';
import { COMPLAINT_CATEGORY_LABEL, PRIORITY_LABEL } from '@/lib/constants';
import { fmtRelative, humanize } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

const STAFF_ROLES = ['SPORTS_OFFICER', 'OPERATIONS_STAFF', 'GROUND_STAFF', 'EQUIPMENT_MANAGER', 'GENERAL_SECRETARY', 'SECURITY_STAFF'];

function RaiseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { data: facilities } = useApi<Facility[]>(open ? '/facilities' : null);
  const { data: items } = useApi<EquipmentItem[]>(open ? '/inventory/items' : null);
  const empty = { category: 'FACILITY' as ComplaintCategory, subject: '', description: '', facilityId: '', equipmentId: '', priority: 'MEDIUM' as Priority };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    if (form.subject.trim().length < 4) return toast.warning('Subject is too short', 'Use at least 4 characters.');
    if (form.description.trim().length < 10) return toast.warning('Add more detail', 'Describe the problem in at least 10 characters.');
    setBusy(true);
    try {
      await api.post('/complaints', {
        category: form.category,
        subject: form.subject.trim(),
        description: form.description.trim(),
        priority: form.priority,
        facilityId: form.category === 'FACILITY' && form.facilityId ? form.facilityId : undefined,
        equipmentId: form.category === 'EQUIPMENT' && form.equipmentId ? form.equipmentId : undefined,
      });
      toast.success('Complaint registered', 'You will be notified as it progresses.');
      await revalidate('/complaints', '/analytics');
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
      title="Raise a complaint"
      description="Tracked end-to-end — no more lost entries in a paper book."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Submit
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="c-cat">
          <Select id="c-cat" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ComplaintCategory }))}>
            {(Object.keys(COMPLAINT_CATEGORY_LABEL) as ComplaintCategory[]).map((c) => (
              <option key={c} value={c}>
                {COMPLAINT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="c-pri">
          <Select id="c-pri" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>
        {form.category === 'FACILITY' && (
          <Field label="Facility" htmlFor="c-fac" className="sm:col-span-2">
            <Select id="c-fac" value={form.facilityId} onChange={(e) => setForm((f) => ({ ...f, facilityId: e.target.value }))}>
              <option value="">Not specific</option>
              {(facilities ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {form.category === 'EQUIPMENT' && (
          <Field label="Equipment" htmlFor="c-eq" className="sm:col-span-2">
            <Select id="c-eq" value={form.equipmentId} onChange={(e) => setForm((f) => ({ ...f, equipmentId: e.target.value }))}>
              <option value="">Not specific</option>
              {(items ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Subject" htmlFor="c-sub" required className="sm:col-span-2">
          <Input id="c-sub" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Floodlight 3 not working at the basketball court" />
        </Field>
        <Field label="Description" htmlFor="c-desc" required className="sm:col-span-2">
          <Textarea id="c-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  );
}

function ManageModal({ complaint, onClose }: { complaint: Complaint | null; onClose: () => void }) {
  const toast = useToast();
  const me = useUser();
  const { can } = useAuth();
  const { data: users } = useApi<User[]>(complaint && can('users:read') ? '/users' : null);
  const staff = (users ?? []).filter((u) => STAFF_ROLES.includes(u.role) && u.isActive);
  const [status, setStatus] = useState<ComplaintStatus>('OPEN');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [assignedToId, setAssignedToId] = useState('');
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!complaint) return;
    setStatus(complaint.status);
    setPriority(complaint.priority);
    setAssignedToId(complaint.assignedToId ?? '');
    setResolution(complaint.resolution ?? '');
  }, [complaint]);

  async function save() {
    if (!complaint) return;
    if ((status === 'RESOLVED' || status === 'CLOSED') && !resolution.trim()) return toast.warning('Describe the resolution before closing');
    setBusy(true);
    try {
      await api.patch(`/complaints/${complaint.id}`, {
        status,
        priority,
        assignedToId: assignedToId || undefined,
        resolution: resolution.trim() || undefined,
      });
      toast.success('Complaint updated');
      await revalidate('/complaints', '/analytics');
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!complaint}
      onClose={onClose}
      title="Manage complaint"
      description={complaint?.subject}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {complaint && (
        <div className="space-y-4">
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-text-2">{complaint.description}</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status" htmlFor="m-status">
              <Select id="m-status" value={status} onChange={(e) => setStatus(e.target.value as ComplaintStatus)}>
                {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as ComplaintStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="m-pri">
              <Select id="m-pri" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Assigned to" htmlFor="m-assign">
            <Select id="m-assign" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
              <option value="">Unassigned</option>
              <option value={me.id}>Me ({me.name})</option>
              {staff
                .filter((u) => u.id !== me.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {roleLabel(u.role)}
                  </option>
                ))}
              {complaint.assignedTo && complaint.assignedTo.id !== me.id && !staff.some((u) => u.id === complaint.assignedTo!.id) && (
                <option value={complaint.assignedTo.id}>{complaint.assignedTo.name}</option>
              )}
            </Select>
          </Field>
          <Field label="Resolution" htmlFor="m-res">
            <Textarea id="m-res" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="What was done to fix it" />
          </Field>
        </div>
      )}
    </Modal>
  );
}

type Filter = 'ACTIVE' | 'ALL' | ComplaintStatus;

export default function ComplaintsPage() {
  const { can } = useAuth();
  const manager = can('complaints:manage');
  const [filter, setFilter] = useState<Filter>('ACTIVE');
  const { data, error, isLoading, mutate } = useApi<Complaint[]>('/complaints', {
    status: filter === 'ACTIVE' || filter === 'ALL' ? undefined : filter,
  });
  const [raising, setRaising] = useState(false);
  const [managing, setManaging] = useState<Complaint | null>(null);

  const list = (data ?? [])
    .filter((c) => filter !== 'ACTIVE' || c.status === 'OPEN' || c.status === 'IN_PROGRESS')
    .sort((a, b) => {
      const p = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return p[a.priority] - p[b.priority] || b.createdAt.localeCompare(a.createdAt);
    });

  return (
    <div>
      <PageHeader
        eyebrow="Engagement"
        title="Complaints"
        description={manager ? 'Triage, assign and resolve issues raised by students and staff.' : 'Report a problem with a facility, equipment or service and track it to resolution.'}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setRaising(true)}>
            Raise complaint
          </Button>
        }
      />
      <div className="mb-4">
        <Segmented<Filter>
          ariaLabel="Filter complaints"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'OPEN', label: 'Open' },
            { value: 'IN_PROGRESS', label: 'In progress' },
            { value: 'RESOLVED', label: 'Resolved' },
            { value: 'ALL', label: 'All' },
          ]}
        />
      </div>
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading ? (
        <SkeletonRows rows={5} />
      ) : !list.length ? (
        <Card>
          <EmptyState icon={<MessageSquareWarning className="size-5" />} title="No complaints here" description="Nothing needs attention in this view." />
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((c) => (
            <article key={c.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-text">{c.subject}</h2>
                    <Badge tone="neutral">{COMPLAINT_CATEGORY_LABEL[c.category]}</Badge>
                    <PriorityBadge priority={c.priority} />
                  </div>
                  <p className="mt-1 text-sm text-text-2">{c.description}</p>
                  <p className="mt-2 text-xs text-muted">
                    {manager && c.raisedBy ? `${c.raisedBy.name} · ` : ''}raised {fmtRelative(c.createdAt)}
                    {c.assignedTo ? ` · assigned to ${c.assignedTo.name}` : ' · unassigned'}
                    {c.updatedAt !== c.createdAt ? ` · updated ${fmtRelative(c.updatedAt)}` : ''}
                  </p>
                  {c.resolution && (
                    <p className="mt-2 rounded-md bg-good-soft px-3 py-2 text-xs text-good-ink">
                      <span className="font-semibold">Resolution:</span> {c.resolution}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <ComplaintStatusBadge status={c.status} />
                  {manager && (
                    <Button size="sm" icon={<Settings2 className="size-3.5" />} onClick={() => setManaging(c)}>
                      Manage
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <RaiseModal open={raising} onClose={() => setRaising(false)} />
      <ManageModal complaint={managing} onClose={() => setManaging(null)} />
    </div>
  );
}
