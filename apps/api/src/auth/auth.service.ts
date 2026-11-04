import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { AuthUser, JwtPayload } from '../common/auth-user';
import { userFull } from '../common/selects';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { LoginDto, RegisterDto } from './auth.dto';

/** Compared against when the email is unknown, so response time doesn't reveal which accounts exist. */
export const BCRYPT_ROUNDS = 12;

const DUMMY_HASH = bcrypt.hashSync('sportsos-timing-equaliser', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly rbac: RbacService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      omit: { passwordHash: false },
    });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');
    return this.issue(user.id);
  }

  async register(dto: RegisterDto) {
    const domain = this.config.get<string>('ALLOWED_EMAIL_DOMAIN', 'iitism.ac.in');
    const email = dto.email.toLowerCase();
    if (domain && !email.endsWith(`@${domain}`)) {
      throw new BadRequestException(`Use your institute email (@${domain})`);
    }
    const admissionNo = dto.admissionNo?.toUpperCase();
    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ email }, ...(admissionNo ? [{ admissionNo }] : [])] },
      select: { id: true },
    });
    if (clash) throw new ConflictException('An account with this email or admission number already exists');
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    // self-registration only ever yields the casual-student role; anything else is assigned by an administrator
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        admissionNo,
        hostel: dto.hostel,
        phone: dto.phone,
        role: 'STUDENT',
        passwordHash,
        roleAssignments: { create: { role: 'STUDENT', reason: 'Self-registration' } },
      },
    });
    return this.issue(user.id);
  }

  /** Session view: the user, the roles they hold, and the permissions in effect for the active role. */
  async me(principal: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: principal.id }, select: userFull });
    return {
      user,
      permissions: principal.permissions,
      activeRole: principal.activeRole,
      heldRoles: principal.heldRoles,
      roles: principal.grants.map((g) => ({ assignmentId: g.assignmentId, role: g.role, scopeType: g.scopeType, scopeId: g.scopeId, validUntil: g.validUntil?.toISOString() ?? null })),
    };
  }

  private async issue(userId: string) {
    const principal = await this.rbac.loadAuthUser(userId);
    const payload: JwtPayload = { sub: principal.id, role: principal.role };
    return { accessToken: await this.jwt.signAsync(payload), ...(await this.me(principal)) };
  }
}
