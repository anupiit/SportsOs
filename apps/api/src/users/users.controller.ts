import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ROLES, type Role } from '@sportsos/shared';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { UsersService } from './users.service';

export class UpdateUserDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(60) hostel?: string;
  @IsOptional() @Matches(/^\+?[0-9 ]{7,15}$/) phone?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
}

export class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(10) @MaxLength(200) temporaryPassword: string;
  @IsOptional() @Matches(/^[0-9]{2}[A-Za-z]{2}[0-9]{4}$/) admissionNo?: string;
  @IsOptional() @IsString() @MaxLength(60) hostel?: string;
  @IsOptional() @Matches(/^\+?[0-9 ]{7,15}$/) phone?: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('user.view')
  list(@CurrentUser() viewer: AuthUser, @Query('q') q?: string, @Query('role') role?: string) {
    return this.users.list(viewer, q, ROLES.includes(role as Role) ? (role as Role) : undefined);
  }

  @Post()
  @RequirePermission('user.create')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor, dto);
  }

  /** Roles are not edited here any more — use /rbac/assignments. */
  @Patch(':id')
  update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor, id, dto);
  }

  @Get(':id/profile')
  profile(@CurrentUser() viewer: AuthUser, @Param('id') id: string) {
    return this.users.profile(viewer, id);
  }
}
