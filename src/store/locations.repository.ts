import { Injectable } from '@nestjs/common';
import type { Location } from '@prisma/client';
import { PrismaService } from './prisma.service';

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

  async findOrCreateLocation(input: LocationInput): Promise<Location> {
    return this.prisma.location.upsert({
      where: {
        latitude_longitude: {
          latitude: input.latitude,
          longitude: input.longitude,
        },
      },
      create: input,
      update: {},
    });
  }
}
