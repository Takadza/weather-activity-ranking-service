import { Injectable } from '@nestjs/common';
import type { RefreshMeta } from '@prisma/client';
import { PrismaService } from './prisma.service';

const REFRESH_META_ID = 1;

@Injectable()
export class RefreshMetaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getRefreshMeta(): Promise<RefreshMeta> {
    return this.prisma.refreshMeta.upsert({
      where: { id: REFRESH_META_ID },
      create: { id: REFRESH_META_ID },
      update: {},
    });
  }

  async recordRefreshSuccess(): Promise<void> {
    const now = new Date();
    await this.prisma.refreshMeta.upsert({
      where: { id: REFRESH_META_ID },
      create: {
        id: REFRESH_META_ID,
        lastAttemptAt: now,
        lastSuccessAt: now,
      },
      update: {
        lastAttemptAt: now,
        lastSuccessAt: now,
        lastError: null,
      },
    });
  }

  async recordRefreshFailure(error: string): Promise<void> {
    const now = new Date();
    await this.prisma.refreshMeta.upsert({
      where: { id: REFRESH_META_ID },
      create: {
        id: REFRESH_META_ID,
        lastAttemptAt: now,
        lastError: error,
      },
      update: {
        lastAttemptAt: now,
        lastError: error,
      },
    });
  }
}
