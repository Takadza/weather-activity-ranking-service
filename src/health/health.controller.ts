import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SkipApiKey } from '../common/skip-api-key.decorator';
import { isMetricsAuthorized } from '../metrics/metrics-auth';
import { HealthPayload, HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly config: ConfigService,
  ) {}

  /** Liveness: process is up (no DB). */
  @Get('live')
  @SkipThrottle()
  @SkipApiKey()
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: DB + refresh freshness; 503 when degraded or DB unavailable. */
  @Get('ready')
  async ready(@Req() req: Request): Promise<HealthPayload> {
    try {
      const payload = await this.health.getHealth({
        includeDetails: this.includeDetails(req),
      });
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
  getHealth(@Req() req: Request): Promise<HealthPayload> {
    return this.health.getHealth({
      includeDetails: this.includeDetails(req),
    });
  }

  private includeDetails(req: Request): boolean {
    return isMetricsAuthorized(
      this.config.get<string>('metricsToken', ''),
      req.header('authorization') ?? undefined,
      req.header('x-metrics-token') ?? undefined,
    );
  }
}
