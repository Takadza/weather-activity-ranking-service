import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { OpenMeteoClient } from '../src/open-meteo/client';

describe('App e2e smoke (mocked provider)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL ??=
      'postgresql://wars:wars@localhost:5432/wars?schema=public';
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OpenMeteoClient)
      .useValue({
        fetchForecast: jest.fn().mockResolvedValue([]),
        geocode: jest.fn().mockResolvedValue([]),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /metrics', async () => {
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('GraphQL health query', async () => {
    const res = await request(app.getHttpServer())
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
