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
}
