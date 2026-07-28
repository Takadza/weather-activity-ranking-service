import { Module } from '@nestjs/common';
import { ForecastsRepository } from './forecasts.repository';
import { GeocodeCacheRepository } from './geocode-cache.repository';
import { LocationsRepository } from './locations.repository';
import { PrismaService } from './prisma.service';
import { RefreshMetaRepository } from './refresh-meta.repository';

const STORE_PROVIDERS = [
  PrismaService,
  LocationsRepository,
  ForecastsRepository,
  GeocodeCacheRepository,
  RefreshMetaRepository,
];

@Module({
  providers: STORE_PROVIDERS,
  exports: STORE_PROVIDERS,
})
export class StoreModule {}
