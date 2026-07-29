import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import { isApiKeyAuthorized } from './api-key.auth';
import { IS_PUBLIC_ROUTE } from './skip-api-key.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const configuredKey = this.config.get<string>('apiKey', '');
    const req = this.getRequest(context);
    const authorized = isApiKeyAuthorized(
      configuredKey,
      req.headers.authorization,
      typeof req.headers['x-api-key'] === 'string'
        ? req.headers['x-api-key']
        : undefined,
    );
    if (!authorized) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    return true;
  }

  private getRequest(context: ExecutionContext): Request {
    if (context.getType() === 'http') {
      return context.switchToHttp().getRequest<Request>();
    }
    const gqlCtx = GqlExecutionContext.create(context);
    return gqlCtx.getContext<{ req: Request }>().req;
  }
}
