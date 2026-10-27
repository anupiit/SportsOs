import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ROLES } from '@sportsos/shared';
import type { Role } from '@prisma/client';
import { ArrayUnique, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { NotificationsService } from './notifications.service';

class BroadcastDto {
  @IsString() @MinLength(3) @MaxLength(120) title: string;
  @IsString() @MinLength(3) @MaxLength(2000) body: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(ROLES, { each: true }) roles?: Role[];
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('broadcast')
  @RequirePermission('notifications:broadcast')
  async broadcast(@CurrentUser() user: AuthUser, @Body() dto: BroadcastDto) {
    const sent = await this.notifications.notifyRoles(dto.roles ?? [], {
      title: dto.title,
      body: `${dto.body}\n— ${user.name}`,
      type: 'INFO',
    });
    return { sent };
  }
}
