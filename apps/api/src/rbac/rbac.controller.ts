import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ROLES, type Role } from '@sportsos/shared';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { RbacService } from './rbac.service';
import { RoleAssignmentsService } from './role-assignments.service';

class AssignRoleDto {
  @IsString() userId: string;
  @IsIn(ROLES) role: Role;
  @IsOptional() @IsIn(['GLOBAL', 'CLUB', 'HOSTEL', 'SPORT', 'FACILITY']) scopeType?: 'GLOBAL' | 'CLUB' | 'HOSTEL' | 'SPORT' | 'FACILITY';
  @IsOptional() @IsString() @MaxLength(80) scopeId?: string;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsString() @MinLength(3) @MaxLength(300) reason: string;
}

class DecisionDto {
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class RevokeDto {
  @IsString() @MinLength(3) @MaxLength(300) reason: string;
}

@Controller('rbac')
export class RbacController {
  constructor(
    private readonly rbac: RbacService,
    private readonly assignments: RoleAssignmentsService,
  ) {}

  /** The live matrix; readable by every signed-in user (it is what the organisation page shows). */
  @Get('matrix')
  matrix() {
    return this.rbac.matrixView();
  }

  @Put('matrix/:role/:permission')
  @RequirePermission('role.manage_permissions')
  grant(@CurrentUser() actor: AuthUser, @Param('role') role: string, @Param('permission') permission: string) {
    return this.rbac.setGrant(actor, role, permission, true);
  }

  @Delete('matrix/:role/:permission')
  @RequirePermission('role.manage_permissions')
  revokeGrant(@CurrentUser() actor: AuthUser, @Param('role') role: string, @Param('permission') permission: string) {
    return this.rbac.setGrant(actor, role, permission, false);
  }

  @Post('matrix/:role/reset')
  @HttpCode(200)
  @RequirePermission('role.manage_permissions')
  reset(@CurrentUser() actor: AuthUser, @Param('role') role: string) {
    return this.rbac.resetRole(actor, role);
  }

  @Get('assignments/pending')
  @RequirePermission('role.approve')
  pending() {
    return this.assignments.pending();
  }

  @Get('users/:userId/assignments')
  @RequirePermission('user.view')
  history(@Param('userId') userId: string) {
    return this.assignments.history(userId);
  }

  @Post('assignments')
  @RequirePermission('role.assign')
  assign(@CurrentUser() actor: AuthUser, @Body() dto: AssignRoleDto) {
    return this.assignments.assign(actor, dto);
  }

  @Post('assignments/:id/approve')
  @HttpCode(200)
  @RequirePermission('role.approve')
  approve(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.assignments.decide(actor, id, true, dto.note);
  }

  @Post('assignments/:id/reject')
  @HttpCode(200)
  @RequirePermission('role.approve')
  reject(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.assignments.decide(actor, id, false, dto.note);
  }

  @Post('assignments/:id/revoke')
  @HttpCode(200)
  @RequirePermission('role.revoke')
  revoke(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: RevokeDto) {
    return this.assignments.revoke(actor, id, dto.reason);
  }
}
