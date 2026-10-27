'use client';

import type { Role, User } from '@sportsos/shared';
import { ROLE_PERMISSIONS, ROLES, roleLabel } from '@sportsos/shared';
import { ShieldAlert, UserCog } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@/components/auth';
import { useToast } from '@/components/toast';
import { Avatar, Badge, Button, Card, CardBody, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonRows } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function AdminUsersPage() {
  const { can } = useAuth();
  const me = useUser();
  const toast = useToast();
  const allowed = can('users:read');
  const canManage = can('users:manage');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const query = useDebounced(q);
  const { data, error, isLoading, mutate } = useApi<User[]>(allowed ? '/users' : null, { q: query.trim() || undefined, role: role || undefined });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function update(u: User, body: { role?: Role; isActive?: boolean }, msg: string) {
    setBusyId(u.id);
    try {
      await api.patch(`/users/${u.id}`, body);
      toast.success(msg, u.name);
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
        title="Users & roles"
        description={`Role-based access control across ${ROLES.length} stakeholder roles. ${canManage ? 'Changing a role changes what that person can see and do immediately.' : 'Read-only view.'}`}
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
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
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
                        </div>
                      </td>
                      <td className="tabular">{u.admissionNo ?? '—'}</td>
                      <td>{u.hostel ?? '—'}</td>
                      <td>
                        {canManage && u.id !== me.id ? (
                          <Select
                            value={u.role}
                            disabled={busyId === u.id}
                            onChange={(e) => {
                              const next = e.target.value as Role;
                              if (window.confirm(`Change ${u.name}'s role to ${roleLabel(next)}? They will gain ${ROLE_PERMISSIONS[next].length} permissions.`))
                                void update(u, { role: next }, 'Role updated');
                            }}
                            className="h-8 w-56 text-xs"
                            aria-label={`Role for ${u.name}`}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {roleLabel(r)}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Badge tone="navy">{roleLabel(u.role)}</Badge>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Badge tone={u.isActive ? 'green' : 'red'}>{u.isActive ? 'Active' : 'Deactivated'}</Badge>
                          {canManage && u.id !== me.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={busyId === u.id}
                              onClick={() => update(u, { isActive: !u.isActive }, u.isActive ? 'User deactivated' : 'User reactivated')}
                            >
                              {u.isActive ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-text-2">{fmtDate(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
