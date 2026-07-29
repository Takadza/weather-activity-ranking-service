import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { isMetricsAuthorized } from './metrics-auth';

@Injectable()
export class MetricsAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const token = this.config.get<string>('metricsToken', '');
    const req = context.switchToHttp().getRequest<Request>();
    const authorized = isMetricsAuthorized(
      token,
      req.header('authorization') ?? undefined,
      req.header('x-metrics-token') ?? undefined,
    );
    if (!authorized) {
      throw new UnauthorizedException('Invalid or missing metrics token');
    }
    return true;
  }
}
