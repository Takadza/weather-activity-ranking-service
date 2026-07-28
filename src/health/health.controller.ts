import { Controller, Get } from '@nestjs/common';
import { HealthPayload, HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  getHealth(): Promise<HealthPayload> {
    return this.health.getHealth();
  }
}
