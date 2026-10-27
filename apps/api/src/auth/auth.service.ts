import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ROLE_PERMISSIONS } from '@sportsos/shared';
import * as bcrypt from 'bcryptjs';
import type { JwtPayload } from '../common/auth-user';
import { userFull } from '../common/selects';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';

/** Compared against when the email is unknown, so response time doesn't reveal which accounts exist. */
const DUMMY_HASH = bcrypt.hashSync('sportsos-timing-equaliser', 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        admissionNo,
        hostel: dto.hostel,
        phone: dto.phone,
        role: 'STUDENT',
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
    });
    return this.issue(user.id);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userFull });
    return { user, permissions: ROLE_PERMISSIONS[user.role] };
  }

  private async issue(userId: string) {
    const { user, permissions } = await this.me(userId);
    const payload: JwtPayload = { sub: user.id, role: user.role };
    return { accessToken: await this.jwt.signAsync(payload), user, permissions };
  }
}
