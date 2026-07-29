import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { OpenMeteoModule } from '../open-meteo/open-meteo.module';
import { StoreModule } from '../store/store.module';
import { RefreshScheduler } from './refresh.scheduler';
import { RefreshService } from './refresh.service';

@Module({
  imports: [StoreModule, OpenMeteoModule, MetricsModule],
  providers: [RefreshService, RefreshScheduler],
  exports: [RefreshService],
})
export class RefreshModule {}
