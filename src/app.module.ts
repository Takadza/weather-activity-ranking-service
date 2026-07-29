import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { GqlThrottlerGuard } from './common/gql-throttler.guard';
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
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // GraphQL responses are not always a full Express res; avoid header writes.
        setHeaders: false,
        throttlers: [
          {
            ttl: config.get<number>('throttleTtlMs', 60_000),
            limit: config.get<number>('throttleLimit', 60),
          },
        ],
      }),
    }),
    StoreModule,
    ScoringModule,
    OpenMeteoModule,
    GeocodingModule,
    AppGraphqlModule,
    HealthModule,
    MetricsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
  ],
})
export class AppModule {}
