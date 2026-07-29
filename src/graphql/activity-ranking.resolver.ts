import { Args, Context, Query, Resolver } from '@nestjs/graphql';
import { ConfigService } from '@nestjs/config';
import { GraphQLError } from 'graphql';
import type { Request } from 'express';
import { ActivityRankingService } from '../activity-ranking/activity-ranking.service';
import { ProviderUnavailableError } from '../activity-ranking/errors';
import { BadUserInputError } from '../geocoding/errors';
import type { ResolveLocationInput } from '../geocoding/resolve';
import { HealthService } from '../health/health.service';
import { isMetricsAuthorized } from '../metrics/metrics-auth';

@Resolver('Query')
export class ActivityRankingResolver {
  constructor(
    private readonly rankings: ActivityRankingService,
    private readonly health: HealthService,
    private readonly config: ConfigService,
  ) {}

  @Query('activityRanking')
  async activityRanking(@Args('location') location: ResolveLocationInput) {
    try {
      return await this.rankings.rank(location);
    } catch (err) {
      if (err instanceof BadUserInputError) {
        throw new GraphQLError(err.message, {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      if (err instanceof ProviderUnavailableError) {
        throw new GraphQLError(err.message, {
          extensions: { code: 'PROVIDER_UNAVAILABLE' },
        });
      }
      throw err;
    }
  }

  @Query('health')
  healthQuery(@Context() ctx: { req?: Request }) {
    const req = ctx.req;
    const includeDetails = isMetricsAuthorized(
      this.config.get<string>('metricsToken', ''),
      req?.headers?.authorization,
      typeof req?.headers?.['x-metrics-token'] === 'string'
        ? req.headers['x-metrics-token']
        : undefined,
    );
    return this.health.getHealth({ includeDetails });
  }
}
