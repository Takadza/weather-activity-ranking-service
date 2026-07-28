export default () => ({
  databaseUrl: process.env.DATABASE_URL ?? '',
  port: parseInt(process.env.PORT ?? '3000', 10),
  refreshIntervalMs: parseInt(
    process.env.REFRESH_INTERVAL_MS ?? '21600000',
    10,
  ),
  refreshConcurrency: parseInt(process.env.REFRESH_CONCURRENCY ?? '5', 10),
  openMeteoTimeoutMs: parseInt(process.env.OPEN_METEO_TIMEOUT_MS ?? '5000', 10),
  coldStartTimeoutMs: parseInt(process.env.COLD_START_TIMEOUT_MS ?? '3000', 10),
  staleAfterSeconds: parseInt(process.env.STALE_AFTER_SECONDS ?? '21600', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
});
