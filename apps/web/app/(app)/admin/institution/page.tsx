'use client';

import type { DataStatus, ImportBatch, InstitutionalKind, InstitutionalRecord } from '@sportsos/shared';
import { DatabaseZap, Download, FileUp, ShieldAlert, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Field, Input, Notice, PageHeader, Select, SkeletonRows, Tabs } from '@/components/ui';
import { api, downloadFile } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

const KINDS: { value: InstitutionalKind; label: string }[] = [
  { value: 'PERSONNEL', label: 'Personnel (DSW, SPEC, PESO, coaches)' },
  { value: 'OFFICE_BEARER', label: 'Student office-bearers' },
  { value: 'FACILITY', label: 'Facilities' },
  { value: 'SPORT', label: 'Sports catalogue' },
];

const STATUS_TONE: Record<DataStatus, 'green' | 'terracotta' | 'neutral' | 'red'> = {
  VERIFIED: 'green',
  PENDING_VERIFICATION: 'terracotta',
  UNVERIFIED: 'neutral',
  EXPIRED: 'red',
};

type Tab = 'import' | 'records' | 'history';

export default function InstitutionPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('import');
  if (!can('institution.import')) return <EmptyState icon={<ShieldAlert className="size-5" />} title="Restricted" description="Importing institutional data needs institution.import." />;
  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Institutional data"
        description="Controlled import of IIT (ISM) reference data with provenance. Every record carries its source, verification date and status; only VERIFIED records appear in the public directory."
      />
      <Notice tone="amber" title="Use authorised sources only">
        Import from official IIT (ISM) pages or documents issued by DSW / SPEC. Do not type names from memory, scrape authenticated portals, or upload student rosters without
        authorisation. Records without a source stay UNVERIFIED; synthetic test rows must be labelled TEST.
      </Notice>
      <Tabs<Tab>
        className="mt-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'import', label: 'Import' },
          { value: 'records', label: 'Records' },
          { value: 'history', label: 'Import history' },
        ]}
      />
      <div className="mt-4">
        {tab === 'import' && <ImportPanel />}
        {tab === 'records' && <RecordsPanel />}
        {tab === 'history' && <HistoryPanel />}
      </div>
    </div>
  );
}

