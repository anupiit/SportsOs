import { Body, Controller, ForbiddenException, Get, Param, Patch, Query } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { hasPermission, ROLES } from '@sportsos/shared';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { UsersService } from './users.service';

class UpdateUserDto {
  @IsOptional() @IsIn(ROLES) role?: Role;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(60) hostel?: string;
  @IsOptional() @Matches(/^\+?[0-9 ]{7,15}$/) phone?: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('users:read')
  list(@Query('q') q?: string, @Query('role') role?: string) {
    return this.users.list(q, ROLES.includes(role as Role) ? (role as Role) : undefined);
  }

  @Patch(':id')
  @RequirePermission('users:manage')
  update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor, id, dto);
  }

  @Get(':id/profile')
  profile(@CurrentUser() viewer: AuthUser, @Param('id') id: string) {
    if (viewer.id !== id && !hasPermission(viewer.role, 'users:read')) {
      throw new ForbiddenException('You can only view your own profile');
    }
    return this.users.profile(id);
  }
}
