import { createServer, type Server } from 'http';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppWorkerModule } from './app.worker.module';
import { JsonLogger, logLevelsFromEnv } from './logging/json-logger';
import { MetricsService } from './metrics/metrics.service';

async function bootstrap() {
  const logLevel = process.env.LOG_LEVEL ?? 'info';
  const logger =
    process.env.NODE_ENV === 'production'
      ? new JsonLogger({ logLevels: logLevelsFromEnv(logLevel) })
      : logLevelsFromEnv(logLevel);

  const app = await NestFactory.createApplicationContext(AppWorkerModule, {
    logger,
  });
  app.enableShutdownHooks();

  const metrics = app.get(MetricsService);
  const config = app.get(ConfigService);
  const metricsPort = config.get<number>('workerMetricsPort', 3001);

  const server: Server = createServer((req, res) => {
    if (req.url === '/metrics' || req.url?.startsWith('/metrics?')) {
      res.writeHead(200, {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      });
      res.end(metrics.renderPrometheus());
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(metricsPort);
}
void bootstrap();
