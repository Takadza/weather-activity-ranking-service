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

@Injectable()
export class LocationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreateLocation(input: LocationInput): Promise<LocationRow> {
    return this.prisma.location.upsert({
      where: {
        latitude_longitude: {
          latitude: input.latitude,
          longitude: input.longitude,
        },
      },
      create: input,
      // Preserve the original name/country/admin1 on coordinate match.
      update: {},
    });
  }

  async listTrackedLocations(): Promise<LocationRow[]> {
    return this.prisma.location.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async countTrackedLocations(): Promise<number> {
    return this.prisma.location.count();
  }
}
