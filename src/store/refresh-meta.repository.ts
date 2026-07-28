import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import type { RefreshMetaRow } from './types';

const REFRESH_META_ID = 1;

@Injectable()
export class RefreshMetaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getRefreshMeta(): Promise<RefreshMetaRow> {
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
        lastError: null,
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
