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

const CONTRACT_LAT = 44.444444;
const CONTRACT_LON = -74.444444;
const CONTRACT_LAT_R = roundCoordinate(CONTRACT_LAT);

// Mirrors docs/contracts/examples.graphql — RankByName
const RANK_BY_NAME_QUERY = `
  query RankByName($location: LocationInput!) {
    activityRanking(location: $location) {
      location {
        id
        name
        country
        admin1
        latitude
        longitude
      }
      alternatives {
        name
        country
        admin1
        latitude
        longitude
      }
      rubricVersion
      lastUpdated
      dataAgeSeconds
      stale
      rankings {
        activity
        overallScore
        rank
        days {
          date
          score
          available
          reasonCodes
        }
      }
    }
  }
`;

// Mirrors docs/contracts/examples.graphql — HealthCheck
const HEALTH_CHECK_QUERY = `
  query HealthCheck {
    health {
      status
      refresh {
        lastSuccessAt
        lastAttemptAt
        lastError
        trackedLocationCount
      }
    }
  }
`;

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

describe('GraphQL contract (examples.graphql)', () => {
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
      where: { latitude: CONTRACT_LAT_R },
      select: { id: true },
    });
    for (const row of leftover) {
      forecastCache.invalidate(row.id);
    }
    await prisma.forecastDay.deleteMany({
      where: { location: { latitude: CONTRACT_LAT_R } },
    });
    await prisma.location.deleteMany({
      where: { latitude: CONTRACT_LAT_R },
    });
  });

  afterAll(async () => {
    await prisma.forecastDay.deleteMany({
      where: { location: { latitude: CONTRACT_LAT_R } },
    });
    await prisma.location.deleteMany({
      where: { latitude: CONTRACT_LAT_R },
    });
    await prisma.$disconnect();
    await app.close();
  });

  it('RankByName: warm path matches contract shape', async () => {
    const location = await locations.findOrCreateLocation({
      name: 'Contract Test City',
      latitude: CONTRACT_LAT,
      longitude: CONTRACT_LON,
    });
    await forecasts.upsertForecastDays(location.id, sevenDays());

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: RANK_BY_NAME_QUERY,
        variables: {
          location: { latitude: CONTRACT_LAT, longitude: CONTRACT_LON },
        },
      })
      .expect(200);

    const body = res.body as {
      errors?: unknown;
      data?: {
        activityRanking?: {
          location: Record<string, unknown>;
          alternatives: unknown[];
          rubricVersion: string;
          lastUpdated: string;
          dataAgeSeconds: number;
          stale: boolean;
          rankings: Array<{
            activity: string;
            overallScore: number | null;
            rank: number;
            days: unknown[];
          }>;
        };
      };
    };

    expect(body.errors).toBeUndefined();
    const payload = body.data?.activityRanking;
    expect(payload).toBeDefined();
    expect(payload!.location.id).toBeTruthy();
    expect(payload!.location.name).toBeTruthy();
    expect(typeof payload!.location.latitude).toBe('number');
    expect(typeof payload!.location.longitude).toBe('number');
    expect(Array.isArray(payload!.alternatives)).toBe(true);
    expect(payload!.rubricVersion).toBe('2026-07-28.1');
    expect(payload!.lastUpdated).toBeTruthy();
    expect(typeof payload!.dataAgeSeconds).toBe('number');
    expect(typeof payload!.stale).toBe('boolean');
    expect(payload!.rankings).toHaveLength(4);
    for (const ranking of payload!.rankings) {
      expect(ranking.activity).toBeTruthy();
      expect(typeof ranking.rank).toBe('number');
      expect(ranking.days).toHaveLength(7);
      for (const day of ranking.days as Array<Record<string, unknown>>) {
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof day.available).toBe('boolean');
        expect(Array.isArray(day.reasonCodes)).toBe(true);
      }
    }
    expect(openMeteo.fetchForecast).not.toHaveBeenCalled();
  });

  it('HealthCheck: returns contract health shape', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: HEALTH_CHECK_QUERY })
      .expect(200);

    const body = res.body as {
      errors?: unknown;
      data?: {
        health?: {
          status: string;
          refresh: {
            trackedLocationCount: number;
            lastSuccessAt: string | null;
            lastAttemptAt: string | null;
            lastError: string | null;
          };
        };
      };
    };

    expect(body.errors).toBeUndefined();
    const health = body.data?.health;
    expect(health).toBeDefined();
    expect(['ok', 'degraded']).toContain(health!.status);
    expect(typeof health!.refresh.trackedLocationCount).toBe('number');
    expect(
      health!.refresh.lastSuccessAt === null ||
        typeof health!.refresh.lastSuccessAt === 'string',
    ).toBe(true);
    expect(
      health!.refresh.lastAttemptAt === null ||
        typeof health!.refresh.lastAttemptAt === 'string',
    ).toBe(true);
    expect(health!.refresh.lastError).toBeNull();
  });
});
