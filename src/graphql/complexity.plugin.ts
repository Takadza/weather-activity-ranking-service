import { Plugin } from '@nestjs/apollo';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import {
  ApolloServerPlugin,
  BaseContext,
  GraphQLRequestListener,
} from '@apollo/server';
import { GraphQLError } from 'graphql';
import { getComplexity, simpleEstimator } from 'graphql-query-complexity';

@Plugin()
export class ComplexityPlugin implements ApolloServerPlugin {
  constructor(private readonly gqlSchemaHost: GraphQLSchemaHost) {}

  requestDidStart(): Promise<GraphQLRequestListener<BaseContext>> {
    const maxComplexity = 50;
    const { schema } = this.gqlSchemaHost;

    return Promise.resolve({
      didResolveOperation({ request, document }): Promise<void> {
        const complexity = getComplexity({
          schema,
          operationName: request.operationName,
          query: document,
          variables: request.variables,
          estimators: [simpleEstimator({ defaultComplexity: 1 })],
        });
        if (complexity > maxComplexity) {
          return Promise.reject(
            new GraphQLError(
              `Query is too complex: ${complexity}. Maximum allowed complexity: ${maxComplexity}`,
              { extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } },
            ),
          );
        }
        return Promise.resolve();
      },
    });
  }
}
