'use client';

import type { Announcement } from '@sportsos/shared';
import { Megaphone } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Button, Card, CardBody, CardHeader, EmptyState, Field, Input, SkeletonRows, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

/** Members read; the coach / sport coordinator / admins post. The API enforces both. */
export function ClubAnnouncements({ clubId, canPost, canRead }: { clubId: string; canPost: boolean; canRead: boolean }) {
  const toast = useToast();
  const { data, isLoading, mutate } = useApi<Announcement[]>(canRead ? `/clubs/${clubId}/announcements` : null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  if (!canRead) return null;

  async function post() {
    if (title.trim().length < 3 || body.trim().length < 3) return toast.warning('Add a title and a message');
    setBusy(true);
    try {
      await api.post(`/clubs/${clubId}/announcements`, { title: title.trim(), body: body.trim() });
      toast.success('Announcement sent to all active members');
      setTitle('');
      setBody('');
      await mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Club announcements" icon={<Megaphone className="size-4" />} />
      <CardBody className="space-y-4">
        {canPost && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Field label="Title" htmlFor="ca-title">
              <Input id="ca-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Message" htmlFor="ca-body">
              <Textarea id="ca-body" value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <Button size="sm" variant="primary" loading={busy} onClick={post}>
              Post to members
            </Button>
          </div>
        )}
        {isLoading ? (
          <SkeletonRows rows={2} />
        ) : !data?.length ? (
          <EmptyState title="No announcements yet" className="py-4" />
        ) : (
          <ul className="space-y-3">
            {data.map((a) => (
              <li key={a.id}>
                <p className="text-sm font-medium text-text">{a.title}</p>
                <p className="text-sm whitespace-pre-line text-text-2">{a.body}</p>
                <p className="text-[11px] text-muted">
                  {a.author?.name} · {fmtDateTime(a.publishedAt ?? a.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

interface Correction {
  id: string;
  action: 'ADD' | 'REMOVE';
  reason: string;
  createdAt: string;
  user?: { name: string; admissionNo: string | null };
  actor?: { name: string };
}

/** Manual attendance correction with a mandatory reason; records are marked MANUAL and carry no GPS. */
export function AttendanceCorrections({ sessionId, onChanged }: { sessionId: string; onChanged: () => void }) {
  const toast = useToast();
  const { data, mutate } = useApi<Correction[]>(`/attendance/sessions/${sessionId}/corrections`);
  const [student, setStudent] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(action: 'ADD' | 'REMOVE') {
    if (student.trim().length < 3) return toast.warning('Enter the student’s email or admission number');
    if (reason.trim().length < 5) return toast.warning('A reason of at least 5 characters is required');
    if (action === 'REMOVE' && !window.confirm('Remove this attendance record? The correction is logged.')) return;
    setBusy(true);
    try {
      await api.post(`/attendance/sessions/${sessionId}/corrections`, { student: student.trim(), action, reason: reason.trim() });
      toast.success(action === 'ADD' ? 'Marked present (manual)' : 'Record removed');
      setStudent('');
      setReason('');
      await mutate();
      onChanged();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-border p-4">
      <h3 className="mb-2 text-sm font-semibold text-text">Attendance correction</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input value={student} onChange={(e) => setStudent(e.target.value)} placeholder="Email or admission no." aria-label="Student" />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. phone battery died)" aria-label="Reason" />
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="primary" loading={busy} onClick={() => submit('ADD')}>
          Mark present
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => submit('REMOVE')}>
          Remove record
        </Button>
      </div>
      {!!data?.length && (
        <ul className="mt-3 space-y-1 text-xs text-text-2">
          {data.map((c) => (
            <li key={c.id}>
              {c.action === 'ADD' ? 'Added' : 'Removed'} {c.user?.name} — {c.reason} · by {c.actor?.name} {fmtDateTime(c.createdAt)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