function ImportPanel() {
  const toast = useToast();
  const [kind, setKind] = useState<InstitutionalKind>('PERSONNEL');
  const [mode, setMode] = useState<'CREATE_ONLY' | 'UPSERT'>('CREATE_ONLY');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceDocument, setSourceDocument] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<ImportBatch | null>(null);

  async function preview() {
    if (!file) return toast.warning('Choose a CSV or XLSX file');
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    form.append('mode', mode);
    if (sourceUrl.trim()) form.append('sourceUrl', sourceUrl.trim());
    if (sourceDocument.trim()) form.append('sourceDocument', sourceDocument.trim());
    setBusy(true);
    try {
      setBatch(await api.upload<ImportBatch>('/institution/imports', form));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function commit(allowErrors: boolean) {
    if (!batch) return;
    const msg = allowErrors ? `Import ${batch.created + batch.updated} valid row(s) and skip ${batch.failed} with errors?` : `Import ${batch.created} new and ${batch.updated} updated record(s)?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      setBatch(await api.post<ImportBatch>(`/institution/imports/${batch.id}/commit`, { allowErrors }));
      toast.success('Import committed', 'It can be rolled back from Import history.');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card>
        <CardHeader title="1. Upload & preview" description="The preview validates every row and writes nothing." icon={<FileUp className="size-4" />} />
        <CardBody className="space-y-3">
          <Field label="Data type" htmlFor="im-kind">
            <Select id="im-kind" value={kind} onChange={(e) => setKind(e.target.value as InstitutionalKind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => downloadFile(`/institution/templates/${kind}`, `sportsos-${kind.toLowerCase()}-template.csv`).catch((e) => toast.error(e))}>
            Download CSV template
          </Button>
          <Field label="Existing records" htmlFor="im-mode">
            <Select id="im-mode" value={mode} onChange={(e) => setMode(e.target.value as 'CREATE_ONLY' | 'UPSERT')}>
              <option value="CREATE_ONLY">Never overwrite (skip duplicates)</option>
              <option value="UPSERT">Update matching records</option>
            </Select>
          </Field>
          <Field label="Default source URL (https)" htmlFor="im-url">
            <Input id="im-url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://www.iitism.ac.in/…" />
          </Field>
          <Field label="Or authorised document reference" htmlFor="im-doc">
            <Input id="im-doc" value={sourceDocument} onChange={(e) => setSourceDocument(e.target.value)} placeholder="e.g. DSW office order no. … dated …" />
          </Field>
          <Field label="File (.csv or .xlsx, max 5 MB)" htmlFor="im-file">
            <input id="im-file" type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          </Field>
          <Button variant="primary" loading={busy} onClick={preview}>
            Preview
          </Button>
        </CardBody>
      </Card>
      <div className="xl:col-span-2">
        {!batch ? (
          <Card>
            <EmptyState icon={<DatabaseZap className="size-5" />} title="No preview yet" description="Upload a file to see exactly what would be created, updated, skipped or rejected." />
          </Card>
        ) : (
          <BatchView batch={batch} busy={busy} onCommit={commit} />
        )}
      </div>
    </div>
  );
}

const ACTION_TONE = { CREATE: 'green', UPDATE: 'blue', UNCHANGED: 'neutral', SKIP: 'neutral', ERROR: 'red' } as const;

function BatchView({ batch, busy, onCommit }: { batch: ImportBatch; busy: boolean; onCommit: (allowErrors: boolean) => void }) {
  return (
    <Card>
      <CardHeader
        title={`2. Review — ${batch.filename}`}
        description={`${batch.totalRows} rows · ${batch.created} new · ${batch.updated} updates · ${batch.unchanged} unchanged · ${batch.skipped} skipped · ${batch.failed} errors`}
        actions={
          batch.status === 'PREVIEWED' ? (
            <div className="flex gap-2">
              {batch.failed > 0 && (
                <Button size="sm" variant="ghost" loading={busy} disabled={batch.created + batch.updated === 0} onClick={() => onCommit(true)}>
                  Import valid rows only
                </Button>
              )}
              <Button size="sm" variant="primary" loading={busy} disabled={batch.failed > 0 || batch.created + batch.updated === 0} onClick={() => onCommit(false)}>
                Commit
              </Button>
            </div>
          ) : (
            <Badge tone="green">{batch.status.toLowerCase().replace('_', ' ')}</Badge>
          )
        }
      />
      <CardBody>
        <div className="max-h-[480px] overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>Action</th>
                <th>Name</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {(batch.items ?? []).map((i) => (
                <tr key={i.id}>
                  <td className="tabular">{i.rowNumber}</td>
                  <td>
                    <Badge tone={ACTION_TONE[i.action]}>{i.action.toLowerCase()}</Badge>
                  </td>
                  <td>{String(i.after?.name ?? '—')}</td>
                  <td>{i.after?.dataStatus ? <Badge tone={STATUS_TONE[i.after.dataStatus as DataStatus]}>{String(i.after.dataStatus).toLowerCase()}</Badge> : '—'}</td>
                  <td className="text-xs text-text-2">{i.message ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

function RecordsPanel() {
  const toast = useToast();
  const [kind, setKind] = useState<InstitutionalKind | ''>('');
  const [status, setStatus] = useState<DataStatus | ''>('');
  const { data, error, isLoading, mutate } = useApi<InstitutionalRecord[]>('/institution/records', { kind: kind || undefined, status: status || undefined });

  async function setRecordStatus(r: InstitutionalRecord, next: DataStatus) {
    let body: Record<string, string> = { dataStatus: next };
    if (next === 'VERIFIED' && !r.sourceUrl && !r.sourceDocument) {
      const src = window.prompt('A verified record needs a source. Enter the https:// URL or the authorised document reference:');
      if (!src) return;
      body = { ...body, ...(src.startsWith('https://') ? { sourceUrl: src } : { sourceDocument: src }) };
    }
    if (!window.confirm(`Mark “${r.name}” as ${next.replace('_', ' ').toLowerCase()}?`)) return;
    try {
      await api.patch(`/institution/records/${r.id}/status`, body);
      toast.success('Status updated');
      await mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Records"
        actions={
          <div className="flex gap-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value as InstitutionalKind | '')} className="h-8 w-44 text-xs" aria-label="Kind">
              <option value="">All kinds</option>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.value.replace('_', ' ').toLowerCase()}
                </option>
              ))}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value as DataStatus | '')} className="h-8 w-44 text-xs" aria-label="Status">
              <option value="">All statuses</option>
              {(Object.keys(STATUS_TONE) as DataStatus[]).map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ').toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      <CardBody>
        {error ? (
          <ErrorState error={error} onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={5} />
        ) : !data?.length ? (
          <EmptyState title="No institutional records yet" description="Nothing has been imported. Records appear here after an import is committed." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Designation</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Verified</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium text-text">{r.name}</td>
                    <td>{r.designation ?? '—'}</td>
                    <td className="text-xs">{r.kind.toLowerCase().replace('_', ' ')}</td>
                    <td>
                      <Badge tone={STATUS_TONE[r.dataStatus]}>{r.dataStatus.replace('_', ' ').toLowerCase()}</Badge>
                    </td>
                    <td className="max-w-48 truncate text-xs">
                      {r.sourceUrl ? (
                        <a href={r.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-accent-ink hover:underline">
                          {new URL(r.sourceUrl).hostname}
                        </a>
                      ) : (
                        (r.sourceDocument ?? '—')
                      )}
                    </td>
                    <td className="text-xs whitespace-nowrap">{r.verifiedAt ? fmtDate(r.verifiedAt) : '—'}</td>
                    <td>
                      <Select
                        value=""
                        onChange={(e) => e.target.value && setRecordStatus(r, e.target.value as DataStatus)}
                        className="h-7 w-32 text-xs"
                        aria-label={`Change status of ${r.name}`}
                      >
                        <option value="">Set status…</option>
                        {(Object.keys(STATUS_TONE) as DataStatus[])
                          .filter((s) => s !== r.dataStatus)
                          .map((s) => (
                            <option key={s} value={s}>
                              {s.replace('_', ' ').toLowerCase()}
                            </option>
                          ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function HistoryPanel() {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<ImportBatch[]>('/institution/imports');

  async function rollback(b: ImportBatch) {
    if (!window.confirm(`Roll back “${b.filename}”? Created records are removed and updated ones restored. Records edited since the import block the rollback.`)) return;
    try {
      await api.post(`/institution/imports/${b.id}/rollback`);
      toast.success('Import rolled back');
      await mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Card>
      <CardBody className="pt-4">
        {error ? (
          <ErrorState error={error} onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={4} />
        ) : !data?.length ? (
          <EmptyState title="No imports yet" />
        ) : (
          <ul className="divide-y divide-border">
            {data.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">
                    {b.filename} <span className="text-xs text-muted">· {b.kind.toLowerCase().replace('_', ' ')} · {b.mode === 'UPSERT' ? 'update' : 'create only'}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {b.createdBy?.name} · {fmtDateTime(b.createdAt)} · {b.created} new, {b.updated} updated, {b.skipped} skipped, {b.failed} errors
                    {b.sourceUrl ? ` · ${b.sourceUrl}` : b.sourceDocument ? ` · ${b.sourceDocument}` : ''}
                  </p>
                </div>
                <Badge tone={b.status === 'COMMITTED' ? 'green' : b.status === 'ROLLED_BACK' ? 'neutral' : 'terracotta'}>{b.status.toLowerCase().replace('_', ' ')}</Badge>
                {b.status === 'COMMITTED' && (
                  <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => rollback(b)}>
                    Roll back
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
