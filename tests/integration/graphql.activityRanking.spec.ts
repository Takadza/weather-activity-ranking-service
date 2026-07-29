import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { OpenMeteoClient } from '../../src/open-meteo/client';
import type { WeatherDay } from '../../src/scoring/types';
import { ForecastCache } from '../../src/store/forecast-cache';
import { ForecastsRepository } from '../../src/store/forecasts.repository';
import {
  LocationsRepository,
  roundCoordinate,
} from '../../src/store/locations.repository';
import { PrismaService } from '../../src/store/prisma.service';

const WARM_LAT = 41.111111;
const WARM_LON = -71.111111;
const COLD_LAT = 42.222222;
const COLD_LON = -72.222222;
const FAIL_LAT = 43.333333;
const FAIL_LON = -73.333333;
const WARM_LAT_R = roundCoordinate(WARM_LAT);
const COLD_LAT_R = roundCoordinate(COLD_LAT);
const FAIL_LAT_R = roundCoordinate(FAIL_LAT);
const TEST_LATS = [WARM_LAT_R, COLD_LAT_R, FAIL_LAT_R];

type GraphqlBody<T> = {
  errors?: unknown;
  data?: T | null;
};

type GraphqlError = {
  extensions?: { code?: string };
};

type ActivityRankingData = {
  activityRanking: {
    location: {
      id: string;
      name: string;
      latitude: number;
      longitude: number;
    };
    alternatives: { id: string }[];
    rankings: unknown[];
    rubricVersion: string;
    lastUpdated: string;
    dataAgeSeconds: number;
    stale: boolean;
  };
};

function expectGraphqlErrorCode(
  body: GraphqlBody<ActivityRankingData>,
  code: string,
): void {
  expect(body.data).toBeNull();
  const errors = body.errors as GraphqlError[] | undefined;
  expect(errors?.map((error) => error.extensions?.code)).toContain(code);
}

function weatherDay(date: string, tempMaxC: number): WeatherDay {
  return {
    date,
    tempMaxC,
    tempMinC: 2,
    precipMm: 1,
    precipProbPct: 20,
    windMaxKmh: 15,
    snowfallCm: 0,
    waveHeightM: 1.2,
    weatherCode: 2,
  };
}

