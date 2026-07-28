import { Injectable } from '@nestjs/common';
import type { GeocodeCache, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type GeocodeCacheInput = {
  queryNormalized: string;
  resultsJson: Prisma.InputJsonValue;
  bestLocationId?: string | null;
  fetchedAt: Date;
};

@Injectable()
export class GeocodeCacheRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertGeocodeCache(input: GeocodeCacheInput): Promise<GeocodeCache> {
    return this.prisma.geocodeCache.upsert({
      where: { queryNormalized: input.queryNormalized },
      create: input,
      update: {
        resultsJson: input.resultsJson,
        bestLocationId: input.bestLocationId,
        fetchedAt: input.fetchedAt,
      },
    });
  }
}
