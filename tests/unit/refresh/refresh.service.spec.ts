import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RefreshService } from '../../../src/refresh/refresh.service';
import type { WeatherDay } from '../../../src/scoring/types';
import type { LocationRow } from '../../../src/store/types';

const day: WeatherDay = {
  date: '2026-07-29',
  tempMaxC: 20,
  tempMinC: 10,
  precipMm: 0,
  precipProbPct: 10,
  windMaxKmh: 15,
  snowfallCm: 0,
  waveHeightM: null,
  weatherCode: 1,
};

function location(id: string, lat: number, lon: number): LocationRow {
  return {
    id,
    name: id,
    country: null,
    admin1: null,
    latitude: lat,
    longitude: lon,
    tracked: true,
    createdAt: new Date('2026-07-29T00:00:00.000Z'),
    updatedAt: new Date('2026-07-29T00:00:00.000Z'),
  };
}

function makeService(
  overrides: {
    locations?: LocationRow[];
    fetchForecast?: jest.Mock;
    upsertForecastDays?: jest.Mock;
    recordRefreshSuccess?: jest.Mock;
    recordRefreshFailure?: jest.Mock;
    refreshConcurrency?: number;
    lockAcquired?: boolean;
  } = {},
) {
  const listTrackedLocations = jest
    .fn()
    .mockResolvedValue(overrides.locations ?? []);
  const fetchForecast =
    overrides.fetchForecast ?? jest.fn().mockResolvedValue([day]);
  const upsertForecastDays =
    overrides.upsertForecastDays ?? jest.fn().mockResolvedValue(undefined);
  const recordRefreshSuccess =
    overrides.recordRefreshSuccess ?? jest.fn().mockResolvedValue(undefined);
  const recordRefreshFailure =
    overrides.recordRefreshFailure ?? jest.fn().mockResolvedValue(undefined);
  const lockAcquired = overrides.lockAcquired !== false;
  const withAdvisoryLock = jest
    .fn()
    .mockImplementation(
      async (_key: number, work: () => Promise<void>): Promise<boolean> => {
        if (!lockAcquired) return false;
        await work();
        return true;
      },
    );

  const service = new RefreshService(
    { listTrackedLocations } as never,
    { upsertForecastDays } as never,
    { recordRefreshSuccess, recordRefreshFailure } as never,
    { fetchForecast } as never,
    {
      get: (key: string, defaultValue?: number) => {
        if (key === 'refreshConcurrency') {
          return overrides.refreshConcurrency ?? 5;
        }
        return defaultValue;
      },
    } as ConfigService,
    { withAdvisoryLock } as never,
    { increment: jest.fn() } as never,
  );

  return {
    service,
    listTrackedLocations,
    fetchForecast,
    upsertForecastDays,
    recordRefreshSuccess,
    recordRefreshFailure,
    withAdvisoryLock,
  };
}

describe('RefreshService.runCycle', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches and upserts each tracked location then records success', async () => {
    const a = location('loc-a', 1, 2);
    const b = location('loc-b', 3, 4);
    const {
      service,
      fetchForecast,
      upsertForecastDays,
      recordRefreshSuccess,
      recordRefreshFailure,
    } = makeService({ locations: [a, b] });

    await service.runCycle();

    expect(fetchForecast).toHaveBeenCalledWith(1, 2);
    expect(fetchForecast).toHaveBeenCalledWith(3, 4);
    expect(upsertForecastDays).toHaveBeenCalledWith('loc-a', [day]);
    expect(upsertForecastDays).toHaveBeenCalledWith('loc-b', [day]);
    expect(recordRefreshSuccess).toHaveBeenCalledTimes(1);
    expect(recordRefreshFailure).not.toHaveBeenCalled();
  });

  it('continues on partial failure, upserts successes, and records partial success', async () => {
    const a = location('loc-a', 1, 2);
    const b = location('loc-b', 3, 4);
    const fetchForecast = jest.fn().mockImplementation((lat: number) => {
      if (lat === 3) return Promise.reject(new Error('provider down'));
      return Promise.resolve([day]);
    });
    const {
      service,
      upsertForecastDays,
      recordRefreshSuccess,
      recordRefreshFailure,
    } = makeService({ locations: [a, b], fetchForecast });

    await service.runCycle();

    expect(upsertForecastDays).toHaveBeenCalledWith('loc-a', [day]);
    expect(upsertForecastDays).not.toHaveBeenCalledWith(
      'loc-b',
      expect.anything(),
    );
    expect(recordRefreshSuccess).toHaveBeenCalledTimes(1);
    expect(recordRefreshSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/loc-b/),
    );
    expect(recordRefreshFailure).not.toHaveBeenCalled();
  });

  it('skips the cycle when the leadership lock is not acquired', async () => {
    const a = location('loc-a', 1, 2);
    const { service, fetchForecast, recordRefreshSuccess } = makeService({
      locations: [a],
      lockAcquired: false,
    });

    await service.runCycle();

    expect(fetchForecast).not.toHaveBeenCalled();
    expect(recordRefreshSuccess).not.toHaveBeenCalled();
  });

  it('never exceeds configured refreshConcurrency for in-flight fetches', async () => {
    const locations = Array.from({ length: 6 }, (_, i) =>
      location(`loc-${i}`, i, i),
    );
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchForecast = jest.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight -= 1;
      return [day];
    });
    const { service } = makeService({
      locations,
      fetchForecast,
      refreshConcurrency: 2,
    });

    await service.runCycle();

    expect(fetchForecast).toHaveBeenCalledTimes(6);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('records success when there are no tracked locations', async () => {
    const {
      service,
      recordRefreshSuccess,
      recordRefreshFailure,
      fetchForecast,
    } = makeService({ locations: [] });

    await service.runCycle();

    expect(fetchForecast).not.toHaveBeenCalled();
    expect(recordRefreshSuccess).toHaveBeenCalledTimes(1);
    expect(recordRefreshFailure).not.toHaveBeenCalled();
  });

  it('falls back to default concurrency when config is non-finite', async () => {
    const locations = Array.from({ length: 3 }, (_, i) =>
      location(`loc-${i}`, i, i),
    );
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchForecast = jest.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
      return [day];
    });
    const { service } = makeService({
      locations,
      fetchForecast,
      refreshConcurrency: Number.NaN,
    });

    await service.runCycle();

    expect(fetchForecast).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBeGreaterThan(0);
    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  it('treats empty forecast payload as a location failure', async () => {
    const a = location('loc-a', 1, 2);
    const fetchForecast = jest.fn().mockResolvedValue([]);
    const {
      service,
      upsertForecastDays,
      recordRefreshSuccess,
      recordRefreshFailure,
    } = makeService({ locations: [a], fetchForecast });

    await service.runCycle();

    expect(upsertForecastDays).not.toHaveBeenCalled();
    expect(recordRefreshFailure).toHaveBeenCalledTimes(1);
    expect(recordRefreshFailure).toHaveBeenCalledWith(
      expect.stringMatching(/empty forecast/),
    );
    expect(recordRefreshSuccess).not.toHaveBeenCalled();
  });
});
