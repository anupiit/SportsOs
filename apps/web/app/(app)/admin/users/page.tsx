'use client';

import type { Club, Facility, Role, RoleAssignment, User } from '@sportsos/shared';
import { PRIVILEGED_ROLES, ROLE_SCOPE, ROLES, roleLabel } from '@sportsos/shared';
import { KeyRound, ShieldAlert, UserCog, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@/components/auth';
import { useToast } from '@/components/toast';
import { Avatar, Badge, Button, Card, CardBody, Drawer, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonRows, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

const STATUS_TONE: Record<RoleAssignment['status'], 'green' | 'neutral' | 'red' | 'terracotta' | 'blue'> = {
  ACTIVE: 'green',
  PENDING_APPROVAL: 'terracotta',
  REJECTED: 'red',
  REVOKED: 'neutral',
  EXPIRED: 'neutral',
};

export default function AdminUsersPage() {
  const { can } = useAuth();
  const me = useUser();
  const toast = useToast();
  const allowed = can('user.view');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const query = useDebounced(q);
  const { data, error, isLoading, mutate } = useApi<User[]>(allowed ? '/users' : null, { q: query.trim() || undefined, role: role || undefined });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rolesFor, setRolesFor] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  async function toggleActive(u: User) {
    if (!window.confirm(`${u.isActive ? 'Deactivate' : 'Reactivate'} ${u.name}? ${u.isActive ? 'They will be signed out immediately.' : ''}`)) return;
    setBusyId(u.id);
    try {
      await api.patch(`/users/${u.id}`, { isActive: !u.isActive });
      toast.success(u.isActive ? 'User deactivated' : 'User reactivated', u.name);
      await revalidate('/users');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusyId(null);
    }
  }

  if (!allowed) return <EmptyState icon={<ShieldAlert className="size-5" />} title="Restricted" description="You don't have access to the user directory." />;

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Accounts and their role assignments. Roles are granted per person, can be scoped and time-bound, and privileged roles need a second approver."
        actions={
          can('user.create') && (
            <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>
              New account
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input placeholder="Search name, email or admission no." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" aria-label="Search users" />
        <Select value={role} onChange={(e) => setRole(e.target.value as Role | '')} className="w-64" aria-label="Filter by role">
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </Select>
        {data && <span className="text-xs text-muted">{data.length} users</span>}
      </div>
      <Card>
        <CardBody className="pt-4">
          {error ? (
            <ErrorState error={error} onRetry={() => mutate()} />
          ) : isLoading && !data ? (
            <SkeletonRows rows={8} />
          ) : !data?.length ? (
            <EmptyState icon={<UserCog className="size-5" />} title="No users match" />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Admission no.</th>
                    <th>Hostel</th>
                    <th>Primary role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={u.name} size="sm" />
                          <div className="min-w-0">
                            <Link href={`/users/${u.id}`} className="font-medium text-text hover:text-accent-ink">
                              {u.name}
                            </Link>
                            <div className="truncate text-xs text-muted">{u.email}</div>
                          </div>
                          {u.isDemo && <Badge tone="neutral">DEMO</Badge>}
                        </div>
                      </td>
                      <td className="tabular">{u.admissionNo ?? '—'}</td>
                      <td>{u.hostel ?? '—'}</td>
                      <td>
                        <Badge tone="navy">{roleLabel(u.role)}</Badge>
                      </td>
                      <td>
                        <Badge tone={u.isActive ? 'green' : 'red'}>{u.isActive ? 'Active' : 'Deactivated'}</Badge>
                      </td>
                      <td className="whitespace-nowrap text-text-2">{fmtDate(u.createdAt)}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" icon={<KeyRound className="size-3.5" />} onClick={() => setRolesFor(u)}>
                            Roles
                          </Button>
                          {can('user.deactivate') && u.id !== me.id && (
                            <Button size="sm" variant="ghost" loading={busyId === u.id} onClick={() => toggleActive(u)}>
                              {u.isActive ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
      <RolesDrawer user={rolesFor} onClose={() => setRolesFor(null)} />
      <CreateUserModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function RolesDrawer({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { can } = useAuth();
  const me = useUser();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<RoleAssignment[]>(user ? `/rbac/users/${user.id}/assignments` : null);
  const self = user?.id === me.id;

  async function revoke(a: RoleAssignment) {
    const reason = window.prompt(`Reason for revoking ${roleLabel(a.role)} from ${user?.name}?`);
    if (!reason) return;
    try {
      await api.post(`/rbac/assignments/${a.id}/revoke`, { reason });
      toast.success('Role revoked');
      await Promise.all([mutate(), revalidate('/users')]);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Drawer open={!!user} onClose={onClose} title={user ? `Roles — ${user.name}` : 'Roles'} description="Full history: active, pending, revoked and expired assignments.">
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading || !data ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="space-y-6">
          <ul className="divide-y divide-border">
            {!data.length && <EmptyState title="No role assignments" className="py-6" />}
            {data.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-text">{roleLabel(a.role)}</span>
                  {a.scopeType !== 'GLOBAL' && <Badge tone="blue">{a.scopeType.toLowerCase()}: {a.scopeId || '—'}</Badge>}
                  <Badge tone={STATUS_TONE[a.status]}>{a.status.replace('_', ' ').toLowerCase()}</Badge>
                  {a.validUntil && <Badge tone="neutral">until {fmtDateTime(a.validUntil)}</Badge>}
                  {(a.status === 'ACTIVE' || a.status === 'PENDING_APPROVAL') && can('role.revoke') && !self && (
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => revoke(a)}>
                      Revoke
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {a.reason ?? 'No reason recorded'} · requested by {a.requestedBy?.name ?? 'system'} {fmtDateTime(a.createdAt)}
                  {a.decidedBy && a.decidedBy.id !== a.requestedBy?.id ? ` · decided by ${a.decidedBy.name}` : ''}
                  {a.revokedBy ? ` · revoked by ${a.revokedBy.name}: ${a.revokeReason}` : ''}
                </p>
              </li>
            ))}
          </ul>
          {can('role.assign') && !self && user && <AssignForm userId={user.id} onDone={() => Promise.all([mutate(), revalidate('/users')])} />}
          {self && <p className="text-xs text-muted">You cannot change your own roles.</p>}
        </div>
      )}
    </Drawer>
  );
}

function AssignForm({ userId, onDone }: { userId: string; onDone: () => unknown }) {
  const toast = useToast();
  const [role, setRole] = useState<Role>('COACH');
  const [scopeId, setScopeId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const scope = ROLE_SCOPE[role];
  const { data: clubs } = useApi<Club[]>(scope?.type === 'CLUB' ? '/clubs' : null);
  const { data: facilities } = useApi<Facility[]>(scope?.type === 'FACILITY' ? '/facilities' : null);
  const privileged = PRIVILEGED_ROLES.includes(role);

  async function submit() {
    if (scope?.required && !scopeId.trim()) return toast.warning(`Choose the ${scope.type.toLowerCase()} for this role`);
    if (reason.trim().length < 3) return toast.warning('Record why this role is being assigned');
    setBusy(true);
    try {
      const res = await api.post<RoleAssignment>('/rbac/assignments', {
        userId,
        role,
        reason: reason.trim(),
        ...(scope && scopeId.trim() ? { scopeType: scope.type, scopeId: scopeId.trim() } : {}),
        ...(validUntil ? { validUntil: new Date(validUntil).toISOString() } : {}),
      });
      toast.success(res.status === 'PENDING_APPROVAL' ? 'Sent for approval' : 'Role assigned', roleLabel(role));
      setReason('');
      setScopeId('');
      setValidUntil('');
      await onDone();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="mb-3 text-sm font-semibold text-text">Assign a role</h3>
      <div className="space-y-3">
        <Field label="Role" htmlFor="as-role">
          <Select id="as-role" value={role} onChange={(e) => { setRole(e.target.value as Role); setScopeId(''); }}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
                {PRIVILEGED_ROLES.includes(r) ? ' (needs approval)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        {scope && (
          <Field label={`${scope.type.charAt(0) + scope.type.slice(1).toLowerCase()} scope${scope.required ? '' : ' (optional — blank means all)'}`} htmlFor="as-scope">
            {scope.type === 'CLUB' ? (
              <Select id="as-scope" value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                <option value="">Choose a club</option>
                {(clubs ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            ) : scope.type === 'FACILITY' ? (
              <Select id="as-scope" value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                <option value="">All facilities</option>
                {(facilities ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Input id="as-scope" value={scopeId} onChange={(e) => setScopeId(e.target.value)} placeholder={scope.type === 'HOSTEL' ? 'Hostel name' : 'Sport, e.g. Cricket'} />
            )}
          </Field>
        )}
        <Field label="Valid until (optional — for temporary roles)" htmlFor="as-until">
          <Input id="as-until" type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
        <Field label="Reason" htmlFor="as-reason">
          <Textarea id="as-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Appointed by DSW office order dated …" />
        </Field>
        {privileged && <p className="text-xs text-warn-ink">Privileged role: it becomes active only after a second authorised person approves it.</p>}
        <Button variant="primary" loading={busy} onClick={submit}>
          {privileged ? 'Request approval' : 'Assign role'}
        </Button>
      </div>
    </section>
  );
}

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', temporaryPassword: '', admissionNo: '', hostel: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (form.name.trim().length < 2 || !form.email.includes('@')) return toast.warning('Enter a name and a valid email');
    if (form.temporaryPassword.length < 10) return toast.warning('Temporary password must be at least 10 characters');
    setBusy(true);
    try {
      await api.post('/users', {
        name: form.name.trim(),
        email: form.email.trim(),
        temporaryPassword: form.temporaryPassword,
        admissionNo: form.admissionNo.trim() || undefined,
        hostel: form.hostel.trim() || undefined,
      });
      toast.success('Account created', 'It starts as a casual student; assign roles from the Roles drawer.');
      setForm({ name: '', email: '', temporaryPassword: '', admissionNo: '', hostel: '' });
      await revalidate('/users');
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
      title="New account"
      description="Share the temporary password with the person through a secure channel."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Full name" htmlFor="nu-name">
          <Input id="nu-name" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Email" htmlFor="nu-email">
          <Input id="nu-email" type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Temporary password" htmlFor="nu-pw">
          <Input id="nu-pw" type="password" value={form.temporaryPassword} onChange={set('temporaryPassword')} autoComplete="new-password" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Admission no. (optional)" htmlFor="nu-adm">
            <Input id="nu-adm" value={form.admissionNo} onChange={set('admissionNo')} />
          </Field>
          <Field label="Hostel (optional)" htmlFor="nu-hostel">
            <Input id="nu-hostel" value={form.hostel} onChange={set('hostel')} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
