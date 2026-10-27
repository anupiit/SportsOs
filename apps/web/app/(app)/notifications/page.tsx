'use client';

import type { Notification, NotificationType, Role } from '@sportsos/shared';
import { ROLES, roleLabel } from '@sportsos/shared';
import clsx from 'clsx';
import { AlertTriangle, Bell, BellRing, CheckCheck, ClipboardCheck, Clock, Info, Megaphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth';
import { useToast } from '@/components/toast';
import { Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Field, Input, PageHeader, SkeletonRows, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime, fmtRelative } from '@/lib/format';
import { revalidate, useApi } from '@/lib/hooks';

const TYPE_ICON: Record<NotificationType, ReactNode> = {
  INFO: <Info className="size-4" />,
  ALERT: <AlertTriangle className="size-4" />,
  APPROVAL: <ClipboardCheck className="size-4" />,
  REMINDER: <Clock className="size-4" />,
};

const TYPE_TONE: Record<NotificationType, string> = {
  INFO: 'bg-accent-soft text-accent-ink',
  ALERT: 'bg-warn-soft text-warn-ink',
  APPROVAL: 'bg-good-soft text-good-ink',
  REMINDER: 'bg-amber-soft text-amber-ink',
};

function BroadcastCard() {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (title.trim().length < 3 || body.trim().length < 3) return toast.warning('Title and message need at least 3 characters');
    setBusy(true);
    try {
      const res = await api.post<{ sent: number }>('/notifications/broadcast', {
        title: title.trim(),
        body: body.trim(),
        roles: roles.length ? roles : undefined,
      });
      toast.success('Announcement sent', `Delivered to ${res.sent} user${res.sent === 1 ? '' : 's'}`);
      setTitle('');
      setBody('');
      setRoles([]);
      await revalidate('/notifications');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (r: Role) => setRoles((list) => (list.includes(r) ? list.filter((x) => x !== r) : [...list, r]));

  return (
    <Card>
      <CardHeader title="Broadcast announcement" description="Replaces the WhatsApp-group blast with a tracked, role-targeted notice." icon={<Megaphone className="size-4" />} />
      <CardBody className="space-y-4">
        <Field label="Title" htmlFor="bc-title" required>
          <Input id="bc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Main ground closed on Saturday" />
        </Field>
        <Field label="Message" htmlFor="bc-body" required>
          <Textarea id="bc-body" value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-text-2">Audience</legend>
          <p className="mb-2 text-xs text-muted">{roles.length ? `${roles.length} role${roles.length === 1 ? '' : 's'} selected` : 'Everyone (no role filter)'}</p>
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {ROLES.map((r) => {
              const on = roles.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(r)}
                  className={clsx(
                    'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                    on ? 'border-accent bg-accent text-white' : 'border-border text-text-2 hover:bg-surface-2',
                  )}
                >
                  {roleLabel(r)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <Button variant="primary" loading={busy} onClick={send} icon={<BellRing className="size-4" />} className="w-full">
          Send announcement
        </Button>
      </CardBody>
    </Card>
  );
}

export default function NotificationsPage() {
  const { can } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<Notification[]>('/notifications', undefined, { refreshInterval: 30000 });
  const [marking, setMarking] = useState(false);
  const unread = (data ?? []).filter((n) => !n.readAt).length;

  async function open(n: Notification) {
    if (!n.readAt) {
      try {
        await api.post(`/notifications/${n.id}/read`);
        await revalidate('/notifications');
      } catch {
        /* non-blocking */
      }
    }
    if (n.link && n.link.startsWith('/')) router.push(n.link);
  }

  async function readAll() {
    setMarking(true);
    try {
      await api.post('/notifications/read-all');
      await revalidate('/notifications');
    } catch (err) {
      toast.error(err);
    } finally {
      setMarking(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Engagement"
        title="Notifications"
        description="Approvals, reminders, alerts and announcements in one place."
        actions={
          unread > 0 && (
            <Button icon={<CheckCheck className="size-4" />} loading={marking} onClick={readAll}>
              Mark all read
            </Button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className={can('notifications:broadcast') ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <CardHeader title="Inbox" description={unread ? `${unread} unread` : 'All caught up'} icon={<Bell className="size-4" />} />
          <CardBody>
            {error ? (
              <ErrorState error={error} onRetry={() => mutate()} />
            ) : isLoading ? (
              <SkeletonRows rows={6} />
            ) : !data?.length ? (
              <EmptyState icon={<Bell className="size-5" />} title="No notifications yet" />
            ) : (
              <ul className="divide-y divide-border">
                {data.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => open(n)}
                      className={clsx('flex w-full gap-3 px-2 py-3 text-left transition-colors hover:bg-surface-2', !n.readAt && 'bg-accent-soft/30')}
                    >
                      <span className={clsx('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', TYPE_TONE[n.type])}>{TYPE_ICON[n.type]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={clsx('text-sm', n.readAt ? 'text-text-2' : 'font-semibold text-text')}>{n.title}</span>
                          {!n.readAt && <span className="size-2 rounded-full bg-accent" aria-label="Unread" />}
                        </span>
                        <span className="mt-0.5 block text-sm text-text-2">{n.body}</span>
                        <span className="mt-1 block text-[11px] text-muted" title={fmtDateTime(n.createdAt)}>
                          {fmtRelative(n.createdAt)}
                          {n.link ? ' · open' : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        {can('notifications:broadcast') && <BroadcastCard />}
      </div>
    </div>
  );
}
