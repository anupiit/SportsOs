/**
 * Parsing and row validation for institutional data imports. Pure functions,
 * unit-tested in import-parser.spec.ts. Nothing here invents data: a row is
 * accepted only with the fields the administrator supplied.
 */
import type { DataStatus, InstitutionalKind, Role } from '@prisma/client';
import { isRole } from '@sportsos/shared';

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export const COLUMNS: Record<InstitutionalKind, { required: string[]; optional: string[] }> = {
  PERSONNEL: { required: ['name', 'designation'], optional: ['department', 'email', 'phone', 'sport', 'role_hint'] },
  OFFICE_BEARER: { required: ['name', 'position'], optional: ['hostel', 'sport', 'email', 'role_hint'] },
  FACILITY: { required: ['name'], optional: ['type', 'sports', 'location', 'capacity', 'notes'] },
  SPORT: { required: ['name'], optional: ['category', 'description'] },
};
const PROVENANCE = ['source_url', 'source_document', 'verified_on', 'valid_until', 'status'];

export function templateHeader(kind: InstitutionalKind): string {
  const c = COLUMNS[kind];
  return [...c.required, ...c.optional, ...PROVENANCE].join(',') + '\n';
}

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, optional BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('Unterminated quoted field');
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function tableToObjects(table: string[][]): { header: string[]; rows: Record<string, string>[] } {
  if (!table.length) throw new Error('The file is empty');
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const rows = table.slice(1).map((cells) => Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()])));
  return { header, rows };
}

export function norm(s: string | null | undefined) {
  return (s ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Strips an optional honorific so "Dr. A. B." and "A. B." are treated as the same person. */
function normPerson(name: string) {
  return norm(name).replace(/^(dr|prof|mr|mrs|ms|shri|smt)\.?\s+/, '');
}

export function externalKey(kind: InstitutionalKind, r: { name: string; designation?: string | null; hostel?: string | null; sport?: string | null }) {
  switch (kind) {
    case 'PERSONNEL':
      return `${normPerson(r.name)}|${norm(r.designation)}`;
    case 'OFFICE_BEARER':
      return `${norm(r.designation)}|${norm(r.hostel)}|${norm(r.sport)}|${normPerson(r.name)}`;
    default:
      return norm(r.name);
  }
}

export interface NormalisedRecord {
  kind: InstitutionalKind;
  externalKey: string;
  name: string;
  designation: string | null;
  roleHint: Role | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  sport: string | null;
  hostel: string | null;
  details: Record<string, string>;
  sourceUrl: string | null;
  sourceDocument: string | null;
  verifiedAt: string | null;
  validUntil: string | null;
  dataStatus: DataStatus;
}

const STATUSES: DataStatus[] = ['VERIFIED', 'PENDING_VERIFICATION', 'EXPIRED', 'UNVERIFIED'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function date(v: string, field: string): string | null {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())) throw new Error(`${field} must be YYYY-MM-DD`);
  return v;
}

function cap(v: string, n: number, field: string) {
  if (v.length > n) throw new Error(`${field} exceeds ${n} characters`);
  return v || null;
}

/**
 * Validates one row. Status rules:
 *  - VERIFIED needs a source (URL or document reference) AND a verification date;
 *  - with no status given: PENDING_VERIFICATION if a source is given, else UNVERIFIED;
 *  - a past valid_until always yields EXPIRED.
 */
export function normaliseRow(kind: InstitutionalKind, raw: Record<string, string>, defaults: { sourceUrl?: string | null; sourceDocument?: string | null }, today = new Date()): NormalisedRecord {
  for (const f of COLUMNS[kind].required) if (!raw[f]) throw new Error(`Missing required column "${f}"`);
  const name = cap(raw.name, 160, 'name')!;
  const designation = kind === 'OFFICE_BEARER' ? cap(raw.position ?? '', 120, 'position') : cap(raw.designation ?? '', 120, 'designation');
  const email = raw.email ? raw.email.toLowerCase() : null;
  if (email && !EMAIL.test(email)) throw new Error('email is not a valid address');
  const phone = raw.phone || null;
  if (phone && !/^\+?[0-9 ()-]{6,20}$/.test(phone)) throw new Error('phone is not a valid number');
  const roleHint = raw.role_hint ? raw.role_hint.toUpperCase() : null;
  if (roleHint && !isRole(roleHint)) throw new Error(`role_hint "${raw.role_hint}" is not a SportsOS role`);
  const sourceUrl = raw.source_url || defaults.sourceUrl || null;
  if (sourceUrl && !/^https:\/\/[^\s]+$/i.test(sourceUrl)) throw new Error('source_url must be an https:// URL');
  const sourceDocument = cap(raw.source_document || defaults.sourceDocument || '', 300, 'source_document');
  const verifiedAt = date(raw.verified_on ?? '', 'verified_on');
  const validUntil = date(raw.valid_until ?? '', 'valid_until');
  let status = (raw.status ? raw.status.toUpperCase().replace(/\s+/g, '_') : '') as DataStatus | '';
  if (status && !STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  if (status === 'VERIFIED' && (!(sourceUrl || sourceDocument) || !verifiedAt)) throw new Error('VERIFIED rows need source_url or source_document and verified_on');
  if (verifiedAt && new Date(`${verifiedAt}T00:00:00Z`) > today) throw new Error('verified_on cannot be in the future');
  if (!status) status = sourceUrl || sourceDocument ? 'PENDING_VERIFICATION' : 'UNVERIFIED';
  if (validUntil && new Date(`${validUntil}T23:59:59Z`) < today) status = 'EXPIRED';

  const known = new Set([...COLUMNS[kind].required, ...COLUMNS[kind].optional, ...PROVENANCE, 'designation', 'position']);
  const details: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (v && !known.has(k)) details[k] = v.slice(0, 500);
  for (const k of ['type', 'sports', 'location', 'capacity', 'notes', 'category', 'description']) if (raw[k] && COLUMNS[kind].optional.includes(k)) details[k] = raw[k].slice(0, 1000);

  const rec = {
    kind,
    name,
    designation,
    roleHint: (roleHint as Role | null) ?? null,
    department: cap(raw.department ?? '', 120, 'department'),
    email,
    phone,
    sport: cap(raw.sport ?? '', 60, 'sport'),
    hostel: cap(raw.hostel ?? '', 60, 'hostel'),
    details,
    sourceUrl,
    sourceDocument,
    verifiedAt,
    validUntil,
    dataStatus: status,
  };
  return { ...rec, externalKey: externalKey(kind, rec) };
}

/** Fields compared to decide UPDATE vs UNCHANGED and stored for rollback. */
export const TRACKED = ['name', 'designation', 'roleHint', 'department', 'email', 'phone', 'sport', 'hostel', 'details', 'sourceUrl', 'sourceDocument', 'verifiedAt', 'validUntil', 'dataStatus'] as const;

export function comparable(r: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of TRACKED) {
    const v = r[k];
    if (k === 'details') {
      // jsonb does not preserve key order, so compare a canonical form
      const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
      out[k] = Object.fromEntries(Object.keys(d).sort().map((key) => [key, d[key]]));
    } else out[k] = v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? null);
  }
  return out;
}

export function sameRecord(a: Record<string, unknown>, b: Record<string, unknown>) {
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}
