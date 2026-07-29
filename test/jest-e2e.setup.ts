/**
 * Runs before e2e modules load so ConfigModule validate/load sees DATABASE_URL.
 * Jest setupFiles execute before the test framework is installed into the env.
 */
process.env.DATABASE_URL ??=
  'postgresql://wars:wars@localhost:5432/wars?schema=public';
process.env.NODE_ENV ??= 'test';
