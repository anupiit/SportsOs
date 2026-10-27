import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Secrets are omitted from every query unless a call opts back in with `omit: { field: false }`. */
const OMIT = {
  user: { passwordHash: true },
  attendanceSession: { secret: true },
} as const;

type Client = PrismaClient<{ omit: typeof OMIT }>;

/** The client handed to `$transaction(async (tx) => …)` callbacks. */
export type Tx = Omit<Client, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

@Injectable()
export class PrismaService extends PrismaClient<{ omit: typeof OMIT }> implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ omit: OMIT });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
