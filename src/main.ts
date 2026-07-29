import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './common/request-id.middleware';
import { JsonLogger, logLevelsFromEnv } from './logging/json-logger';

async function bootstrap() {
  const logLevel = process.env.LOG_LEVEL ?? 'info';
  const logger =
    process.env.NODE_ENV === 'production'
      ? new JsonLogger({ logLevels: logLevelsFromEnv(logLevel) })
      : undefined;

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logger ?? logLevelsFromEnv(logLevel),
  });
  app.enableShutdownHooks();
  app.use(requestIdMiddleware);
  app.use(helmet());

  const config = app.get(ConfigService);
  const trustProxy = config.get<string>('trustProxy', '');
  if (trustProxy === 'true' || trustProxy === '1') {
    app.set('trust proxy', 1);
  } else if (/^\d+$/.test(trustProxy)) {
    app.set('trust proxy', parseInt(trustProxy, 10));
  }

  const allowedOrigins = config.get<string[]>('allowedOrigins', []);
  if (allowedOrigins.length > 0) {
    app.enableCors({
      origin: allowedOrigins,
      credentials: false,
    });
  }

  const port = config.get<number>('port', 3000);
  await app.listen(port);
}
void bootstrap();
