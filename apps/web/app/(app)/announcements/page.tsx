'use client';

import type { Announcement, AnnouncementStatus, Role } from '@sportsos/shared';
import { ROLES, roleLabel } from '@sportsos/shared';
import { Megaphone, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth, useUser } from '@/components/auth';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, SkeletonRows, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

const TONE: Record<AnnouncementStatus, 'neutral' | 'terracotta' | 'blue' | 'red' | 'green'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'terracotta',
  APPROVED: 'blue',
  REJECTED: 'red',
  PUBLISHED: 'green',
};

/** Official announcements: draft → submit → approve → publish. Students only ever see published ones. */
export default function AnnouncementsPage() {
  const { can } = useAuth();
  const me = useUser();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<Announcement[]>('/announcements');
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(a: Announcement, action: 'submit' | 'approve' | 'reject' | 'publish') {
    let body: Record<string, string> | undefined;
    if (action === 'reject') {
      const note = window.prompt('What should the author change?');
      if (!note) return;
      body = { note };
    }
    if (action === 'publish' && !window.confirm(`Publish “${a.title}” now? Everyone in the audience is notified.`)) return;
    setBusy(a.id);
    try {
      await api.post(`/announcements/${a.id}/${action}`, body ?? {});
      toast.success({ submit: 'Submitted for approval', approve: 'Approved', reject: 'Returned to the author', publish: 'Published' }[action]);
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
        eyebrow="Engagement"
        title="Announcements"
        description="Official sports announcements. Drafts from media and council nominees are published only after approval by SPEC, DSW or the Sports Officer."
        actions={
          can('announcement.draft') && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDrafting(true)}>
              New draft
            </Button>
          )
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading ? (
        <SkeletonRows rows={4} />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={<Megaphone className="size-5" />} title="No announcements" description="Published announcements for your roles appear here." />
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((a) => (
            <article key={a.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-text">{a.title}</h2>
                    {a.status !== 'PUBLISHED' && <Badge tone={TONE[a.status]}>{a.status.toLowerCase()}</Badge>}
                    {a.audienceRoles.length > 0 && <Badge tone="neutral">For: {a.audienceRoles.map(roleLabel).join(', ')}</Badge>}
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-line text-text-2">{a.body}</p>
                  <p className="mt-2 text-xs text-muted">
                    {a.author?.name} · {fmtDateTime(a.publishedAt ?? a.updatedAt)}
                    {a.reviewNote ? ` · reviewer: ${a.reviewNote}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  {a.authorId === me.id && (a.status === 'DRAFT' || a.status === 'REJECTED') && (
                    <Button size="sm" loading={busy === a.id} onClick={() => act(a, 'submit')}>
                      Submit for approval
                    </Button>
                  )}
                  {a.status === 'SUBMITTED' && can('announcement.approve') && a.authorId !== me.id && (
                    <>
                      <Button size="sm" variant="primary" loading={busy === a.id} onClick={() => act(a, 'approve')}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => act(a, 'reject')}>
                        Return
                      </Button>
                    </>
                  )}
                  {a.status === 'APPROVED' && can('announcement.publish') && (
                    <Button size="sm" variant="accent" loading={busy === a.id} onClick={() => act(a, 'publish')}>
                      Publish
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <DraftModal open={drafting} onClose={() => setDrafting(false)} onSaved={() => mutate()} />
    </div>
  );
}

function DraftModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (title.trim().length < 3 || body.trim().length < 3) return toast.warning('Add a title and a message');
    setBusy(true);
    try {
      await api.post('/announcements', { title: title.trim(), body: body.trim(), audienceRoles: audience });
      toast.success('Draft saved', 'Submit it for approval when ready.');
      setTitle('');
      setBody('');
      setAudience([]);
      onSaved();
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
      title="Draft announcement"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save draft
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title" htmlFor="an-title">
          <Input id="an-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Message" htmlFor="an-body">
          <Textarea id="an-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-text-2">Audience (none selected = everyone)</legend>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {ROLES.map((r) => (
              <label key={r} className={`cursor-pointer rounded-full border px-2 py-0.5 text-[11px] ${audience.includes(r) ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-text-2'}`}>
                <input type="checkbox" className="sr-only" checked={audience.includes(r)} onChange={(e) => setAudience((a) => (e.target.checked ? [...a, r] : a.filter((x) => x !== r)))} />
                {roleLabel(r)}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-muted">Do not include personal student information or photos without consent.</p>
      </div>
    </Modal>
  );
}
