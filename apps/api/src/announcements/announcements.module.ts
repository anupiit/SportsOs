import { Body, Controller, Get, HttpCode, Injectable, Module, NotFoundException, ConflictException, ForbiddenException, Param, Patch, Post } from '@nestjs/common';
import type { Announcement, Prisma } from '@prisma/client';
import { ROLES, type Role } from '@sportsos/shared';
import { ArrayUnique, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { can } from '../rbac/access';

class DraftDto {
  @IsString() @MinLength(3) @MaxLength(120) title: string;
  @IsString() @MinLength(3) @MaxLength(4000) body: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(ROLES, { each: true }) audienceRoles?: Role[];
}

class EditDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(4000) body?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(ROLES, { each: true }) audienceRoles?: Role[];
}

class ReviewDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

const include = {
  author: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.AnnouncementInclude;

/**
 * Official announcements: drafted (media / council), approved by SPEC / DSW / PESO, then published.
 * Nothing reaches students until it is approved — "no unapproved official announcements".
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  list(user: AuthUser) {
    const or: Prisma.AnnouncementWhereInput[] = [
      { status: 'PUBLISHED', clubId: null, OR: [{ audienceRoles: { isEmpty: true } }, { audienceRoles: { hasSome: user.heldRoles } }] },
      { authorId: user.id, clubId: null },
    ];
    if (can(user, 'announcement.approve')) or.push({ status: 'SUBMITTED', clubId: null });
    if (can(user, 'announcement.publish')) or.push({ status: 'APPROVED', clubId: null });
    return this.prisma.announcement.findMany({ where: { OR: or }, include, orderBy: { updatedAt: 'desc' }, take: 100 });
  }

  async draft(user: AuthUser, dto: DraftDto) {
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.announcement.create({ data: { title: dto.title, body: dto.body, audienceRoles: dto.audienceRoles ?? [], authorId: user.id }, include });
      await this.audit.append(tx, { actorId: user.id, action: 'announcement.draft', entity: 'Announcement', entityId: a.id, payload: { title: dto.title } });
      return a;
    });
  }

  async edit(user: AuthUser, id: string, dto: EditDto) {
    const a = await this.mustGet(id);
    if (a.authorId !== user.id) throw new ForbiddenException('Only the author can edit a draft');
    if (a.status !== 'DRAFT' && a.status !== 'REJECTED') throw new ConflictException(`A ${a.status.toLowerCase()} announcement cannot be edited`);
    return this.prisma.announcement.update({ where: { id }, data: { ...dto, status: 'DRAFT' }, include });
  }

  async submit(user: AuthUser, id: string) {
    const a = await this.mustGet(id);
    if (a.authorId !== user.id) throw new ForbiddenException('Only the author can submit');
    if (a.status !== 'DRAFT' && a.status !== 'REJECTED') throw new ConflictException(`Announcement is already ${a.status.toLowerCase()}`);
    const u = await this.transition(user, a, 'SUBMITTED', 'announcement.submit');
    await this.notifications.notifyPermission('announcement.approve', { title: 'Announcement awaiting approval', body: a.title, type: 'APPROVAL', link: '/announcements' }, undefined, [user.id]);
    return u;
  }

  async review(user: AuthUser, id: string, approve: boolean, note?: string) {
    const a = await this.mustGet(id);
    if (a.authorId === user.id) throw new ForbiddenException('You cannot approve your own announcement');
    if (a.status !== 'SUBMITTED') throw new ConflictException('Only submitted announcements can be reviewed');
    const u = await this.transition(user, a, approve ? 'APPROVED' : 'REJECTED', approve ? 'announcement.approve' : 'announcement.reject', { reviewedById: user.id, reviewedAt: new Date(), reviewNote: note ?? null });
    await this.notifications.notifyUsers([a.authorId], { title: `Announcement ${approve ? 'approved' : 'returned'}`, body: note ?? a.title, type: 'APPROVAL', link: '/announcements' });
    return u;
  }

  async publish(user: AuthUser, id: string) {
    const a = await this.mustGet(id);
    if (a.status !== 'APPROVED') throw new ConflictException('Only approved announcements can be published');
    const u = await this.transition(user, a, 'PUBLISHED', 'announcement.publish', { publishedById: user.id, publishedAt: new Date() });
    await this.notifications.notifyRoles(a.audienceRoles, { title: a.title, body: a.body, type: 'INFO', link: '/announcements' });
    return u;
  }

  private async transition(user: AuthUser, a: Announcement, status: Announcement['status'], action: string, extra: Prisma.AnnouncementUncheckedUpdateInput = {}) {
    return this.prisma.$transaction(async (tx) => {
      // conditional update: two reviewers cannot both act on the same state
      const { count } = await tx.announcement.updateMany({ where: { id: a.id, status: a.status }, data: { status } });
      if (!count) throw new ConflictException('Announcement changed meanwhile; reload and try again');
      const u = await tx.announcement.update({ where: { id: a.id }, data: extra, include });
      await this.audit.append(tx, { actorId: user.id, action, entity: 'Announcement', entityId: a.id, payload: { from: a.status, to: status } });
      return u;
    });
  }

  private async mustGet(id: string) {
    const a = await this.prisma.announcement.findUnique({ where: { id } });
    if (!a || a.clubId) throw new NotFoundException('Announcement not found');
    return a;
  }
}

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.announcements.list(user);
  }

  @Post()
  @RequirePermission('announcement.draft')
  draft(@CurrentUser() user: AuthUser, @Body() dto: DraftDto) {
    return this.announcements.draft(user, dto);
  }

  @Patch(':id')
  @RequirePermission('announcement.draft')
  edit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EditDto) {
    return this.announcements.edit(user, id, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('announcement.draft')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcements.submit(user, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('announcement.approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.announcements.review(user, id, true, dto.note);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('announcement.approve')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.announcements.review(user, id, false, dto.note);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermission('announcement.publish')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcements.publish(user, id);
  }
}

@Module({ controllers: [AnnouncementsController], providers: [AnnouncementsService] })
export class AnnouncementsModule {}
