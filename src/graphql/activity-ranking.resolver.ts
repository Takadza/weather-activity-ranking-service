import { Args, Query, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { ActivityRankingService } from '../activity-ranking/activity-ranking.service';
import { ProviderUnavailableError } from '../activity-ranking/errors';
import { BadUserInputError } from '../geocoding/errors';
import type { ResolveLocationInput } from '../geocoding/resolve';
import { HealthService } from '../health/health.service';

@Resolver('Query')
export class ActivityRankingResolver {
  constructor(
    private readonly rankings: ActivityRankingService,
    private readonly health: HealthService,
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
  healthQuery() {
    return this.health.getHealth();
  }
}
