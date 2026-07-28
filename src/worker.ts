import { NestFactory } from '@nestjs/core';
import { AppWorkerModule } from './app.worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppWorkerModule);
  app.enableShutdownHooks();
}
void bootstrap();
