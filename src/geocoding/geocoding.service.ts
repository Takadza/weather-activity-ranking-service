import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenMeteoClient } from '../open-meteo/client';
import { GeocodeCacheRepository } from '../store/geocode-cache.repository';
import { LocationsRepository } from '../store/locations.repository';
import {
  resolveLocationInput,
  type ResolveLocationInput,
  type ResolveLocationResult,
} from './resolve';

@Injectable()
export class GeocodingService {
  constructor(
    private readonly openMeteo: OpenMeteoClient,
    private readonly locations: LocationsRepository,
    private readonly geocodeCache: GeocodeCacheRepository,
    private readonly config: ConfigService,
  ) {}

  resolve(input: ResolveLocationInput): Promise<ResolveLocationResult> {
    const maxTracked = this.config.get<number>('maxTrackedLocations', 100);
    return resolveLocationInput(input, {
      geocode: (name) => this.openMeteo.geocode(name),
      findGeocodeCache: (queryNormalized) =>
        this.geocodeCache.findGeocodeCacheByQuery(queryNormalized),
      upsertGeocodeCache: (cacheInput) =>
        this.geocodeCache.upsertGeocodeCache(cacheInput),
      findOrCreateLocation: (locationInput, options) =>
        this.locations.findOrCreateLocation(locationInput, options),
      tryPromoteTracked: (locationId) =>
        this.locations.tryPromoteTracked(locationId, maxTracked),
      geocodeCacheTtlSeconds: this.config.get<number>(
        'geocodeCacheTtlSeconds',
        604_800,
      ),
    });
  }
}
