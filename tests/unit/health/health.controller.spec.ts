import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../../../src/health/health.controller';
import { HealthService } from '../../../src/health/health.service';

describe('HealthController GET /health', () => {
  let app: INestApplication;
  let getHealth: jest.Mock;

  beforeEach(async () => {
    getHealth = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { getHealth } }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with health JSON payload', async () => {
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

  it('returns 500 when the health service fails (e.g. DB unavailable)', async () => {
    getHealth.mockRejectedValue(new Error('DATABASE_URL is required'));

    await request(app.getHttpServer()).get('/health').expect(500);
  });
});
