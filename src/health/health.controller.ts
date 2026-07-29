import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { HealthPayload, HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: process is up (no DB). */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: DB + refresh freshness; 503 when degraded. */
  @Get('ready')
  async ready(): Promise<HealthPayload> {
    const payload = await this.health.getHealth();
    if (payload.status === 'degraded') {
      throw new HttpException(payload, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return payload;
  }

  /**
   * Backward-compatible probe: returns payload with HTTP 200 even when
   * degraded (Compose historically treated any 200 as healthy). Prefer
   * /health/live and /health/ready for new deployments.
   */
  @Get()
  getHealth(): Promise<HealthPayload> {
    return this.health.getHealth();
  }
}
