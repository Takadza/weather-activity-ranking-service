import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { MetricsService } from '../../../src/metrics/metrics.service';
import { WorkerHttpServer } from '../../../src/worker/worker-http.server';

describe('WorkerHttpServer', () => {
  let workerHttp: WorkerHttpServer;
  let metrics: MetricsService;

  beforeEach(async () => {
    metrics = new MetricsService();
    metrics.increment('refresh_cycles_total');
    const config = {
      get: (key: string, defaultValue?: unknown) => {
        if (key === 'workerMetricsPort') return 0; // ephemeral
        if (key === 'metricsToken') return 'worker-secret';
        return defaultValue;
      },
    } as ConfigService;

    workerHttp = new WorkerHttpServer(metrics, config);
    await workerHttp.onModuleInit();
  });

  afterEach(async () => {
    await workerHttp.onApplicationShutdown();
  });

  function serverAddress(): string {
    const server = workerHttp.server;
    if (!server) throw new Error('server not listening');
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('expected TCP address');
    }
    return `http://127.0.0.1:${addr.port}`;
  }

  it('serves /health/live', async () => {
    const res = await request(serverAddress()).get('/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('protects /metrics when token configured', async () => {
    await request(serverAddress()).get('/metrics').expect(401);
    const res = await request(serverAddress())
      .get('/metrics')
      .set('X-Metrics-Token', 'worker-secret')
      .expect(200);
    expect(res.text).toContain('refresh_cycles_total');
  });

  it('closes the listening server on application shutdown', async () => {
    const server = workerHttp.server;
    expect(server).toBeDefined();
    const addr = server!.address();
    expect(addr).toBeTruthy();
    expect(typeof addr).not.toBe('string');
    const port = (addr as { port: number }).port;

    await workerHttp.onApplicationShutdown();

    expect(workerHttp.server).toBeUndefined();
    expect(server!.address()).toBeNull();

    await expect(
      request(`http://127.0.0.1:${port}`).get('/health/live'),
    ).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });
});
