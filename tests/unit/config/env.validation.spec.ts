import { validateEnv } from '../../../src/config/env.validation';

describe('validateEnv production secrets', () => {
  const base = {
    DATABASE_URL: 'postgresql://wars:wars@localhost:5432/wars',
  };

  it('allows missing API_KEY/METRICS_TOKEN/REDIS_URL outside production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'test' })).not.toThrow();
  });

  it('requires API_KEY, METRICS_TOKEN, and REDIS_URL in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /API_KEY|METRICS_TOKEN|REDIS_URL/,
    );

    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        API_KEY: 'k',
        METRICS_TOKEN: 'm',
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).not.toThrow();
  });
});
