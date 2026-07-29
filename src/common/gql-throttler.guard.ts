import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext): {
    req: Record<string, any>;
    res: Record<string, any>;
  } {
    if (context.getType() === 'http') {
      return super.getRequestResponse(context);
    }

    // GraphQL (and other) contexts: pull Express req/res from GQL context.
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext<{
      req?: Record<string, any>;
      res?: Record<string, any>;
    }>();
    return {
      req: ctx.req ?? {},
      res: ctx.res ?? {},
    };
  }
}