function utcDateOffset(daysFromToday: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

function sevenDays(): WeatherDay[] {
  return Array.from({ length: 7 }, (_, i) =>
    weatherDay(utcDateOffset(i), 10 + i),
  );
}

const RANKING_QUERY = `
  query($location: LocationInput!) {
    activityRanking(location: $location) {
      location { id name latitude longitude }
      alternatives { id }
      rankings { activity overallScore rank }
      rubricVersion
      lastUpdated
      dataAgeSeconds
      stale
    }
  }
`;

describe('GraphQL activityRanking', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let locations: LocationsRepository;
  let forecasts: ForecastsRepository;
  let forecastCache: ForecastCache;
  const openMeteo = {
    fetchForecast: jest.fn(),
    geocode: jest.fn(),
  };

  beforeAll(async () => {
    process.env.DATABASE_URL ??=
      'postgresql://wars:wars@localhost:5432/wars?schema=public';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OpenMeteoClient)
      .useValue(openMeteo)
      .compile();

    app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.init();

    prisma = moduleRef.get(PrismaService);
    locations = moduleRef.get(LocationsRepository);
    forecasts = moduleRef.get(ForecastsRepository);
    forecastCache = moduleRef.get(ForecastCache);
  });

  beforeEach(async () => {
    openMeteo.fetchForecast.mockReset();
    openMeteo.geocode.mockReset();
    const leftover = await prisma.location.findMany({
      where: { latitude: { in: TEST_LATS } },
      select: { id: true },
    });
    for (const row of leftover) {
      forecastCache.invalidate(row.id);
    }
    await prisma.forecastDay.deleteMany({
      where: {
        location: {
          latitude: { in: TEST_LATS },
        },
      },
    });
    await prisma.location.deleteMany({
      where: {
        latitude: { in: TEST_LATS },
      },
    });
  });

  afterAll(async () => {
    await prisma.forecastDay.deleteMany({
      where: {
        location: {
          latitude: { in: TEST_LATS },
        },
      },
    });
    await prisma.location.deleteMany({
      where: {
        latitude: { in: TEST_LATS },
      },
    });
    await app.close();
  });

  it('warm path: returns rankings without calling Open-Meteo', async () => {
    const location = await locations.findOrCreateLocation({
      name: 'Warm Path City',
      latitude: WARM_LAT,
      longitude: WARM_LON,
    });
    await forecasts.upsertForecastDays(location.id, sevenDays());

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: RANKING_QUERY,
        variables: {
          location: { latitude: WARM_LAT, longitude: WARM_LON },
        },
      })
      .expect(200);

    const body = res.body as GraphqlBody<ActivityRankingData>;
    expect(body.errors).toBeUndefined();
    const payload = body.data?.activityRanking;
    expect(payload).toBeDefined();
    expect(payload!.rankings).toHaveLength(4);
    expect(payload!.rubricVersion).toBe('2026-07-28.1');
    expect(payload!.lastUpdated).toBeTruthy();
    expect(typeof payload!.dataAgeSeconds).toBe('number');
    expect(typeof payload!.stale).toBe('boolean');
    expect(payload!.location.latitude).toBe(roundCoordinate(WARM_LAT));
    expect(openMeteo.fetchForecast).not.toHaveBeenCalled();
    expect(openMeteo.geocode).not.toHaveBeenCalled();
  });

  it('cold-start: fetches Open-Meteo when forecasts are empty', async () => {
    openMeteo.fetchForecast.mockResolvedValue(sevenDays());

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: RANKING_QUERY,
        variables: {
          location: { latitude: COLD_LAT, longitude: COLD_LON },
        },
      })
      .expect(200);

    const body = res.body as GraphqlBody<ActivityRankingData>;
    expect(body.errors).toBeUndefined();
    const payload = body.data?.activityRanking;
    expect(payload).toBeDefined();
    expect(payload!.rankings).toHaveLength(4);
    expect(payload!.rubricVersion).toBe('2026-07-28.1');
    expect(openMeteo.fetchForecast).toHaveBeenCalledTimes(1);
    const fetchCall = openMeteo.fetchForecast.mock.calls[0] as [
      number,
      number,
      { signal: AbortSignal },
    ];
    expect(fetchCall[0]).toBe(roundCoordinate(COLD_LAT));
    expect(fetchCall[1]).toBe(roundCoordinate(COLD_LON));
    expect(fetchCall[2].signal).toBeInstanceOf(AbortSignal);

    const stored = await forecasts.getForecastDays(payload!.location.id);
    expect(stored).toHaveLength(7);
  });

  it('cold-start failure: returns PROVIDER_UNAVAILABLE when fetch fails', async () => {
    openMeteo.fetchForecast.mockRejectedValue(new Error('provider down'));

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: RANKING_QUERY,
        variables: {
          location: { latitude: FAIL_LAT, longitude: FAIL_LON },
        },
      })
      .expect(200);

    const body = res.body as GraphqlBody<ActivityRankingData>;
    expectGraphqlErrorCode(body, 'PROVIDER_UNAVAILABLE');
    expect(openMeteo.fetchForecast).toHaveBeenCalledTimes(1);
  });

  it('cold-start empty payload: returns PROVIDER_UNAVAILABLE', async () => {
    openMeteo.fetchForecast.mockResolvedValue([]);

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: RANKING_QUERY,
        variables: {
          location: { latitude: FAIL_LAT, longitude: FAIL_LON },
        },
      })
      .expect(200);

    const body = res.body as GraphqlBody<ActivityRankingData>;
    expectGraphqlErrorCode(body, 'PROVIDER_UNAVAILABLE');
    expect(openMeteo.fetchForecast).toHaveBeenCalledTimes(1);
  });

  it('invalid input: returns BAD_USER_INPUT when location is empty', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: RANKING_QUERY,
        variables: { location: {} },
      })
      .expect(200);

    const body = res.body as GraphqlBody<ActivityRankingData>;
    expectGraphqlErrorCode(body, 'BAD_USER_INPUT');
    expect(openMeteo.fetchForecast).not.toHaveBeenCalled();
    expect(openMeteo.geocode).not.toHaveBeenCalled();
  });
});
