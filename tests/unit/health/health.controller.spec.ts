import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Server } from 'node:http';
import request from 'supertest';
import { HealthController } from '../../../src/health/health.controller';
import { HealthService } from '../../../src/health/health.service';

describe('HealthController', () => {
  let app: INestApplication<Server>;
  let getHealth: jest.Mock;

  beforeEach(async () => {
    getHealth = jest.fn();
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: { getHealth } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: string) => {
              if (key === 'metricsToken') return '';
              return defaultValue;
            },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health/live returns 200 without calling HealthService', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(getHealth).not.toHaveBeenCalled();
  });

  it('GET /health returns 200 with health JSON payload', async () => {
    const payload = {
      status: 'ok' as const,
      refresh: {
        lastSuccessAt: '2026-07-28T12:00:00.000Z',
        lastAttemptAt: '2026-07-28T12:00:00.000Z',
        lastError: null,
        trackedLocationCount: 2,
      },
    };
    getHealth.mockResolvedValue(payload);

    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toEqual(payload);
    expect(getHealth).toHaveBeenCalledTimes(1);
  });

  it('GET /health/ready returns 503 when degraded', async () => {
    getHealth.mockResolvedValue({
      status: 'degraded',
      refresh: {
        lastSuccessAt: null,
        lastAttemptAt: null,
        lastError: null,
        trackedLocationCount: 1,
      },
    });

    await request(app.getHttpServer()).get('/health/ready').expect(503);
  });

  it('GET /health returns 500 when the health service fails (e.g. DB unavailable)', async () => {
    getHealth.mockRejectedValue(new Error('DATABASE_URL is required'));

    await request(app.getHttpServer()).get('/health').expect(500);
  });

  it('GET /health/ready returns 503 unavailable when health service fails', async () => {
    getHealth.mockRejectedValue(new Error('connection refused'));

    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);

    expect(res.body).toEqual({ status: 'unavailable', refresh: null });
  });
});
