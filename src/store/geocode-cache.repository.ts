import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import type { GeocodeCacheRow } from './types';

export type GeocodeCacheInput = {
  queryNormalized: string;
  resultsJson: unknown;
  bestLocationId?: string | null;
  fetchedAt: Date;
};

@Injectable()
export class GeocodeCacheRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findGeocodeCacheByQuery(
    queryNormalized: string,
  ): Promise<GeocodeCacheRow | null> {
    return this.prisma.geocodeCache.findUnique({
      where: { queryNormalized },
    });
  }

  async upsertGeocodeCache(input: GeocodeCacheInput): Promise<GeocodeCacheRow> {
    const resultsJson = input.resultsJson as Prisma.InputJsonValue;
    return this.prisma.geocodeCache.upsert({
      where: { queryNormalized: input.queryNormalized },
      create: {
        queryNormalized: input.queryNormalized,
        resultsJson,
        bestLocationId: input.bestLocationId,
        fetchedAt: input.fetchedAt,
      },
      update: {
        resultsJson,
        bestLocationId: input.bestLocationId,
        fetchedAt: input.fetchedAt,
      },
    });
  }

  /** Delete geocode cache rows older than ttlSeconds. Returns deleted count. */
  async deleteExpired(
    ttlSeconds: number,
    now: Date = new Date(),
  ): Promise<number> {
    if (ttlSeconds <= 0) {
      return 0;
    }
    const cutoff = new Date(now.getTime() - ttlSeconds * 1000);
    const result = await this.prisma.geocodeCache.deleteMany({
      where: { fetchedAt: { lt: cutoff } },
    });
    return result.count;
  }
}
