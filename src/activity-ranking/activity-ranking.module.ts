import { Module } from '@nestjs/common';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { MetricsModule } from '../metrics/metrics.module';
import { OpenMeteoModule } from '../open-meteo/open-meteo.module';
import { ScoringModule } from '../scoring/scoring.module';
import { StoreModule } from '../store/store.module';
import { ActivityRankingService } from './activity-ranking.service';

@Module({
  imports: [
    StoreModule,
    ScoringModule,
    OpenMeteoModule,
    GeocodingModule,
    MetricsModule,
  ],
  providers: [ActivityRankingService],
  exports: [ActivityRankingService],
})
export class ActivityRankingModule {}
