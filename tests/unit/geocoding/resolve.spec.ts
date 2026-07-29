import { BadUserInputError } from '../../../src/geocoding/errors';
import { resolveLocationInput } from '../../../src/geocoding/resolve';
import type { GeocodeResult } from '../../../src/open-meteo/types';
import type { GeocodeCacheRow, LocationRow } from '../../../src/store/types';

const now = new Date('2026-07-29T00:00:00.000Z');

const paris: GeocodeResult = {
  name: 'Paris',
  country: 'France',
  admin1: 'Île-de-France',
  latitude: 48.8566,
  longitude: 2.3522,
};

const parisTexas: GeocodeResult = {
  name: 'Paris',
  country: 'United States',
  admin1: 'Texas',
  latitude: 33.6609,
  longitude: -95.5555,
};

function locationFor(candidate: GeocodeResult, tracked = false): LocationRow {
  return {
    id: `${candidate.latitude},${candidate.longitude}`,
    ...candidate,
    tracked,
    createdAt: now,
    updatedAt: now,
  };
}

function cacheRow(resultsJson: unknown): GeocodeCacheRow {
  return {
    id: 'cache-1',
    queryNormalized: 'paris',
    resultsJson,
    bestLocationId: null,
    fetchedAt: now,
  };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const tryPromoteTracked = jest
    .fn<Promise<LocationRow>, [string]>()
    .mockImplementation((id: string) =>
      Promise.resolve({
        id,
        name: 'promoted',
        country: null,
        admin1: null,
        latitude: 0,
        longitude: 0,
        tracked: true,
        createdAt: now,
        updatedAt: now,
      }),
    );

  return {
    geocode: jest.fn<Promise<GeocodeResult[]>, [string]>(),
    findGeocodeCache: jest.fn<Promise<GeocodeCacheRow | null>, [string]>(),
    upsertGeocodeCache: jest.fn<Promise<GeocodeCacheRow>, [unknown]>(),
    findOrCreateLocation: jest.fn<Promise<LocationRow>, [GeocodeResult]>(),
    tryPromoteTracked,
    now: () => now,
    ...overrides,
  };
}

