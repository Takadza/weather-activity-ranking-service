import { Injectable } from '@nestjs/common';
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
  ) {}

  resolve(input: ResolveLocationInput): Promise<ResolveLocationResult> {
    return resolveLocationInput(input, {
      geocode: (name) => this.openMeteo.geocode(name),
      findGeocodeCache: (queryNormalized) =>
        this.geocodeCache.findGeocodeCacheByQuery(queryNormalized),
      upsertGeocodeCache: (cacheInput) =>
        this.geocodeCache.upsertGeocodeCache(cacheInput),
      findOrCreateLocation: (locationInput) =>
        this.locations.findOrCreateLocation(locationInput),
    });
  }
}
