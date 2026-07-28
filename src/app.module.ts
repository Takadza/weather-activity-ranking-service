import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { GeocodingModule } from './geocoding/geocoding.module';
import { AppGraphqlModule } from './graphql/graphql.module';
import { HealthModule } from './health/health.module';
import { OpenMeteoModule } from './open-meteo/open-meteo.module';
import { ScoringModule } from './scoring/scoring.module';
import { StoreModule } from './store/store.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    StoreModule,
    ScoringModule,
    OpenMeteoModule,
    GeocodingModule,
    AppGraphqlModule,
    HealthModule,
  ],
})
export class AppModule {}
