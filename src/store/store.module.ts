import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ForecastCache } from './forecast-cache';
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
  {
    provide: ForecastCache,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
      new ForecastCache(
        config.get<number>('forecastCacheTtlMs', 60_000),
        config.get<number>('forecastCacheMaxEntries', 256),
      ),
  },
];

@Module({
  imports: [ConfigModule],
  providers: STORE_PROVIDERS,
  exports: STORE_PROVIDERS,
})
export class StoreModule {}
