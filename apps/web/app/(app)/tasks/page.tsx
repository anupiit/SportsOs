'use client';

import type { Facility, OperationalTask, TaskStatus, User } from '@sportsos/shared';
import { roleLabel } from '@sportsos/shared';
import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth, useUser } from '@/components/auth';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Segmented, Select, SkeletonRows, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

const TONE: Record<TaskStatus, 'neutral' | 'blue' | 'red' | 'green'> = { TODO: 'neutral', IN_PROGRESS: 'blue', BLOCKED: 'red', DONE: 'green' };
const NEXT: Record<TaskStatus, TaskStatus[]> = { TODO: ['IN_PROGRESS', 'BLOCKED', 'DONE'], IN_PROGRESS: ['DONE', 'BLOCKED'], BLOCKED: ['IN_PROGRESS', 'DONE'], DONE: ['IN_PROGRESS'] };

/** Maintenance schedule and daily duties for ground, operations and security staff. */
export default function TasksPage() {
  const { can } = useAuth();
  const me = useUser();
  const toast = useToast();
  const manager = can('task.manage');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const { data, error, isLoading, mutate } = useApi<OperationalTask[]>('/tasks', { scope: manager && scope === 'all' ? 'all' : undefined });
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(t: OperationalTask, status: TaskStatus) {
    const note = status === 'BLOCKED' || status === 'DONE' ? window.prompt(status === 'BLOCKED' ? 'What is blocking this?' : 'Completion note (optional)') : null;
    if (status === 'BLOCKED' && !note) return;
    setBusy(t.id);
    try {
      await api.patch(`/tasks/${t.id}/status`, { status, ...(note ? { note } : {}) });
      toast.success('Task updated');
      await mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Tasks"
        description="Maintenance and operational tasks assigned to sports staff."
        actions={
          manager && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Assign task
            </Button>
          )
        }
      />
      {manager && (
        <div className="mb-4">
          <Segmented<'mine' | 'all'> ariaLabel="Scope" value={scope} onChange={setScope} options={[{ value: 'mine', label: 'Assigned to me' }, { value: 'all', label: 'All tasks' }]} />
        </div>
      )}
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading ? (
        <SkeletonRows rows={4} />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={<ClipboardList className="size-5" />} title="No tasks" description={scope === 'all' ? 'No operational tasks have been assigned yet.' : 'Nothing is assigned to you right now.'} />
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((t) => {
            const mine = t.assignee?.id === me.id;
            return (
              <article key={t.id} className="card flex flex-wrap items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-text">{t.title}</h2>
                    <Badge tone={TONE[t.status]}>{t.status.replace('_', ' ').toLowerCase()}</Badge>
                    <Badge tone="neutral">{t.kind.toLowerCase()}</Badge>
                    {t.facility && <Badge tone="neutral">{t.facility.name}</Badge>}
                  </div>
                  {t.description && <p className="mt-1 text-sm text-text-2">{t.description}</p>}
                  <p className="mt-1 text-xs text-muted">
                    {mine ? 'Assigned to you' : `Assigned to ${t.assignee?.name ?? '—'}`} by {t.createdBy?.name}
                    {t.dueAt ? ` · due ${fmtDateTime(t.dueAt)}` : ''}
                    {t.note ? ` · note: ${t.note}` : ''}
                  </p>
                </div>
                {(mine || manager) && (
                  <div className="flex flex-wrap gap-1.5">
                    {NEXT[t.status].map((s) => (
                      <Button key={s} size="sm" variant={s === 'DONE' ? 'primary' : 'ghost'} loading={busy === t.id} onClick={() => setStatus(t, s)}>
                        {s === 'IN_PROGRESS' ? 'Start' : s === 'DONE' ? 'Mark done' : s === 'BLOCKED' ? 'Blocked' : s}
                      </Button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {manager && <CreateTaskModal open={creating} onClose={() => setCreating(false)} onCreated={() => mutate()} />}
    </div>
  );
}

const TASK_ROLES = ['GROUND_STAFF', 'OPERATIONS_STAFF', 'SECURITY_STAFF', 'SPORTS_OFFICER'];

function CreateTaskModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const { data: users } = useApi<User[]>(open ? '/users' : null);
  const { data: facilities } = useApi<Facility[]>(open ? '/facilities' : null);
  const staff = (users ?? []).filter((u) => u.isActive && TASK_ROLES.includes(u.role));
  const [form, setForm] = useState({ title: '', description: '', kind: 'MAINTENANCE', facilityId: '', assigneeId: '', dueAt: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (form.title.trim().length < 3 || !form.assigneeId) return toast.warning('Add a title and choose who does it');
    setBusy(true);
    try {
      await api.post('/tasks', {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        kind: form.kind,
        facilityId: form.facilityId || undefined,
        assigneeId: form.assigneeId,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
      });
      toast.success('Task assigned');
      setForm({ title: '', description: '', kind: 'MAINTENANCE', facilityId: '', assigneeId: '', dueAt: '' });
      onCreated();
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
      title="Assign task"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Assign
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title" htmlFor="tk-title">
          <Input id="tk-title" value={form.title} onChange={set('title')} />
        </Field>
        <Field label="Details" htmlFor="tk-desc">
          <Textarea id="tk-desc" value={form.description} onChange={set('description')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind" htmlFor="tk-kind">
            <Select id="tk-kind" value={form.kind} onChange={set('kind')}>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="OPERATIONS">Operations</option>
              <option value="SECURITY">Security</option>
            </Select>
          </Field>
          <Field label="Due (optional)" htmlFor="tk-due">
            <Input id="tk-due" type="datetime-local" value={form.dueAt} onChange={set('dueAt')} />
          </Field>
        </div>
        <Field label="Facility (optional)" htmlFor="tk-fac">
          <Select id="tk-fac" value={form.facilityId} onChange={set('facilityId')}>
            <option value="">—</option>
            {(facilities ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assign to" htmlFor="tk-who">
          <Select id="tk-who" value={form.assigneeId} onChange={set('assigneeId')}>
            <option value="">Choose staff</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {roleLabel(u.role)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
