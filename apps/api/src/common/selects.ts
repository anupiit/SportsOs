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

/** Minimum identification for gate / security staff. */
export const userMinimal = { id: true, name: true, admissionNo: true } satisfies Prisma.UserSelect;

/** Directory view: no contact details. */
export const userDirectory = {
  ...userSummary,
  isActive: true,
  isDemo: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/** Full record (self, or holders of user.update). */
export const userFull = {
  ...userDirectory,
  phone: true,
} satisfies Prisma.UserSelect;
