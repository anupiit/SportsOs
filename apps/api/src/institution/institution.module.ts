import { Body, Controller, Get, Header, HttpCode, Module, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { DataStatus, ImportMode, InstitutionalKind } from '@prisma/client';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { MAX_IMPORT_BYTES, templateHeader } from './import-parser';
import { InstitutionService, UploadedFileLike } from './institution.service';

const KINDS: InstitutionalKind[] = ['PERSONNEL', 'OFFICE_BEARER', 'FACILITY', 'SPORT'];
const STATUSES: DataStatus[] = ['VERIFIED', 'PENDING_VERIFICATION', 'EXPIRED', 'UNVERIFIED'];

class PreviewDto {
  @IsIn(KINDS) kind: InstitutionalKind;
  @IsOptional() @IsIn(['CREATE_ONLY', 'UPSERT']) mode?: ImportMode;
  @IsOptional() @IsString() @MaxLength(500) sourceUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) sourceDocument?: string;
}

class CommitDto {
  @IsOptional() @IsBoolean() allowErrors?: boolean;
}

class StatusDto {
  @IsIn(STATUSES) dataStatus: DataStatus;
  @IsOptional() @IsDateString() verifiedOn?: string;
  @IsOptional() @IsString() @MaxLength(500) sourceUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) sourceDocument?: string;
}

class LinkDto {
  @IsOptional() @IsString() userId?: string;
}

@Controller('institution')
export class InstitutionController {
  constructor(private readonly institution: InstitutionService) {}

  @Get('records')
  @RequirePermission('institution.view')
  list(@CurrentUser() user: AuthUser, @Query('kind') kind?: string, @Query('status') status?: string, @Query('q') search?: string) {
    return this.institution.list(user, { kind: KINDS.includes(kind as InstitutionalKind) ? kind : undefined, status: STATUSES.includes(status as DataStatus) ? status : undefined, search });
  }

  @Patch('records/:id/status')
  @RequirePermission('institution.import')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.institution.setStatus(user, id, dto);
  }

  @Post('records/:id/link')
  @HttpCode(200)
  @RequirePermission('institution.import')
  link(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkDto) {
    return this.institution.link(user, id, dto.userId || null);
  }

  @Get('templates/:kind')
  @RequirePermission('institution.import')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  template(@Param('kind') kind: string) {
    return templateHeader(KINDS.includes(kind as InstitutionalKind) ? (kind as InstitutionalKind) : 'PERSONNEL');
  }

  @Get('imports')
  @RequirePermission('institution.import')
  batches() {
    return this.institution.listBatches();
  }

  @Get('imports/:id')
  @RequirePermission('institution.import')
  batch(@Param('id') id: string) {
    return this.institution.get(id);
  }

  /** multipart/form-data: file + kind, mode, sourceUrl, sourceDocument. Validates only — writes no records. */
  @Post('imports')
  @RequirePermission('institution.import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  preview(@CurrentUser() user: AuthUser, @UploadedFile() file: UploadedFileLike, @Body() dto: PreviewDto) {
    return this.institution.preview(user, file, { kind: dto.kind, mode: dto.mode ?? 'CREATE_ONLY', sourceUrl: dto.sourceUrl || undefined, sourceDocument: dto.sourceDocument || undefined });
  }

  @Post('imports/:id/commit')
  @HttpCode(200)
  @RequirePermission('institution.import')
  commit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CommitDto) {
    return this.institution.commit(user, id, dto.allowErrors ?? false);
  }

  @Post('imports/:id/rollback')
  @HttpCode(200)
  @RequirePermission('institution.import')
  rollback(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.institution.rollback(user, id);
  }
}

@Module({ controllers: [InstitutionController], providers: [InstitutionService] })
export class InstitutionModule {}
