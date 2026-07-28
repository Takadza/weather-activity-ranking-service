import type { GeocodeResult } from '../open-meteo/types';
import type { GeocodeCacheInput } from '../store/geocode-cache.repository';
import type { LocationInput } from '../store/locations.repository';
import type { GeocodeCacheRow, LocationRow } from '../store/types';
import { BadUserInputError } from './errors';

export type ResolveLocationInput = {
  name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type ResolveLocationDeps = {
  geocode(name: string): Promise<GeocodeResult[]>;
  findGeocodeCache(queryNormalized: string): Promise<GeocodeCacheRow | null>;
  upsertGeocodeCache(input: GeocodeCacheInput): Promise<GeocodeCacheRow>;
  findOrCreateLocation(input: LocationInput): Promise<LocationRow>;
  now?: () => Date;
};

function isGeocodeResult(value: unknown): value is GeocodeResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    (typeof candidate.country === 'string' || candidate.country === null) &&
    (typeof candidate.admin1 === 'string' || candidate.admin1 === null) &&
    typeof candidate.latitude === 'number' &&
    typeof candidate.longitude === 'number'
  );
}

function candidatesFromCache(cache: GeocodeCacheRow): GeocodeResult[] {
  if (!Array.isArray(cache.resultsJson)) return [];
  return cache.resultsJson.filter(isGeocodeResult);
}

function invalidInput(): BadUserInputError {
  return new BadUserInputError(
    'A location name or both coordinates are required',
  );
}

export async function resolveLocationInput(
  input: ResolveLocationInput,
  deps: ResolveLocationDeps,
): Promise<{ location: LocationRow; alternatives: LocationRow[] }> {
  const hasCoordinates = input.latitude != null && input.longitude != null;
  const trimmedName = input.name?.trim() ?? '';

  if (hasCoordinates) {
    const location = await deps.findOrCreateLocation({
      name: trimmedName || `${input.latitude},${input.longitude}`,
      latitude: input.latitude!,
      longitude: input.longitude!,
    });
    return { location, alternatives: [] };
  }

  if (!trimmedName || trimmedName.length > 100) {
    throw invalidInput();
  }

  const queryNormalized = trimmedName.toLowerCase();
  const cache = await deps.findGeocodeCache(queryNormalized);
  const candidates = cache
    ? candidatesFromCache(cache)
    : await deps.geocode(trimmedName);

  if (candidates.length === 0) {
    throw invalidInput();
  }

  const locations = await Promise.all(
    candidates.map((candidate) => deps.findOrCreateLocation(candidate)),
  );

  if (!cache) {
    await deps.upsertGeocodeCache({
      queryNormalized,
      resultsJson: candidates,
      bestLocationId: locations[0].id,
      fetchedAt: (deps.now ?? (() => new Date()))(),
    });
  }

  return { location: locations[0], alternatives: locations.slice(1) };
}
