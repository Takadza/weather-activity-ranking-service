import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import type { RefreshMetaRow } from './types';

const REFRESH_META_ID = 1;

@Injectable()
export class RefreshMetaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getRefreshMeta(): Promise<RefreshMetaRow> {
    const row = await this.prisma.refreshMeta.findUnique({
      where: { id: REFRESH_META_ID },
    });
    if (row) {
      return row;
    }
    // Read-only: do not upsert — /health probes must not write RefreshMeta.
    return {
      id: REFRESH_META_ID,
      lastSuccessAt: null,
      lastAttemptAt: null,
      lastError: null,
    };
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
