import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { OpenMeteoClient } from '../../src/open-meteo/client';
import type { WeatherDay } from '../../src/scoring/types';
import { ForecastsRepository } from '../../src/store/forecasts.repository';
import { LocationsRepository } from '../../src/store/locations.repository';
import { PrismaService } from '../../src/store/prisma.service';

const WARM_LAT = 41.111111;
const WARM_LON = -71.111111;
const COLD_LAT = 42.222222;
const COLD_LON = -72.222222;
const FAIL_LAT = 43.333333;
const FAIL_LON = -73.333333;

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
  return Array.from({ length: 7 }, (_, i) => weatherDay(utcDateOffset(i), 10 + i));
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
  let app: INestApplication;
  let prisma: PrismaService;
  let locations: LocationsRepository;
  let forecasts: ForecastsRepository;
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
  });

  beforeEach(async () => {
    openMeteo.fetchForecast.mockReset();
    openMeteo.geocode.mockReset();
    await prisma.forecastDay.deleteMany({
      where: {
        location: {
          latitude: { in: [WARM_LAT, COLD_LAT, FAIL_LAT] },
        },
      },
    });
    await prisma.location.deleteMany({
      where: {
        latitude: { in: [WARM_LAT, COLD_LAT, FAIL_LAT] },
      },
    });
  });

  afterAll(async () => {
    await prisma.forecastDay.deleteMany({
      where: {
        location: {
          latitude: { in: [WARM_LAT, COLD_LAT, FAIL_LAT] },
        },
      },
    });
    await prisma.location.deleteMany({
      where: {
        latitude: { in: [WARM_LAT, COLD_LAT, FAIL_LAT] },
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

    expect(res.body.errors).toBeUndefined();
    const payload = res.body.data.activityRanking;
    expect(payload.rankings).toHaveLength(4);
    expect(payload.rubricVersion).toBe('2026-07-28.1');
    expect(payload.lastUpdated).toBeTruthy();
    expect(typeof payload.dataAgeSeconds).toBe('number');
    expect(typeof payload.stale).toBe('boolean');
    expect(payload.location.latitude).toBe(WARM_LAT);
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

    expect(res.body.errors).toBeUndefined();
    const payload = res.body.data.activityRanking;
    expect(payload.rankings).toHaveLength(4);
    expect(payload.rubricVersion).toBe('2026-07-28.1');
    expect(openMeteo.fetchForecast).toHaveBeenCalledTimes(1);
    expect(openMeteo.fetchForecast).toHaveBeenCalledWith(
      COLD_LAT,
      COLD_LON,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    const stored = await forecasts.getForecastDays(payload.location.id);
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

    expect(res.body.data).toBeNull();
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extensions: expect.objectContaining({
            code: 'PROVIDER_UNAVAILABLE',
          }),
        }),
      ]),
    );
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

    expect(res.body.data).toBeNull();
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extensions: expect.objectContaining({
            code: 'PROVIDER_UNAVAILABLE',
          }),
        }),
      ]),
    );
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

    expect(res.body.data).toBeNull();
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extensions: expect.objectContaining({
            code: 'BAD_USER_INPUT',
          }),
        }),
      ]),
    );
    expect(openMeteo.fetchForecast).not.toHaveBeenCalled();
    expect(openMeteo.geocode).not.toHaveBeenCalled();
  });
});