describe('resolveLocationInput', () => {
  it('uses coordinates when they are supplied, even with a name, without tracking', async () => {
    const location = locationFor(
      {
        name: 'Given',
        country: null,
        admin1: null,
        latitude: 1,
        longitude: 2,
      },
      false,
    );
    const deps = makeDeps({
      findOrCreateLocation: jest.fn().mockResolvedValue(location),
    });

    await expect(
      resolveLocationInput({ name: 'Paris', latitude: 1, longitude: 2 }, deps),
    ).resolves.toEqual({ location, alternatives: [] });
    expect(deps.findOrCreateLocation).toHaveBeenCalledWith(
      {
        name: 'Paris',
        latitude: 1,
        longitude: 2,
      },
      { tracked: false },
    );
    expect(deps.tryPromoteTracked).not.toHaveBeenCalled();
    expect(deps.geocode).not.toHaveBeenCalled();
    expect(deps.findGeocodeCache).not.toHaveBeenCalled();
    expect(deps.upsertGeocodeCache).not.toHaveBeenCalled();
  });

  it('labels coordinate-only locations with their coordinates and does not track', async () => {
    const location = locationFor(
      {
        name: '1,2',
        country: null,
        admin1: null,
        latitude: 1,
        longitude: 2,
      },
      false,
    );
    const deps = makeDeps({
      findOrCreateLocation: jest.fn().mockResolvedValue(location),
    });

    await expect(
      resolveLocationInput({ latitude: 1, longitude: 2 }, deps),
    ).resolves.toEqual({ location, alternatives: [] });
    expect(deps.findOrCreateLocation).toHaveBeenCalledWith(
      {
        name: '1,2',
        latitude: 1,
        longitude: 2,
      },
      { tracked: false },
    );
    expect(deps.tryPromoteTracked).not.toHaveBeenCalled();
  });

  it('uses normalized cache candidates and promotes only the primary', async () => {
    const parisLocation = locationFor(paris, false);
    const texasLocation = locationFor(parisTexas, false);
    const promoted = { ...parisLocation, tracked: true };
    const deps = makeDeps({
      findGeocodeCache: jest
        .fn()
        .mockResolvedValue(cacheRow([paris, parisTexas])),
      findOrCreateLocation: jest
        .fn()
        .mockResolvedValueOnce(parisLocation)
        .mockResolvedValueOnce(texasLocation),
      tryPromoteTracked: jest.fn().mockResolvedValue(promoted),
    });

    await expect(
      resolveLocationInput({ name: ' Paris ' }, deps),
    ).resolves.toEqual({
      location: promoted,
      alternatives: [texasLocation],
    });
    expect(deps.findGeocodeCache).toHaveBeenCalledWith('paris');
    expect(deps.findOrCreateLocation).toHaveBeenNthCalledWith(1, paris, {
      tracked: false,
    });
    expect(deps.findOrCreateLocation).toHaveBeenNthCalledWith(2, parisTexas, {
      tracked: false,
    });
    expect(deps.tryPromoteTracked).toHaveBeenCalledWith(parisLocation.id);
    expect(deps.geocode).not.toHaveBeenCalled();
    expect(deps.upsertGeocodeCache).not.toHaveBeenCalled();
  });

  it('geocodes a cache miss, persists candidates, and promotes primary', async () => {
    const parisLocation = locationFor(paris, false);
    const texasLocation = locationFor(parisTexas, false);
    const promoted = { ...parisLocation, tracked: true };
    const deps = makeDeps({
      findGeocodeCache: jest.fn().mockResolvedValue(null),
      geocode: jest.fn().mockResolvedValue([paris, parisTexas]),
      upsertGeocodeCache: jest
        .fn()
        .mockResolvedValue(cacheRow([paris, parisTexas])),
      findOrCreateLocation: jest
        .fn()
        .mockResolvedValueOnce(parisLocation)
        .mockResolvedValueOnce(texasLocation),
      tryPromoteTracked: jest.fn().mockResolvedValue(promoted),
    });

    await expect(
      resolveLocationInput({ name: ' PARIS ' }, deps),
    ).resolves.toEqual({
      location: promoted,
      alternatives: [texasLocation],
    });
    expect(deps.geocode).toHaveBeenCalledWith('PARIS');
    expect(deps.findOrCreateLocation).toHaveBeenNthCalledWith(1, paris, {
      tracked: false,
    });
    expect(deps.findOrCreateLocation).toHaveBeenNthCalledWith(2, parisTexas, {
      tracked: false,
    });
    expect(deps.tryPromoteTracked).toHaveBeenCalledWith(parisLocation.id);
    expect(deps.upsertGeocodeCache).toHaveBeenCalledWith({
      queryNormalized: 'paris',
      resultsJson: [paris, parisTexas],
      bestLocationId: promoted.id,
      fetchedAt: now,
    });
  });

  it('keeps primary untracked when tryPromoteTracked does not promote (over cap)', async () => {
    const parisLocation = locationFor(paris, false);
    const deps = makeDeps({
      findGeocodeCache: jest.fn().mockResolvedValue(cacheRow([paris])),
      findOrCreateLocation: jest.fn().mockResolvedValue(parisLocation),
      tryPromoteTracked: jest.fn().mockResolvedValue(parisLocation),
    });

    await expect(
      resolveLocationInput({ name: 'Paris' }, deps),
    ).resolves.toEqual({ location: parisLocation, alternatives: [] });
    expect(parisLocation.tracked).toBe(false);
  });

  it.each([
    ['missing input', {}],
    ['partial coordinates without a name', { latitude: 1 }],
    ['blank name', { name: '   ' }],
    ['name longer than 100 trimmed characters', { name: 'x'.repeat(101) }],
    [
      'overlong name with coordinates',
      { name: 'x'.repeat(101), latitude: 1, longitude: 2 },
    ],
    ['NaN latitude', { latitude: Number.NaN, longitude: 2 }],
    ['NaN longitude', { latitude: 1, longitude: Number.NaN }],
    ['latitude out of range', { latitude: 91, longitude: 0 }],
    ['longitude out of range', { latitude: 0, longitude: 181 }],
  ])('throws BadUserInputError for %s', async (_description, input) => {
    await expect(
      resolveLocationInput(input, makeDeps()),
    ).rejects.toBeInstanceOf(BadUserInputError);
  });

  it.each([
    ['empty cache candidates', cacheRow([])],
    ['empty geocode results', null],
    ['malformed cache candidates', cacheRow([{ name: 'Paris' }, 'nope'])],
  ])('throws BadUserInputError for %s', async (_description, cache) => {
    const deps = makeDeps({
      findGeocodeCache: jest.fn().mockResolvedValue(cache),
      geocode: jest.fn().mockResolvedValue([]),
    });

    await expect(
      resolveLocationInput({ name: 'Paris' }, deps),
    ).rejects.toBeInstanceOf(BadUserInputError);
  });

  it('treats expired geocode cache as a miss', async () => {
    const parisLocation = locationFor(paris, false);
    const promoted = { ...parisLocation, tracked: true };
    const staleFetchedAt = new Date('2026-01-01T00:00:00.000Z');
    const deps = makeDeps({
      findGeocodeCache: jest.fn().mockResolvedValue({
        ...cacheRow([paris]),
        fetchedAt: staleFetchedAt,
      }),
      geocode: jest.fn().mockResolvedValue([paris]),
      upsertGeocodeCache: jest.fn().mockResolvedValue(cacheRow([paris])),
      findOrCreateLocation: jest.fn().mockResolvedValue(parisLocation),
      tryPromoteTracked: jest.fn().mockResolvedValue(promoted),
      geocodeCacheTtlSeconds: 3600,
      now: () => now,
    });

    await resolveLocationInput({ name: 'Paris' }, deps);

    expect(deps.geocode).toHaveBeenCalledWith('Paris');
  });

  it('coalesces concurrent cache misses into one geocode call', async () => {
    const parisLocation = locationFor(paris, false);
    const promoted = { ...parisLocation, tracked: true };
    let releaseGeocode!: (results: GeocodeResult[]) => void;
    const geocodeGate = new Promise<GeocodeResult[]>((resolve) => {
      releaseGeocode = resolve;
    });
    const deps = makeDeps({
      findGeocodeCache: jest.fn().mockResolvedValue(null),
      geocode: jest.fn().mockReturnValue(geocodeGate),
      upsertGeocodeCache: jest.fn().mockResolvedValue(cacheRow([paris])),
      findOrCreateLocation: jest.fn().mockResolvedValue(parisLocation),
      tryPromoteTracked: jest.fn().mockResolvedValue(promoted),
    });

    const first = resolveLocationInput({ name: 'Paris' }, deps);
    const second = resolveLocationInput({ name: 'Paris' }, deps);

    await new Promise<void>((resolve) => {
      const check = () => {
        if (deps.geocode.mock.calls.length > 0) {
          resolve();
          return;
        }
        setImmediate(check);
      };
      check();
    });

    expect(deps.geocode).toHaveBeenCalledTimes(1);
    releaseGeocode([paris]);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { location: promoted, alternatives: [] },
      { location: promoted, alternatives: [] },
    ]);
    expect(deps.geocode).toHaveBeenCalledTimes(1);
    expect(deps.upsertGeocodeCache).toHaveBeenCalledTimes(1);
  });
});
