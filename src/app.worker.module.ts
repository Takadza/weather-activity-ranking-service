import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { OpenMeteoModule } from './open-meteo/open-meteo.module';
import { RefreshModule } from './refresh/refresh.module';
import { StoreModule } from './store/store.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    StoreModule,
    OpenMeteoModule,
    RefreshModule,
  ],
})
export class AppWorkerModule {}
