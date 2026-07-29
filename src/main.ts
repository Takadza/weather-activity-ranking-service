import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { JsonLogger, logLevelsFromEnv } from './logging/json-logger';

async function bootstrap() {
  const logLevel = process.env.LOG_LEVEL ?? 'info';
  const logger =
    process.env.NODE_ENV === 'production'
      ? new JsonLogger({ logLevels: logLevelsFromEnv(logLevel) })
      : undefined;

  const app = await NestFactory.create(AppModule, {
    logger: logger ?? logLevelsFromEnv(logLevel),
  });
  app.enableShutdownHooks();
  const config = app.get(ConfigService);
  const port = config.get<number>('port', 3000);
  await app.listen(port);
}
void bootstrap();
