function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseIntrospection(
  raw: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  const value = raw?.trim().toLowerCase();
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return nodeEnv !== 'production';
}

export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL ?? '',
  port: parseInt(process.env.PORT ?? '3000', 10),
  workerMetricsPort: parseInt(process.env.WORKER_METRICS_PORT ?? '3001', 10),
  workerBindHost: process.env.WORKER_BIND_HOST?.trim() || '127.0.0.1',
  refreshIntervalMs: parseInt(
    process.env.REFRESH_INTERVAL_MS ?? '21600000',
    10,
  ),
  refreshConcurrency: parseInt(process.env.REFRESH_CONCURRENCY ?? '5', 10),
  openMeteoTimeoutMs: parseInt(process.env.OPEN_METEO_TIMEOUT_MS ?? '5000', 10),
  coldStartTimeoutMs: parseInt(process.env.COLD_START_TIMEOUT_MS ?? '3000', 10),
  coldStartMaxConcurrent: parseInt(
    process.env.COLD_START_MAX_CONCURRENT ?? '10',
    10,
  ),
  staleAfterSeconds: parseInt(process.env.STALE_AFTER_SECONDS ?? '21600', 10),
  geocodeCacheTtlSeconds: parseInt(
    process.env.GEOCODE_CACHE_TTL_SECONDS ?? '604800',
    10,
  ),
  forecastCacheTtlMs: parseInt(
    process.env.FORECAST_CACHE_TTL_MS ?? '60000',
    10,
  ),
  forecastCacheMaxEntries: parseInt(
    process.env.FORECAST_CACHE_MAX_ENTRIES ?? '256',
    10,
  ),
  maxTrackedLocations: parseInt(process.env.MAX_TRACKED_LOCATIONS ?? '100', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
  apiKey: process.env.API_KEY?.trim() || '',
  metricsToken: process.env.METRICS_TOKEN?.trim() || '',
  redisUrl: process.env.REDIS_URL?.trim() || '',
  throttleTtlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
  throttleLimit: parseInt(process.env.THROTTLE_LIMIT ?? '60', 10),
  trustProxy: process.env.TRUST_PROXY?.trim() || '',
  introspection: parseIntrospection(
    process.env.INTROSPECTION,
    process.env.NODE_ENV,
  ),
});
