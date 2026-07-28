import { ConfigService } from '@nestjs/config';
import { ActivityRankingService } from '../../../src/graphql/activity-ranking.service';
import type { WeatherDay } from '../../../src/scoring/types';
import type { LocationRow } from '../../../src/store/types';

const STALE_AFTER = 21600;

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

const location: LocationRow = {
  id: 'loc-1',
  name: 'Cape Town',
  country: 'ZA',
  admin1: null,
  latitude: -33.92,
  longitude: 18.42,
  createdAt: new Date('2026-07-29T00:00:00.000Z'),
  updatedAt: new Date('2026-07-29T00:00:00.000Z'),
};

function makeService(fetchedAt: Date, now: Date, staleAfterSeconds = STALE_AFTER) {
  jest.useFakeTimers({ now });

  const service = new ActivityRankingService(
    {
      resolve: jest.fn().mockResolvedValue({
        location,
        alternatives: [],
      }),
    } as never,
    {
      getForecastDays: jest.fn().mockResolvedValue([day]),
      getForecastMeta: jest.fn().mockResolvedValue({ fetchedAt }),
    } as never,
    { fetchForecast: jest.fn() } as never,
    {
      scoreAll: jest.fn().mockReturnValue([]),
    } as never,
    {
      get: (key: string, defaultValue?: number) => {
        if (key === 'staleAfterSeconds') {
          return staleAfterSeconds;
        }
        return defaultValue;
      },
    } as ConfigService,
  );

  return service;
}

describe('ActivityRankingService stale threshold', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('sets stale false when data age is at or below threshold', async () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const fetchedAt = new Date(now.getTime() - STALE_AFTER * 1000);
    const service = makeService(fetchedAt, now);

    const result = await service.rank({ name: 'Cape Town' });

    expect(result.dataAgeSeconds).toBe(STALE_AFTER);
    expect(result.stale).toBe(false);
    expect(result.lastUpdated).toEqual(fetchedAt);
  });

  it('sets stale true when data age exceeds threshold', async () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const fetchedAt = new Date(now.getTime() - (STALE_AFTER + 1) * 1000);
    const service = makeService(fetchedAt, now);

    const result = await service.rank({ name: 'Cape Town' });

    expect(result.dataAgeSeconds).toBe(STALE_AFTER + 1);
    expect(result.stale).toBe(true);
    expect(result.lastUpdated).toEqual(fetchedAt);
  });
});
