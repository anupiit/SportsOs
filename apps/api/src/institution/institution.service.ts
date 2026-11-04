import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { DataStatus, ImportMode, InstitutionalKind, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { can } from '../rbac/access';
import { comparable, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, normaliseRow, NormalisedRecord, parseCsv, sameRecord, tableToObjects, TRACKED } from './import-parser';

export interface UploadedFileLike {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/** A preview can be committed for this long; after that the administrator re-uploads. */
const PREVIEW_TTL_MS = 24 * 3_600_000;

function toData(r: NormalisedRecord | Record<string, unknown>) {
  const c = comparable(r as Record<string, unknown>) as Record<string, unknown>;
  return {
    ...c,
    verifiedAt: c.verifiedAt ? new Date(`${c.verifiedAt}T00:00:00Z`) : null,
    validUntil: c.validUntil ? new Date(`${c.validUntil}T23:59:59Z`) : null,
    details: (c.details ?? {}) as Prisma.InputJsonValue,
  } as Omit<Prisma.InstitutionalRecordUncheckedCreateInput, 'kind' | 'externalKey'>;
}

@Injectable()
export class InstitutionService {
  private readonly logger = new Logger(InstitutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ records

  /**
   * Holders of institution.import see everything; everyone else sees only
   * VERIFIED records (public directory), without phone numbers.
   */
  async list(user: AuthUser, q: { kind?: string; status?: string; search?: string }) {
    const admin = can(user, 'institution.import');
    const rows = await this.prisma.institutionalRecord.findMany({
      where: {
        ...(q.kind ? { kind: q.kind as InstitutionalKind } : {}),
        ...(admin ? (q.status ? { dataStatus: q.status as DataStatus } : {}) : { dataStatus: 'VERIFIED' }),
        ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { designation: { contains: q.search, mode: 'insensitive' } }] } : {}),
      },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      take: 500,
    });
    return admin ? rows : rows.map(({ phone: _p, linkedUserId: _l, verifiedById: _v, importBatchId: _b, ...r }) => r);
  }

  async setStatus(actor: AuthUser, id: string, dto: { dataStatus: DataStatus; verifiedOn?: string; sourceUrl?: string; sourceDocument?: string }) {
    const rec = await this.prisma.institutionalRecord.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Record not found');
    const sourceUrl = dto.sourceUrl ?? rec.sourceUrl;
    const sourceDocument = dto.sourceDocument ?? rec.sourceDocument;
    if (dto.dataStatus === 'VERIFIED' && !(sourceUrl || sourceDocument)) throw new BadRequestException('A VERIFIED record needs a source URL or an authorised document reference');
    if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) throw new BadRequestException('sourceUrl must be https://');
    const verifiedAt = dto.dataStatus === 'VERIFIED' ? (dto.verifiedOn ? new Date(`${dto.verifiedOn}T00:00:00Z`) : new Date()) : rec.verifiedAt;
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.institutionalRecord.update({
        where: { id },
        data: { dataStatus: dto.dataStatus, sourceUrl, sourceDocument, verifiedAt, ...(dto.dataStatus === 'VERIFIED' ? { verifiedById: actor.id } : {}) },
      });
      await this.audit.append(tx, { actorId: actor.id, action: 'institution.status', entity: 'InstitutionalRecord', entityId: id, payload: { from: rec.dataStatus, to: dto.dataStatus, sourceUrl, sourceDocument } });
      return u;
    });
  }

  /** Links a directory record to a registered account. Grants no role by itself. */
  async link(actor: AuthUser, id: string, userId: string | null) {
    const rec = await this.prisma.institutionalRecord.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Record not found');
    if (userId && !(await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new NotFoundException('User not found');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.institutionalRecord.update({ where: { id }, data: { linkedUserId: userId } });
      await this.audit.append(tx, { actorId: actor.id, action: 'institution.link', entity: 'InstitutionalRecord', entityId: id, payload: { userId } });
      return u;
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async expireLapsed() {
    const { count } = await this.prisma.institutionalRecord.updateMany({ where: { dataStatus: { not: 'EXPIRED' }, validUntil: { lt: new Date() } }, data: { dataStatus: 'EXPIRED' } });
    if (count) this.logger.log(`Marked ${count} institutional record(s) EXPIRED`);
    return count;
  }

  // ------------------------------------------------------------ import pipeline

  async readTable(file: UploadedFileLike): Promise<string[][]> {
    if (!file?.buffer?.length) throw new BadRequestException('Attach a CSV or XLSX file in the "file" field');
    if (file.size > MAX_IMPORT_BYTES) throw new BadRequestException('Import files are limited to 5 MB');
    const isZip = file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const name = file.originalname.toLowerCase();
    if (isZip && name.endsWith('.xlsx')) {
      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
      } catch {
        throw new BadRequestException('The XLSX file could not be read');
      }
      const ws = wb.worksheets[0];
      if (!ws) throw new BadRequestException('The workbook has no worksheet');
      const table: string[][] = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = [];
        for (let c = 1; c <= ws.columnCount; c++) cells.push(cellText(row.getCell(c).value));
        table.push(cells);
      });
      return table;
    }
    if (name.endsWith('.csv') && !isZip) {
      const text = file.buffer.toString('utf8');
      if (text.includes('\u0000') || text.includes('�')) throw new BadRequestException('CSV files must be UTF-8 text');
      try {
        return parseCsv(text);
      } catch (e) {
        throw new BadRequestException(`CSV error: ${(e as Error).message}`);
      }
    }
    throw new BadRequestException('Upload a .csv or .xlsx file');
  }

  /**
   * Dry run: validates every row, detects duplicates (in the file and against
   * the database) and records the planned action per row. Writes no records.
   */
  async preview(actor: AuthUser, file: UploadedFileLike, opts: { kind: InstitutionalKind; mode: ImportMode; sourceUrl?: string; sourceDocument?: string }) {
    if (opts.sourceUrl && !/^https:\/\//i.test(opts.sourceUrl)) throw new BadRequestException('sourceUrl must be https://');
    const { rows } = tableToObjects(await this.readTable(file));
    if (!rows.length) throw new BadRequestException('The file has a header but no data rows');
    if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`At most ${MAX_IMPORT_ROWS} rows per import`);

    const seen = new Map<string, number>();
    const parsed = rows.map((raw, i) => {
      const rowNumber = i + 2; // header is row 1
      try {
        const rec = normaliseRow(opts.kind, raw, opts);
        const dup = seen.get(rec.externalKey);
        if (dup) return { rowNumber, error: `Duplicate of row ${dup} in this file` };
        seen.set(rec.externalKey, rowNumber);
        return { rowNumber, rec };
      } catch (e) {
        return { rowNumber, error: (e as Error).message };
      }
    });
    const keys = parsed.flatMap((p) => ('rec' in p && p.rec ? [p.rec.externalKey] : []));
    const existing = new Map((await this.prisma.institutionalRecord.findMany({ where: { kind: opts.kind, externalKey: { in: keys } } })).map((r) => [r.externalKey, r]));

    const items = parsed.map((p) => {
      if (!('rec' in p) || !p.rec) return { rowNumber: p.rowNumber, action: 'ERROR' as const, message: p.error };
      const cur = existing.get(p.rec.externalKey);
      const after = { ...comparable(p.rec as unknown as Record<string, unknown>), externalKey: p.rec.externalKey } as Prisma.InputJsonValue;
      if (!cur) return { rowNumber: p.rowNumber, action: 'CREATE' as const, after };
      const before = { ...comparable(cur as unknown as Record<string, unknown>), updatedAt: cur.updatedAt.toISOString() } as Prisma.InputJsonValue;
      if (sameRecord(cur as unknown as Record<string, unknown>, p.rec as unknown as Record<string, unknown>)) return { rowNumber: p.rowNumber, action: 'UNCHANGED' as const, recordId: cur.id, before, after };
      if (opts.mode === 'CREATE_ONLY') return { rowNumber: p.rowNumber, action: 'SKIP' as const, recordId: cur.id, before, after, message: 'Already exists (CREATE_ONLY mode never overwrites)' };
      return { rowNumber: p.rowNumber, action: 'UPDATE' as const, recordId: cur.id, before, after };
    });
    const count = (a: string) => items.filter((i) => i.action === a).length;
    const batch = await this.prisma.importBatch.create({
      data: {
        kind: opts.kind,
        filename: file.originalname.slice(0, 200),
        sourceUrl: opts.sourceUrl,
        sourceDocument: opts.sourceDocument,
        mode: opts.mode,
        createdById: actor.id,
        totalRows: items.length,
        created: count('CREATE'),
        updated: count('UPDATE'),
        unchanged: count('UNCHANGED'),
        skipped: count('SKIP'),
        failed: count('ERROR'),
        items: { create: items },
      },
      include: { items: { orderBy: { rowNumber: 'asc' } } },
    });
    return batch;
  }

  /** Applies a preview. Aborts entirely if any target record changed since the preview. */
  async commit(actor: AuthUser, batchId: string, allowErrors = false) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id: batchId }, include: { items: true } });
    if (!batch) throw new NotFoundException('Import not found');
    if (batch.status !== 'PREVIEWED') throw new ConflictException(`Import is already ${batch.status.toLowerCase().replace('_', ' ')}`);
    if (Date.now() - batch.createdAt.getTime() > PREVIEW_TTL_MS) throw new ConflictException('This preview is older than 24 hours; upload the file again');
    if (batch.failed && !allowErrors) throw new BadRequestException(`${batch.failed} row(s) have errors; fix them or commit with allowErrors=true to import only the valid rows`);
    const now = new Date();
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('institution:import'))`;
        const conflicts: string[] = [];
        for (const item of batch.items) {
          const after = item.after as Record<string, unknown> | null;
          if (item.action === 'CREATE' && after) {
            const clash = await tx.institutionalRecord.findUnique({ where: { kind_externalKey: { kind: batch.kind, externalKey: String(after.externalKey) } } });
            if (clash) {
              conflicts.push(`row ${item.rowNumber}: created by someone else since the preview`);
              continue;
            }
            const rec = await tx.institutionalRecord.create({ data: { kind: batch.kind, externalKey: String(after.externalKey), ...toData(after), importBatchId: batch.id } });
            await tx.importBatchItem.update({ where: { id: item.id }, data: { recordId: rec.id } });
          } else if (item.action === 'UPDATE' && item.recordId && after) {
            const cur = await tx.institutionalRecord.findUnique({ where: { id: item.recordId } });
            const before = item.before as Record<string, unknown>;
            if (!cur || cur.updatedAt.toISOString() !== before.updatedAt) {
              conflicts.push(`row ${item.rowNumber}: record changed since the preview`);
              continue;
            }
            await tx.institutionalRecord.update({ where: { id: item.recordId }, data: { ...toData(after), importBatchId: batch.id } });
          }
        }
        if (conflicts.length) throw new ConflictException(`Nothing was imported. ${conflicts.slice(0, 10).join('; ')}. Upload the file again to re-check.`);
        await tx.importBatch.update({ where: { id: batch.id }, data: { status: 'COMMITTED', committedAt: now } });
        await this.audit.append(tx, {
          actorId: actor.id,
          action: 'institution.import.commit',
          entity: 'ImportBatch',
          entityId: batch.id,
          payload: { kind: batch.kind, filename: batch.filename, created: batch.created, updated: batch.updated, skipped: batch.skipped, failed: batch.failed },
        });
      },
      { timeout: 60_000 },
    );
    return this.get(batchId);
  }

  /** Undo a committed import, provided nothing it touched has been edited since. */
  async rollback(actor: AuthUser, batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id: batchId }, include: { items: true } });
    if (!batch) throw new NotFoundException('Import not found');
    if (batch.status !== 'COMMITTED') throw new ConflictException('Only committed imports can be rolled back');
    if (batch.createdById !== actor.id && !can(actor, 'role.approve')) throw new ForbiddenException('Only the importer or an approver can roll back this import');
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('institution:import'))`;
        const conflicts: string[] = [];
        for (const item of batch.items) {
          if (!item.recordId || (item.action !== 'CREATE' && item.action !== 'UPDATE')) continue;
          const cur = await tx.institutionalRecord.findUnique({ where: { id: item.recordId } });
          if (!cur) continue;
          if (cur.importBatchId !== batch.id || !sameRecord(cur as unknown as Record<string, unknown>, item.after as Record<string, unknown>)) {
            conflicts.push(`row ${item.rowNumber} (${cur.name}) was edited after the import`);
            continue;
          }
          if (item.action === 'CREATE') await tx.institutionalRecord.delete({ where: { id: cur.id } });
          else await tx.institutionalRecord.update({ where: { id: cur.id }, data: { ...toData(item.before as Record<string, unknown>), importBatchId: null } });
        }
        if (conflicts.length) throw new ConflictException(`Rollback aborted, nothing changed: ${conflicts.slice(0, 10).join('; ')}`);
        await tx.importBatch.update({ where: { id: batch.id }, data: { status: 'ROLLED_BACK', rolledBackAt: new Date(), rolledBackById: actor.id } });
        await this.audit.append(tx, { actorId: actor.id, action: 'institution.import.rollback', entity: 'ImportBatch', entityId: batch.id, payload: { kind: batch.kind } });
      },
      { timeout: 60_000 },
    );
    return this.get(batchId);
  }

  listBatches() {
    return this.prisma.importBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { createdBy: { select: { id: true, name: true } } } });
  }

  async get(id: string) {
    const b = await this.prisma.importBatch.findUnique({ where: { id }, include: { items: { orderBy: { rowNumber: 'asc' } }, createdBy: { select: { id: true, name: true } } } });
    if (!b) throw new NotFoundException('Import not found');
    return b;
  }
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('hyperlink' in v) return String(v.hyperlink ?? v.text ?? '');
    if ('text' in v) return String((v as { text: unknown }).text);
    if ('result' in v) return String((v as { result: unknown }).result ?? '');
    return '';
  }
  return String(v);
}

export { TRACKED };
