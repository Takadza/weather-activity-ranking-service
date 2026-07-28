import { join } from 'path';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLISODateTime, GraphQLModule } from '@nestjs/graphql';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { OpenMeteoModule } from '../open-meteo/open-meteo.module';
import { ScoringModule } from '../scoring/scoring.module';
import { StoreModule } from '../store/store.module';
import { ActivityRankingResolver } from './activity-ranking.resolver';
import { ActivityRankingService } from './activity-ranking.service';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: [join(process.cwd(), 'docs/contracts/schema.graphql')],
      resolvers: { DateTime: GraphQLISODateTime },
    }),
    StoreModule,
    ScoringModule,
    OpenMeteoModule,
    GeocodingModule,
  ],
  providers: [ActivityRankingService, ActivityRankingResolver],
})
export class AppGraphqlModule {}
