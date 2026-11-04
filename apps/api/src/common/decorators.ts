import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@sportsos/shared';
import type { AuthUser } from './auth-user';

export const IS_PUBLIC = 'sportsos:public';
export const REQUIRED_PERMISSIONS = 'sportsos:permissions';
export const ANY_PERMISSIONS = 'sportsos:any-permissions';

/** Route needs no bearer token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route needs every listed permission (see packages/shared/src/permissions.ts). */
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Route needs at least one of the listed permissions. */
export const RequireAnyPermission = (...permissions: Permission[]) => SetMetadata(ANY_PERMISSIONS, permissions);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
