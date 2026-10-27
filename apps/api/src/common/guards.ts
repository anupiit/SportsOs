import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { hasPermission, Permission } from '@sportsos/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser, JwtPayload } from './auth-user';
import { IS_PUBLIC, REQUIRED_PERMISSIONS } from './decorators';

/**
 * Global guard: verifies the bearer JWT and loads the user fresh from the
 * database, so deactivation and role changes take effect immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
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
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    if (!user) throw new UnauthorizedException('Session is no longer valid; sign in again');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');
    req.user = { id: user.id, email: user.email, name: user.name, role: user.role } satisfies AuthUser;
    return true;
  }
}

/** Global guard: enforces @RequirePermission against the role → permission table. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException();
    const missing = required.filter((p) => !hasPermission(user.role, p));
    if (missing.length) throw new ForbiddenException(`Requires permission: ${missing.join(', ')}`);
    return true;
  }
}
