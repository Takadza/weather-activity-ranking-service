import { formatGraphqlError } from '../../../src/graphql/graphql.module';

describe('formatGraphqlError', () => {
  it('passes through errors outside production', () => {
    const err = {
      message: 'secret stack detail',
      extensions: { code: 'INTERNAL_SERVER_ERROR', stacktrace: ['a'] },
    };
    expect(formatGraphqlError(err, false)).toEqual(err);
  });

  it('keeps whitelisted codes and strips other extensions in production', () => {
    expect(
      formatGraphqlError(
        {
          message: 'bad city',
          extensions: { code: 'BAD_USER_INPUT', stacktrace: ['x'] },
        },
        true,
      ),
    ).toEqual({
      message: 'bad city',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('masks unexpected errors in production', () => {
    expect(
      formatGraphqlError(
        {
          message: 'relation "locations" does not exist',
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        },
        true,
      ),
    ).toEqual({
      message: 'Internal server error',
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  });
});
