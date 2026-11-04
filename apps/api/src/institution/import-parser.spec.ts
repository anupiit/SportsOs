import { externalKey, normaliseRow, parseCsv, sameRecord, tableToObjects, templateHeader } from './import-parser';

const TODAY = new Date('2026-11-04T00:00:00Z');

describe('parseCsv', () => {
  it('handles quotes, embedded commas, doubled quotes, CRLF and BOM', () => {
    const t = parseCsv('﻿name,designation\r\n"Doe, Jane","Officer ""A"""\r\n\r\nX,Y\n');
    expect(t).toEqual([['name', 'designation'], ['Doe, Jane', 'Officer "A"'], ['X', 'Y']]);
  });

  it('rejects an unterminated quote', () => {
    expect(() => parseCsv('a,"b\n')).toThrow(/Unterminated/);
  });

  it('normalises headers', () => {
    expect(tableToObjects([['Name', 'Source URL'], ['A', 'B']]).rows[0]).toEqual({ name: 'A', source_url: 'B' });
  });
});

describe('normaliseRow', () => {
  const base = { name: 'Test Person', designation: 'Test Officer' };

  it('requires the kind-specific columns', () => {
    expect(() => normaliseRow('PERSONNEL', { name: 'X' }, {}, TODAY)).toThrow(/designation/);
    expect(() => normaliseRow('OFFICE_BEARER', { name: 'X' }, {}, TODAY)).toThrow(/position/);
  });

  it('defaults to UNVERIFIED without a source, PENDING_VERIFICATION with one', () => {
    expect(normaliseRow('PERSONNEL', base, {}, TODAY).dataStatus).toBe('UNVERIFIED');
    expect(normaliseRow('PERSONNEL', base, { sourceUrl: 'https://example.org/team' }, TODAY).dataStatus).toBe('PENDING_VERIFICATION');
  });

  it('refuses VERIFIED without both a source and a verification date', () => {
    expect(() => normaliseRow('PERSONNEL', { ...base, status: 'VERIFIED' }, {}, TODAY)).toThrow(/VERIFIED rows need/);
    expect(() => normaliseRow('PERSONNEL', { ...base, status: 'VERIFIED', source_url: 'https://example.org' }, {}, TODAY)).toThrow(/VERIFIED rows need/);
    const ok = normaliseRow('PERSONNEL', { ...base, status: 'verified', source_url: 'https://example.org', verified_on: '2026-11-01' }, {}, TODAY);
    expect(ok.dataStatus).toBe('VERIFIED');
  });

  it('marks records past valid_until as EXPIRED', () => {
    expect(normaliseRow('OFFICE_BEARER', { name: 'A', position: 'Secretary', valid_until: '2026-01-31' }, {}, TODAY).dataStatus).toBe('EXPIRED');
  });

  it('validates email, URL scheme, dates, role hints', () => {
    expect(() => normaliseRow('PERSONNEL', { ...base, email: 'nope' }, {}, TODAY)).toThrow(/email/);
    expect(() => normaliseRow('PERSONNEL', { ...base, source_url: 'http://insecure.example' }, {}, TODAY)).toThrow(/https/);
    expect(() => normaliseRow('PERSONNEL', { ...base, verified_on: '04/11/2026' }, {}, TODAY)).toThrow(/YYYY-MM-DD/);
    expect(() => normaliseRow('PERSONNEL', { ...base, verified_on: '2027-01-01' }, {}, TODAY)).toThrow(/future/);
    expect(() => normaliseRow('PERSONNEL', { ...base, role_hint: 'KING' }, {}, TODAY)).toThrow(/role_hint/);
    expect(normaliseRow('PERSONNEL', { ...base, role_hint: 'coach' }, {}, TODAY).roleHint).toBe('COACH');
  });

  it('detects duplicates regardless of case, spacing and honorifics', () => {
    expect(externalKey('PERSONNEL', { name: 'Dr. Test  Person', designation: 'test officer' })).toBe(externalKey('PERSONNEL', { name: 'test person', designation: 'Test Officer' }));
  });

  it('compares records independently of details key order', () => {
    const a = normaliseRow('FACILITY', { name: 'Hall', type: 'Indoor', capacity: '20' }, {}, TODAY);
    const b = { ...a, details: { capacity: '20', type: 'Indoor' } };
    expect(sameRecord(a as never, b as never)).toBe(true);
  });

  it('templates list required, optional and provenance columns', () => {
    expect(templateHeader('PERSONNEL').trim().split(',')).toEqual(expect.arrayContaining(['name', 'designation', 'source_url', 'verified_on', 'status']));
  });
});
