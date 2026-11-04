import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ComplaintCategory, ComplaintStatus, Priority } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { ComplaintsService, MAX_ATTACHMENT_BYTES } from './complaints.service';

const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH'];
export const CATEGORIES: ComplaintCategory[] = ['FACILITY', 'EQUIPMENT', 'STAFF', 'BOOKING', 'SECURITY', 'MAINTENANCE', 'OTHER'];

export class CreateComplaintDto {
  @IsIn(CATEGORIES) category: ComplaintCategory;
  @IsString() @MinLength(4) @MaxLength(120) subject: string;
  @IsString() @MinLength(10) @MaxLength(4000) description: string;
  @IsOptional() @IsString() facilityId?: string;
  @IsOptional() @IsString() equipmentId?: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
}

export class UpdateComplaintDto {
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED']) status?: Exclude<ComplaintStatus, 'CLOSED'>;
  @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsString() @MaxLength(2000) resolution?: string;
}

export class NoteDto {
  @IsString() @MinLength(3) @MaxLength(1000) note: string;
}

export class OptionalNoteDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

/** Minimal shape of an uploaded file (multer memory storage). */
export interface UploadedBlob {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  @RequirePermission('complaint.view_own')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.complaints.list(user, status);
  }

  @Get(':id')
  @RequirePermission('complaint.view_own')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.complaints.get(user, id);
  }

  @Post()
  @RequirePermission('complaint.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateComplaintDto) {
    return this.complaints.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateComplaintDto) {
    return this.complaints.update(user, id, dto);
  }

  @Post(':id/escalate')
  @HttpCode(200)
  @RequirePermission('complaint.escalate')
  escalate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.complaints.escalate(user, id, dto.note);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OptionalNoteDto) {
    return this.complaints.close(user, id, dto.note);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.complaints.reopen(user, id, dto.note);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }))
  attach(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file?: UploadedBlob) {
    return this.complaints.attach(user, id, file);
  }

  @Get(':id/attachments/:attachmentId')
  async download(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('attachmentId') attachmentId: string, @Res() res: Response) {
    const a = await this.complaints.attachment(user, id, attachmentId);
    res.setHeader('Content-Type', a.mimeType);
    res.setHeader('Content-Length', String(a.size));
    res.setHeader('Content-Disposition', `attachment; filename="${a.filename.replace(/[^\w.-]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(Buffer.from(a.data));
  }
}
