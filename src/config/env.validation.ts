import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test', 'provision'])
      .optional()
      .default('development'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    PORT: z.coerce.number().int().min(0).max(65535).optional(),
    WORKER_METRICS_PORT: z.coerce.number().int().min(0).max(65535).optional(),
    WORKER_BIND_HOST: z.string().optional(),
    REFRESH_INTERVAL_MS: z.coerce.number().int().positive().optional(),
    REFRESH_CONCURRENCY: z.coerce.number().int().positive().optional(),
    OPEN_METEO_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
    COLD_START_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
    COLD_START_MAX_CONCURRENT: z.coerce.number().int().positive().optional(),
    STALE_AFTER_SECONDS: z.coerce.number().int().nonnegative().optional(),
    GEOCODE_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().optional(),
    FORECAST_CACHE_TTL_MS: z.coerce.number().int().nonnegative().optional(),
    FORECAST_CACHE_MAX_ENTRIES: z.coerce.number().int().positive().optional(),
    MAX_TRACKED_LOCATIONS: z.coerce.number().int().positive().optional(),
    LOG_LEVEL: z
      .enum(['verbose', 'debug', 'log', 'warn', 'error', 'fatal', 'info'])
      .optional(),
    /** Comma-separated browser origins; empty = CORS disabled. */
    ALLOWED_ORIGINS: z.string().optional(),
    /**
     * Shared consumer API key (Bearer or X-API-Key). Required in production.
     * Empty allows unauthenticated access in non-production only.
     */
    API_KEY: z.string().optional(),
    /** When set, /metrics requires Authorization: Bearer or X-Metrics-Token. */
    METRICS_TOKEN: z.string().optional(),
    /** Redis URL for shared throttler storage. Required in production. */
    REDIS_URL: z.string().optional(),
    THROTTLE_TTL_MS: z.coerce.number().int().positive().optional(),
    THROTTLE_LIMIT: z.coerce.number().int().positive().optional(),
    /**
     * Express trust proxy: unset/empty = off; "1"/"true" = trust one hop;
     * integer = hop count. Required behind LB for accurate throttle IP.
     */
    TRUST_PROXY: z.string().optional(),
    /**
     * GraphQL introspection: "true"/"false". Default: on outside production,
     * off in production.
     */
    INTROSPECTION: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== 'production') {
      return;
    }
    if (!data.API_KEY?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_KEY'],
        message: 'API_KEY is required when NODE_ENV=production',
      });
    }
    if (!data.METRICS_TOKEN?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['METRICS_TOKEN'],
        message: 'METRICS_TOKEN is required when NODE_ENV=production',
      });
    }
    if (!data.REDIS_URL?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'REDIS_URL is required when NODE_ENV=production',
      });
    }
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
