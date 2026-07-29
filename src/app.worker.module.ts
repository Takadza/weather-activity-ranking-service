import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { MetricsModule } from './metrics/metrics.module';
import { OpenMeteoModule } from './open-meteo/open-meteo.module';
import { RefreshModule } from './refresh/refresh.module';
import { StoreModule } from './store/store.module';
import { WorkerHttpServer } from './worker/worker-http.server';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      load: [configuration],
      validate: validateEnv,
    }),
    StoreModule,
    OpenMeteoModule,
    RefreshModule,
    MetricsModule,
  ],
  providers: [WorkerHttpServer],
})
export class AppWorkerModule {}
