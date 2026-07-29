import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test', 'provision'])
    .optional()
    .default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().min(0).max(65535).optional(),
  REFRESH_INTERVAL_MS: z.coerce.number().int().positive().optional(),
  REFRESH_CONCURRENCY: z.coerce.number().int().positive().optional(),
  OPEN_METEO_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  COLD_START_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  COLD_START_MAX_CONCURRENT: z.coerce.number().int().positive().optional(),
  STALE_AFTER_SECONDS: z.coerce.number().int().nonnegative().optional(),
  GEOCODE_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().optional(),
  FORECAST_CACHE_TTL_MS: z.coerce.number().int().nonnegative().optional(),
  LOG_LEVEL: z
    .enum(['verbose', 'debug', 'log', 'warn', 'error', 'fatal', 'info'])
    .optional(),
});

/** Fail fast on invalid env; return original config for Nest ConfigModule. */
export function validateEnv(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return config;
}
