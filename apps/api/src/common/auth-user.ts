import type { Role } from '@sportsos/shared';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface JwtPayload {
  sub: string;
  role: Role;
}
