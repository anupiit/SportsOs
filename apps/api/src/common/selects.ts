import type { Prisma } from '@prisma/client';

/** Public user projection used whenever a user is embedded in another resource. */
export const userSummary = {
  id: true,
  name: true,
  email: true,
  role: true,
  admissionNo: true,
  hostel: true,
} satisfies Prisma.UserSelect;

export const userFull = {
  ...userSummary,
  phone: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;
