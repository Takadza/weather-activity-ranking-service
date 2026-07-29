import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { MetricsModule } from './metrics/metrics.module';
import { OpenMeteoModule } from './open-meteo/open-meteo.module';
import { RefreshModule } from './refresh/refresh.module';
import { StoreModule } from './store/store.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    StoreModule,
    OpenMeteoModule,
    RefreshModule,
    MetricsModule,
  ],
})
export class AppWorkerModule {}
