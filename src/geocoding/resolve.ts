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

export type ResolveLocationResult = {
  location: LocationRow;
  alternatives: LocationRow[];
};

export type ResolveLocationDeps = {
  geocode(name: string): Promise<GeocodeResult[]>;
  findGeocodeCache(queryNormalized: string): Promise<GeocodeCacheRow | null>;
  upsertGeocodeCache(input: GeocodeCacheInput): Promise<GeocodeCacheRow>;
  findOrCreateLocation(input: LocationInput): Promise<LocationRow>;
  now?: () => Date;
};

/** In-flight cache-miss resolves, keyed by normalized query (process-local). */
const inflightByQuery = new Map<string, Promise<ResolveLocationResult>>();

function isGeocodeResult(value: unknown): value is GeocodeResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    (typeof candidate.country === 'string' || candidate.country === null) &&
    (typeof candidate.admin1 === 'string' || candidate.admin1 === null) &&
    typeof candidate.latitude === 'number' &&
    Number.isFinite(candidate.latitude) &&
    typeof candidate.longitude === 'number' &&
    Number.isFinite(candidate.longitude)
  );
}

function candidatesFromCache(cache: GeocodeCacheRow): GeocodeResult[] {
  if (!Array.isArray(cache.resultsJson)) return [];
  return cache.resultsJson.filter(isGeocodeResult);
}

function invalidInput(
  message = 'A location name or both coordinates are required',
): BadUserInputError {
  return new BadUserInputError(message);
}

function assertNameLength(trimmedName: string): void {
  if (trimmedName.length > 100) {
    throw invalidInput('Location name must be at most 100 characters');
  }
}

function assertValidCoordinates(latitude: number, longitude: number): void {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw invalidInput('Coordinates must be finite lat/lon in valid ranges');
  }
}

async function mapCandidatesToLocations(
  candidates: GeocodeResult[],
  deps: ResolveLocationDeps,
): Promise<ResolveLocationResult> {
  if (candidates.length === 0) {
    throw invalidInput();
  }

  const locations = await Promise.all(
    candidates.map((candidate) => deps.findOrCreateLocation(candidate)),
  );

  return { location: locations[0], alternatives: locations.slice(1) };
}

async function resolveCacheMiss(
  trimmedName: string,
  queryNormalized: string,
  deps: ResolveLocationDeps,
): Promise<ResolveLocationResult> {
  const existing = inflightByQuery.get(queryNormalized);
  if (existing) {
    return existing;
  }

  const pending = (async (): Promise<ResolveLocationResult> => {
    // Another waiter may have populated the cache while we queued.
    const raced = await deps.findGeocodeCache(queryNormalized);
    if (raced) {
      return mapCandidatesToLocations(candidatesFromCache(raced), deps);
    }

    const candidates = await deps.geocode(trimmedName);
    const result = await mapCandidatesToLocations(candidates, deps);

    await deps.upsertGeocodeCache({
      queryNormalized,
      resultsJson: candidates,
      bestLocationId: result.location.id,
      fetchedAt: (deps.now ?? (() => new Date()))(),
    });

    return result;
  })().finally(() => {
    inflightByQuery.delete(queryNormalized);
  });

  inflightByQuery.set(queryNormalized, pending);
  return pending;
}

export async function resolveLocationInput(
  input: ResolveLocationInput,
  deps: ResolveLocationDeps,
): Promise<ResolveLocationResult> {
  const hasCoordinates = input.latitude != null && input.longitude != null;
  const trimmedName = input.name?.trim() ?? '';
  assertNameLength(trimmedName);

  if (hasCoordinates) {
    assertValidCoordinates(input.latitude!, input.longitude!);
    const location = await deps.findOrCreateLocation({
      name: trimmedName || `${input.latitude},${input.longitude}`,
      latitude: input.latitude!,
      longitude: input.longitude!,
    });
    return { location, alternatives: [] };
  }

  if (!trimmedName) {
    throw invalidInput();
  }

  const queryNormalized = trimmedName.toLowerCase();
  const cache = await deps.findGeocodeCache(queryNormalized);
  if (cache) {
    return mapCandidatesToLocations(candidatesFromCache(cache), deps);
  }

  return resolveCacheMiss(trimmedName, queryNormalized, deps);
}
