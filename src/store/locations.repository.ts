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
  /**
   * When true, attempt to promote under maxTracked via tryPromoteTracked.
   * Never creates tracked rows that bypass the cap.
   */
  tracked?: boolean;
  /** Cap for tracked promotion when tracked: true. Default 100. */
  maxTracked?: number;
};

/** Round to 5 decimal places (~1.1m) for stable lat/lon identity. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/** Session advisory lock key for tracked promotion (distinct from refresh lock). */
const TRACKED_PROMOTE_LOCK_KEY = 872_014_002;

@Injectable()
export class LocationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreateLocation(
    input: LocationInput,
    options: FindOrCreateLocationOptions = {},
  ): Promise<LocationRow> {
    const latitude = roundCoordinate(input.latitude);
    const longitude = roundCoordinate(input.longitude);
    const row = await this.prisma.location.upsert({
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
        tracked: false,
      },
      // Preserve name/country/admin1 on coordinate match; never demote.
      update: {},
    });

    if (options.tracked === true) {
      return this.tryPromoteTracked(row.id, options.maxTracked ?? 100);
    }
    return row;
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

  /**
   * Promote a location to tracked if under the cap. Never demotes.
   * Uses a transaction advisory lock so concurrent promotes cannot exceed the cap.
   */
  async tryPromoteTracked(
    locationId: string,
    maxTracked: number,
  ): Promise<LocationRow> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TRACKED_PROMOTE_LOCK_KEY})`;
      const existing = await tx.location.findUniqueOrThrow({
        where: { id: locationId },
      });
      if (existing.tracked) {
        return existing;
      }
      const count = await tx.location.count({ where: { tracked: true } });
      if (count >= maxTracked) {
        return existing;
      }
      return tx.location.update({
        where: { id: locationId },
        data: { tracked: true },
      });
    });
  }
}
