/**
 * Runs before integration modules load so ConfigModule validate/load sees safe env.
 */
process.env.DATABASE_URL ??=
  'postgresql://wars:wars@localhost:5432/wars?schema=public';
process.env.NODE_ENV = 'test';
process.env.API_KEY ??= '';
process.env.METRICS_TOKEN ??= '';
process.env.REDIS_URL ??= '';
