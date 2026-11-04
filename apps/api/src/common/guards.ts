import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Permission } from '@sportsos/shared';
import { RbacService } from '../rbac/rbac.service';
import type { AuthUser, JwtPayload } from './auth-user';
import { ANY_PERMISSIONS, IS_PUBLIC, REQUIRED_PERMISSIONS } from './decorators';

/** Header a client sends to act as one of the roles it holds (verified server-side). */
export const ACTIVE_ROLE_HEADER = 'x-active-role';

/**
 * Global guard: verifies the bearer JWT, then rebuilds the principal (roles,
 * scopes, permissions) from the database. The role claim inside the token is
 * ignored, so revocations and deactivations take effect on the next request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const activeRole = req.headers[ACTIVE_ROLE_HEADER];
    req.user = await this.rbac.loadAuthUser(payload.sub, typeof activeRole === 'string' ? activeRole : null);
    return true;
  }
}

/** Global guard: enforces @RequirePermission / @RequireAnyPermission against the resolved permissions. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const all = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, targets);
    const any = this.reflector.getAllAndOverride<Permission[]>(ANY_PERMISSIONS, targets);
    if (!all?.length && !any?.length) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException();
    const missing = (all ?? []).filter((p) => !user.permissions.includes(p));
    if (missing.length) throw new ForbiddenException(`Requires permission: ${missing.join(', ')}`);
    if (any?.length && !any.some((p) => user.permissions.includes(p))) throw new ForbiddenException(`Requires one of: ${any.join(', ')}`);
    return true;
  }
}
