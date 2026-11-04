'use client';

import type { Permission, RbacMatrix, Role, RoleAssignment } from '@sportsos/shared';
import { ADMIN_LOCKED_PERMISSIONS, PRIVILEGED_ROLES, ROLE_INFO, roleLabel } from '@sportsos/shared';
import { Check, KeyRound, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth, useUser } from '@/components/auth';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, SkeletonRows, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

type Tab = 'approvals' | 'matrix';

export default function RolesPage() {
  const { can } = useAuth();
  const allowed = can('role.assign') || can('role.approve') || can('role.manage_permissions');
  const tabs: { value: Tab; label: string }[] = [
    ...(can('role.approve') ? [{ value: 'approvals' as Tab, label: 'Pending approvals' }] : []),
    { value: 'matrix', label: 'Permission matrix' },
  ];
  const [tab, setTab] = useState<Tab>(tabs[0].value);

  if (!allowed) return <EmptyState icon={<ShieldAlert className="size-5" />} title="Restricted" description="Role management needs role.assign, role.approve or role.manage_permissions." />;

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Roles & permissions"
        description="Privileged roles (Dean SW, President SPEC, Sports Officer, Director, System Administrator) need a second person’s approval. The matrix below is the live, database-backed source of every permission check."
      />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={tabs} />
      <div className="mt-4">{tab === 'approvals' ? <Approvals /> : <MatrixEditor />}</div>
    </div>
  );
}

function Approvals() {
  const me = useUser();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<RoleAssignment[]>('/rbac/assignments/pending');
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(a: RoleAssignment, approve: boolean) {
    const note = window.prompt(approve ? 'Approval note (optional)' : 'Reason for rejecting');
    if (note === null || (!approve && !note.trim())) return;
    setBusy(a.id);
    try {
      await api.post(`/rbac/assignments/${a.id}/${approve ? 'approve' : 'reject'}`, note.trim() ? { note: note.trim() } : {});
      toast.success(approve ? 'Role approved' : 'Request rejected', `${roleLabel(a.role)} — ${a.user?.name}`);
      await Promise.all([mutate(), revalidate('/users')]);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardBody className="pt-4">
        {error ? (
          <ErrorState error={error} onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={3} />
        ) : !data?.length ? (
          <EmptyState icon={<KeyRound className="size-5" />} title="Nothing awaiting approval" />
        ) : (
          <ul className="divide-y divide-border">
            {data.map((a) => {
              const own = a.requestedBy?.id === me.id || a.userId === me.id;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text">
                      {roleLabel(a.role)} for {a.user?.name} <span className="text-xs text-muted">({a.user?.email})</span>
                    </p>
                    <p className="text-xs text-muted">
                      Requested by {a.requestedBy?.name ?? '—'} · {fmtDateTime(a.createdAt)} · {a.reason}
                      {a.validUntil ? ` · until ${fmtDateTime(a.validUntil)}` : ''}
                    </p>
                  </div>
                  {own ? (
                    <Badge tone="neutral">Needs another approver</Badge>
                  ) : (
                    <>
                      <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} loading={busy === a.id} onClick={() => decide(a, true)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} disabled={busy === a.id} onClick={() => decide(a, false)}>
                        Reject
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function MatrixEditor() {
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('role.manage_permissions');
  const { data, error, isLoading, mutate } = useApi<RbacMatrix>('/rbac/matrix');
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  async function toggle(role: Role, p: Permission, granted: boolean) {
    if (!granted && PRIVILEGED_ROLES.includes(role) && !window.confirm(`Remove ${p} from ${roleLabel(role)}?`)) return;
    if (granted && !window.confirm(`Grant ${p} to every ${roleLabel(role)}? This takes effect immediately.`)) return;
    setBusy(`${role}:${p}`);
    try {
      if (granted) await api.put(`/rbac/matrix/${role}/${p}`);
      else await api.del(`/rbac/matrix/${role}/${p}`);
      toast.success(granted ? 'Permission granted' : 'Permission removed', `${roleLabel(role)} · ${p}`);
      await mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  async function reset(role: Role) {
    if (!window.confirm(`Reset ${roleLabel(role)} to the default permissions?`)) return;
    try {
      await api.post(`/rbac/matrix/${role}/reset`);
      toast.success('Role reset to defaults', roleLabel(role));
      await mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading || !data) return <SkeletonRows rows={8} />;
  const perms = data.permissions.filter((p) => !filter || p.key.includes(filter));

  return (
    <Card>
      <CardHeader
        title="Role × permission matrix"
        description={editable ? 'Click a cell to grant or remove. Changes apply on the next request and are recorded in the audit ledger.' : 'Read-only: editing needs role.manage_permissions.'}
        actions={<input value={filter} onChange={(e) => setFilter(e.target.value.trim())} placeholder="Filter permissions" className="h-8 rounded-lg border border-border bg-surface px-2 text-xs" aria-label="Filter permissions" />}
      />
      <CardBody>
        <div className="overflow-x-auto">
          <table className="text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface p-1 text-left">Permission</th>
                {data.roles.map((r) => (
                  <th key={r.role} className="p-1 align-bottom" title={ROLE_INFO[r.role].description}>
                    <div className="mx-auto flex h-44 w-6 items-end justify-center">
                      <span className="max-h-44 overflow-hidden text-ellipsis whitespace-nowrap [writing-mode:vertical-rl] rotate-180">{roleLabel(r.role)}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perms.map((p) => (
                <tr key={p.key} className="border-t border-border">
                  <td className="sticky left-0 z-10 bg-surface p-1 pr-3 font-mono whitespace-nowrap" title={p.description}>
                    {p.key}
                  </td>
                  {data.roles.map((r) => {
                    const on = r.permissions.includes(p.key);
                    const isDefault = r.defaults.includes(p.key);
                    const locked = r.role === 'ADMIN' && ADMIN_LOCKED_PERMISSIONS.includes(p.key);
                    return (
                      <td key={r.role} className="p-0.5 text-center">
                        <button
                          type="button"
                          disabled={!editable || locked || busy === `${r.role}:${p.key}`}
                          onClick={() => toggle(r.role, p.key, !on)}
                          title={`${roleLabel(r.role)} · ${p.key}${on !== isDefault ? ' (differs from default)' : ''}${locked ? ' (locked)' : ''}`}
                          aria-label={`${on ? 'Remove' : 'Grant'} ${p.key} for ${roleLabel(r.role)}`}
                          className={`size-5 rounded ${on ? 'bg-accent text-white' : 'bg-surface-2'} ${on !== isDefault ? 'ring-2 ring-warn' : ''} disabled:cursor-default`}
                        >
                          {on ? '✓' : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.roles
              .filter((r) => r.permissions.length !== r.defaults.length || r.permissions.some((p) => !r.defaults.includes(p)))
              .map((r) => (
                <Button key={r.role} size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => reset(r.role)}>
                  Reset {roleLabel(r.role)}
                </Button>
              ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted">Outlined cells differ from the shipped defaults. Administrator lock-out permissions cannot be removed.</p>
      </CardBody>
    </Card>
  );
}
