import { join } from 'path';
import depthLimit from 'graphql-depth-limit';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLISODateTime, GraphQLModule } from '@nestjs/graphql';
import { ActivityRankingModule } from '../activity-ranking/activity-ranking.module';
import { HealthModule } from '../health/health.module';
import { ActivityRankingResolver } from './activity-ranking.resolver';
import { ComplexityPlugin } from './complexity.plugin';

const isProd = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: [join(process.cwd(), 'docs/contracts/schema.graphql')],
      resolvers: { DateTime: GraphQLISODateTime },
      playground: false,
      introspection: !isProd,
      validationRules: [depthLimit(7)],
      formatError: (formattedError) => {
        if (isProd) {
          const { extensions, ...rest } = formattedError;
          const safeExtensions = extensions
            ? { ...extensions, stacktrace: undefined }
            : undefined;
          return { ...rest, extensions: safeExtensions };
        }
        return formattedError;
      },
    }),
    ActivityRankingModule,
    HealthModule,
  ],
  providers: [ActivityRankingResolver, ComplexityPlugin],
})
export class AppGraphqlModule {}
