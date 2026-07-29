import { NestFactory } from '@nestjs/core';
import { AppWorkerModule } from './app.worker.module';
import { JsonLogger, logLevelsFromEnv } from './logging/json-logger';

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
}
void bootstrap();
