import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import type { LocationRow } from './types';

export type LocationInput = {
  name: string;
  country?: string | null;
  admin1?: string | null;
  latitude: number;
  longitude: number;
};

export type FindOrCreateLocationOptions = {
  /** When true, mark (or keep) the location as tracked for refresh. */
  tracked?: boolean;
};

/** Round to 5 decimal places (~1.1m) for stable lat/lon identity. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

@Injectable()
export class LocationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreateLocation(
    input: LocationInput,
    options: FindOrCreateLocationOptions = {},
  ): Promise<LocationRow> {
    const tracked = options.tracked === true;
    const latitude = roundCoordinate(input.latitude);
    const longitude = roundCoordinate(input.longitude);
    return this.prisma.location.upsert({
      where: {
        latitude_longitude: {
          latitude,
          longitude,
        },
      },
      create: {
        name: input.name,
        country: input.country,
        admin1: input.admin1,
        latitude,
        longitude,
        tracked,
      },
      // Preserve name/country/admin1 on coordinate match. Promote to tracked
      // when requested; never demote tracked → false here.
      update: tracked ? { tracked: true } : {},
    });
  }

  async listTrackedLocations(): Promise<LocationRow[]> {
    return this.prisma.location.findMany({
      where: { tracked: true },
      orderBy: { id: 'asc' },
    });
  }

  async countTrackedLocations(): Promise<number> {
    return this.prisma.location.count({
      where: { tracked: true },
    });
  }
}
