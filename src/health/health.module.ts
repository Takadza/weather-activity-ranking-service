import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [StoreModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
