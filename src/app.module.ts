import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { GeocodingModule } from './geocoding/geocoding.module';
import { AppGraphqlModule } from './graphql/graphql.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { OpenMeteoModule } from './open-meteo/open-meteo.module';
import { ScoringModule } from './scoring/scoring.module';
import { StoreModule } from './store/store.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    StoreModule,
    ScoringModule,
    OpenMeteoModule,
    GeocodingModule,
    AppGraphqlModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}
