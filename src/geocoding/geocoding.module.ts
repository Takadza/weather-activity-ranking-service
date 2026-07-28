import { Module } from '@nestjs/common';
import { OpenMeteoModule } from '../open-meteo/open-meteo.module';
import { StoreModule } from '../store/store.module';
import { GeocodingService } from './geocoding.service';

@Module({
  imports: [StoreModule, OpenMeteoModule],
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeocodingModule {}
