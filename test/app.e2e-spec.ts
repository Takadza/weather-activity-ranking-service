import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { requestIdMiddleware } from '../src/common/request-id.middleware';
import { OpenMeteoClient } from '../src/open-meteo/client';

async function createApp(opts?: {
  enableCorsFromConfig?: boolean;
}): Promise<INestApplication<Server>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(OpenMeteoClient)
    .useValue({
      fetchForecast: jest.fn().mockResolvedValue([]),
      geocode: jest.fn().mockResolvedValue([]),
    })
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.useLogger(false);

  if (opts?.enableCorsFromConfig) {
    const allowedOrigins = app
      .get(ConfigService)
      .get<string[]>('allowedOrigins', []);
    if (allowedOrigins.length > 0) {
      app.enableCors({ origin: allowedOrigins, credentials: false });
    }
  }

  await app.init();
  return app;
}

describe('App e2e smoke (mocked provider)', () => {
  let app: INestApplication<Server> | undefined;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_KEY = '';
    process.env.METRICS_TOKEN = '';
    process.env.REDIS_URL = '';
    process.env.THROTTLE_TTL_MS = '60000';
    process.env.THROTTLE_LIMIT = '60';
    process.env.ALLOWED_ORIGINS = '';

    app = await createApp();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /health/live', async () => {
    const res = await request(app!.getHttpServer())
      .get('/health/live')
      .expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('sets Helmet security headers on /health/live', async () => {
    const res = await request(app!.getHttpServer())
      .get('/health/live')
      .expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('echoes x-request-id', async () => {
    const res = await request(app!.getHttpServer())
      .get('/health/live')
      .set('x-request-id', 'e2e-req-1')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('e2e-req-1');
  });

  it('GET /metrics', async () => {
    const res = await request(app!.getHttpServer()).get('/metrics').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('GraphQL health query', async () => {
    const res = await request(app!.getHttpServer())
      .post('/graphql')
      .send({ query: '{ health { status refresh { trackedLocationCount } } }' })
      .expect(200);

    const body = res.body as {
      errors?: unknown;
      data?: { health?: { status?: string } };
    };
    expect(body.errors).toBeUndefined();
    expect(body.data?.health?.status).toMatch(/ok|degraded/);
  });
});

describe('App e2e API key + metrics token + throttle', () => {
  let app: INestApplication<Server> | undefined;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_KEY = 'e2e-api-key';
    process.env.METRICS_TOKEN = 'e2e-metrics-secret';
    process.env.REDIS_URL = '';
    process.env.THROTTLE_TTL_MS = '60000';
    process.env.THROTTLE_LIMIT = '3';
    process.env.ALLOWED_ORIGINS = '';

    app = await createApp();
  });

  afterAll(async () => {
    if (app) await app.close();
    delete process.env.API_KEY;
    delete process.env.METRICS_TOKEN;
    process.env.THROTTLE_LIMIT = '60';
  });

  it('rejects GraphQL without API key', async () => {
    const res = await request(app!.getHttpServer())
      .post('/graphql')
      .send({ query: '{ health { status } }' });

    // Nest may map UnauthorizedException to HTTP 401 or GraphQL errors (HTTP 200).
    if (res.status === 401) {
      const body = res.body as { message?: string };
      expect(body.message).toMatch(/api key/i);
      return;
    }

    expect(res.status).toBe(200);
    const body = res.body as {
      data?: unknown;
      errors?: Array<{ message?: string; extensions?: { code?: string } }>;
    };
    expect(body.data).toBeNull();
    expect(body.errors?.length).toBeGreaterThan(0);
    const combined = JSON.stringify(body.errors);
    expect(combined).toMatch(/api key|Unauthorized|UNAUTHENTICATED/i);
  });

  it('accepts GraphQL with X-API-Key', async () => {
    const res = await request(app!.getHttpServer())
      .post('/graphql')
      .set('X-API-Key', 'e2e-api-key')
      .send({
        query:
          '{ health { status refresh { trackedLocationCount lastError } } }',
      })
      .expect(200);
    const body = res.body as {
      errors?: unknown;
      data?: { health?: { refresh?: { lastError: string | null } } };
    };
    expect(body.errors).toBeUndefined();
    // Without metrics token, lastError is redacted.
    expect(body.data?.health?.refresh?.lastError).toBeNull();
  });

  it('GET /health/live remains public', async () => {
    await request(app!.getHttpServer()).get('/health/live').expect(200);
  });

  it('GET /metrics requires token when METRICS_TOKEN is set', async () => {
    await request(app!.getHttpServer()).get('/metrics').expect(401);
    await request(app!.getHttpServer())
      .get('/metrics')
      .set('Authorization', 'Bearer e2e-metrics-secret')
      .expect(200);
  });

  it('returns Too Many Requests when GraphQL throttle limit is exceeded', async () => {
    const query = {
      query: '{ health { status refresh { trackedLocationCount } } }',
    };
    for (let i = 0; i < 3; i++) {
      await request(app!.getHttpServer())
        .post('/graphql')
        .set('X-API-Key', 'e2e-api-key')
        .send(query);
    }
    const res = await request(app!.getHttpServer())
      .post('/graphql')
      .set('X-API-Key', 'e2e-api-key')
      .send(query);
    const body = res.body as { errors?: Array<{ message?: string }> };
    expect(body.errors?.[0]?.message).toMatch(/Too Many Requests/i);
  });
});

describe('App e2e CORS', () => {
  let app: INestApplication<Server> | undefined;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_KEY = '';
    process.env.METRICS_TOKEN = '';
    process.env.THROTTLE_LIMIT = '60';
    process.env.ALLOWED_ORIGINS = 'https://example.com';

    app = await createApp({ enableCorsFromConfig: true });
  });

  afterAll(async () => {
    if (app) await app.close();
    process.env.ALLOWED_ORIGINS = '';
  });

  it('reflects configured Allow-Origin', async () => {
    const res = await request(app!.getHttpServer())
      .get('/health/live')
      .set('Origin', 'https://example.com')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://example.com',
    );
  });

  it('does not allow unlisted origins', async () => {
    const res = await request(app!.getHttpServer())
      .get('/health/live')
      .set('Origin', 'https://evil.example')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
