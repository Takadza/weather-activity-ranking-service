import { Args, Query, Resolver } from '@nestjs/graphql';
import type { ResolveLocationInput } from '../geocoding/resolve';
import { ActivityRankingService } from './activity-ranking.service';

@Resolver('Query')
export class ActivityRankingResolver {
  constructor(private readonly rankings: ActivityRankingService) {}

  @Query('activityRanking')
  activityRanking(@Args('location') location: ResolveLocationInput) {
    return this.rankings.rank(location);
  }
}
