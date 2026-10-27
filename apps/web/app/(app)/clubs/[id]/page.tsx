'use client';

import type { Club, ClubMembership, MembershipRole, MembershipStatus } from '@sportsos/shared';
import { ArrowLeft, Check, UserMinus, UserPlus, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAuth, useUser } from '@/components/auth';
import { MembershipBadge } from '@/components/status';
import { useToast } from '@/components/toast';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, Select, Skeleton, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, humanize } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

type Tab = 'ACTIVE' | 'PENDING' | 'OTHER';

export default function ClubDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const user = useUser();
  const toast = useToast();
  const { data: club, error, isLoading, mutate } = useApi<Club>(`/clubs/${id}`);
  const [tab, setTab] = useState<Tab>('ACTIVE');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const canRoster = can('clubs:roster');
  const members = useMemo(() => club?.members ?? [], [club]);
  const grouped = useMemo(
    () => ({
      ACTIVE: members.filter((m) => m.status === 'ACTIVE'),
      PENDING: members.filter((m) => m.status === 'PENDING'),
      OTHER: members.filter((m) => m.status === 'REJECTED' || m.status === 'LEFT'),
    }),
    [members],
  );

  async function update(m: ClubMembership, body: { status?: MembershipStatus; role?: MembershipRole }, success: string) {
    setBusyId(m.id);
    try {
      await api.patch(`/clubs/${id}/members/${m.id}`, body);
      toast.success(success, m.user?.name);
      await Promise.all([mutate(), revalidate('/clubs')]);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusyId(null);
    }
  }

  async function join() {
    setJoining(true);
    try {
      await api.post(`/clubs/${id}/join`);
      toast.success('Request sent');
      await Promise.all([mutate(), revalidate('/clubs')]);
    } catch (err) {
      toast.error(err);
    } finally {
      setJoining(false);
    }
  }

  const back = (
    <Link href="/clubs" className="mb-3 inline-flex items-center gap-1 text-sm text-text-2 hover:text-text">
      <ArrowLeft className="size-4" /> All clubs
    </Link>
  );

  if (error) {
    return (
      <div>
        {back}
        <ErrorState error={error} onRetry={() => mutate()} />
      </div>
    );
  }
  if (isLoading || !club) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-16" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const my = club.myMembership;
  const canJoin = (!my || my.status === 'LEFT' || my.status === 'REJECTED') && club.coachId !== user.id;
  const list = grouped[tab];

  return (
    <div>
      {back}
      <PageHeader
        eyebrow={club.sport}
        title={club.name}
        description={club.description ?? undefined}
        actions={
          <>
            {my && <MembershipBadge status={my.status} />}
            {canJoin && (
              <Button variant="accent" icon={<UserPlus className="size-4" />} loading={joining} onClick={join}>
                Request to join
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <Card className="xl:col-span-1">
          <CardHeader title="Club details" />
          <CardBody className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-muted">Coach</p>
              {club.coach ? (
                <div className="mt-1 flex items-center gap-2">
                  <Avatar name={club.coach.name} size="sm" />
                  <div>
                    <p className="font-medium text-text">{club.coach.name}</p>
                    <p className="text-xs text-muted">{club.coach.email}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-text-2">Unassigned</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted">Active members</p>
                <p className="text-xl font-semibold text-text">{grouped.ACTIVE.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Pending</p>
                <p className="text-xl font-semibold text-text">{grouped.PENDING.length}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted">Founded</p>
              <p className="text-text">{fmtDate(club.createdAt)}</p>
            </div>
            <Link href="/attendance" className="block text-xs font-medium text-accent-ink hover:underline">
              Practice attendance →
            </Link>
          </CardBody>
        </Card>

        <Card className="xl:col-span-3">
          <div className="px-5 pt-2">
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'ACTIVE', label: 'Roster', count: grouped.ACTIVE.length },
                ...(canRoster ? [{ value: 'PENDING' as Tab, label: 'Join requests', count: grouped.PENDING.length }] : []),
                ...(canRoster ? [{ value: 'OTHER' as Tab, label: 'Former / rejected', count: grouped.OTHER.length }] : []),
              ]}
            />
          </div>
          <CardBody className="pt-4">
            {!list.length ? (
              <EmptyState
                icon={<Users className="size-5" />}
                title={tab === 'PENDING' ? 'No pending requests' : 'Nobody here yet'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Admission no.</th>
                      <th>Hostel</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Since</th>
                      {canRoster && <th className="text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <Avatar name={m.user?.name ?? '?'} size="sm" />
                            <Link href={`/users/${m.userId}`} className="font-medium text-text hover:text-accent-ink">
                              {m.user?.name ?? 'Member'}
                            </Link>
                          </div>
                        </td>
                        <td className="tabular">{m.user?.admissionNo ?? '—'}</td>
                        <td>{m.user?.hostel ?? '—'}</td>
                        <td>
                          {canRoster && m.status === 'ACTIVE' ? (
                            <Select
                              value={m.role}
                              disabled={busyId === m.id}
                              onChange={(e) => update(m, { role: e.target.value as MembershipRole }, 'Role updated')}
                              className="h-8 w-36 text-xs"
                              aria-label={`Role for ${m.user?.name}`}
                            >
                              {(['MEMBER', 'CAPTAIN', 'VICE_CAPTAIN'] as MembershipRole[]).map((r) => (
                                <option key={r} value={r}>
                                  {humanize(r)}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <Badge tone={m.role === 'MEMBER' ? 'neutral' : 'navy'}>{humanize(m.role)}</Badge>
                          )}
                        </td>
                        <td>
                          <MembershipBadge status={m.status} />
                        </td>
                        <td className="whitespace-nowrap text-text-2">{fmtDate(m.joinedAt)}</td>
                        {canRoster && (
                          <td className="text-right whitespace-nowrap">
                            {m.status === 'PENDING' && (
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<X className="size-3.5" />}
                                  disabled={busyId === m.id}
                                  onClick={() => update(m, { status: 'REJECTED' }, 'Request rejected')}
                                >
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  variant="accent"
                                  icon={<Check className="size-3.5" />}
                                  loading={busyId === m.id}
                                  onClick={() => update(m, { status: 'ACTIVE' }, 'Member approved')}
                                >
                                  Approve
                                </Button>
                              </div>
                            )}
                            {m.status === 'ACTIVE' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<UserMinus className="size-3.5" />}
                                loading={busyId === m.id}
                                onClick={() => {
                                  if (window.confirm(`Remove ${m.user?.name ?? 'this member'} from ${club.name}?`))
                                    void update(m, { status: 'LEFT' }, 'Member removed');
                                }}
                              >
                                Remove
                              </Button>
                            )}
                            {(m.status === 'REJECTED' || m.status === 'LEFT') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={busyId === m.id}
                                onClick={() => update(m, { status: 'ACTIVE' }, 'Member reinstated')}
                              >
                                Reinstate
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
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
