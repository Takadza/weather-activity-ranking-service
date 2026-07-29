export default () => ({
  databaseUrl: process.env.DATABASE_URL ?? '',
  port: parseInt(process.env.PORT ?? '3000', 10),
  workerMetricsPort: parseInt(process.env.WORKER_METRICS_PORT ?? '3001', 10),
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
  logLevel: process.env.LOG_LEVEL ?? 'info',
});
