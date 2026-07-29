import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthPayload, HealthService } from './health.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: process is up (no DB). */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: DB + refresh freshness; 503 when degraded or DB unavailable. */
  @Get('ready')
  async ready(): Promise<HealthPayload> {
    try {
      const payload = await this.health.getHealth();
      if (payload.status === 'degraded') {
        throw new HttpException(payload, HttpStatus.SERVICE_UNAVAILABLE);
      }
      return payload;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException(
        { status: 'unavailable', refresh: null },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
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
