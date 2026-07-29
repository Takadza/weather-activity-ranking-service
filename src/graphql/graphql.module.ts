import { join } from 'path';
import depthLimit from 'graphql-depth-limit';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLISODateTime, GraphQLModule } from '@nestjs/graphql';
import type { GraphQLFormattedError } from 'graphql';
import { ActivityRankingModule } from '../activity-ranking/activity-ranking.module';
import { HealthModule } from '../health/health.module';
import { ActivityRankingResolver } from './activity-ranking.resolver';
import { ComplexityPlugin } from './complexity.plugin';

const SAFE_ERROR_CODES = new Set([
  'BAD_USER_INPUT',
  'PROVIDER_UNAVAILABLE',
  'UNAUTHENTICATED',
  'GRAPHQL_VALIDATION_FAILED',
  'GRAPHQL_PARSE_FAILED',
  'BAD_REQUEST',
  'COMPLEXITY_LIMIT_EXCEEDED',
  'QUERY_TOO_COMPLEX',
  'DEPTH_LIMIT_EXCEEDED',
]);

/** Production error masking — exported for unit tests. */
export function formatGraphqlError(
  formattedError: GraphQLFormattedError,
  isProd: boolean,
): GraphQLFormattedError {
  if (!isProd) {
    return formattedError;
  }
  const code =
    typeof formattedError.extensions?.code === 'string'
      ? formattedError.extensions.code
      : 'INTERNAL_SERVER_ERROR';
  if (SAFE_ERROR_CODES.has(code)) {
    return {
      message: formattedError.message,
      extensions: { code },
    };
  }
  return {
    message: 'Internal server error',
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  };
}

@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('nodeEnv') === 'production';
        const introspection = config.get<boolean>('introspection', !isProd);
        return {
          typePaths: [join(process.cwd(), 'docs/contracts/schema.graphql')],
          resolvers: { DateTime: GraphQLISODateTime },
          playground: false,
          introspection,
          validationRules: [depthLimit(7)],
          context: ({ req, res }: { req: unknown; res: unknown }) => ({
            req,
            res,
          }),
          formatError: (formattedError) =>
            formatGraphqlError(formattedError, isProd),
        };
      },
    }),
    ActivityRankingModule,
    HealthModule,
  ],
  providers: [ActivityRankingResolver, ComplexityPlugin],
})
export class AppGraphqlModule {}
