import { createServer, type IncomingMessage, type Server } from 'http';
import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isMetricsAuthorized } from '../metrics/metrics-auth';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class WorkerHttpServer implements OnModuleInit, OnApplicationShutdown {
  /** Exposed for unit tests (ephemeral port discovery). */
  server: Server | undefined;

  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const metricsPort = this.config.get<number>('workerMetricsPort', 3001);
    const bindHost = this.config.get<string>('workerBindHost', '127.0.0.1');
    const metricsToken = this.config.get<string>('metricsToken', '');

    this.server = createServer((req, res) => {
      // Cleartext by design: bind loopback / private network and terminate TLS at the edge.
      this.handle(req, res, metricsToken);
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => reject(err);
      this.server!.once('error', onError);
      this.server!.listen(metricsPort, bindHost, () => {
        this.server!.off('error', onError);
        resolve();
      });
    });
  }

  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    this.server = undefined;
  }

  private handle(
    req: IncomingMessage,
    res: import('http').ServerResponse,
    metricsToken: string,
  ): void {
    const url = req.url ?? '';
    if (url === '/health/live' || url.startsWith('/health/live?')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (url === '/metrics' || url.startsWith('/metrics?')) {
      const authorized = isMetricsAuthorized(
        metricsToken,
        req.headers.authorization,
        typeof req.headers['x-metrics-token'] === 'string'
          ? req.headers['x-metrics-token']
          : undefined,
      );
      if (!authorized) {
        res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Unauthorized');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      });
      res.end(this.metrics.renderPrometheus());
      return;
    }

    res.writeHead(404);
    res.end();
  }
}
