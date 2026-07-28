import { Module } from '@nestjs/common';
import { OpenMeteoModule } from '../open-meteo/open-meteo.module';
import { StoreModule } from '../store/store.module';
import { RefreshScheduler } from './refresh.scheduler';
import { RefreshService } from './refresh.service';

@Module({
  imports: [StoreModule, OpenMeteoModule],
  providers: [RefreshService, RefreshScheduler],
  exports: [RefreshService],
})
export class RefreshModule {}
