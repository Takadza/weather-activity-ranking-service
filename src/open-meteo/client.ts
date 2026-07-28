import type { WeatherDay } from '../scoring/types';
import { CircuitBreaker } from './circuit-breaker';
import type {
  GeocodeResult,
  OpenMeteoForecastResponse,
  OpenMeteoGeocodeResponse,
  OpenMeteoMarineResponse,
} from './types';

export type SleepFn = (ms: number) => Promise<void>;

export type OpenMeteoClientOptions = {
  fetch?: typeof fetch;
  sleep?: SleepFn;
  circuitBreaker?: CircuitBreaker;
  forecastBaseUrl?: string;
  marineBaseUrl?: string;
  geocodeBaseUrl?: string;
  maxAttempts?: number;
  /** Per-request timeout; combined with any caller AbortSignal. */
  timeoutMs?: number;
};

export class HttpError extends Error {
  readonly name = 'HttpError';

  constructor(
    readonly status: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
  }
}

const FORECAST_DAILY_PARAMS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'snowfall_sum',
  'weather_code',
].join(',');

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err: unknown): boolean {
  if (err instanceof HttpError) {
    return err.status >= 500 || err.status === 429;
  }
  if (err instanceof Error && /HTTP 5\d\d/.test(err.message)) {
    return true;
  }
  // Network / fetch failures (not caller abort)
  if (err instanceof Error && err.name === 'AbortError') {
    return false;
  }
  return err instanceof TypeError;
}

function at<T>(arr: Array<T | null> | undefined, i: number): T | null {
  if (!arr || i >= arr.length) return null;
  const v = arr[i];
  return v === undefined ? null : v;
}

function combineSignals(
  timeoutMs: number | undefined,
  signal?: AbortSignal,
): AbortSignal | undefined {
  const signals: AbortSignal[] = [];
  if (signal) signals.push(signal);
  if (timeoutMs != null && timeoutMs > 0) {
    signals.push(AbortSignal.timeout(timeoutMs));
  }
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  return AbortSignal.any(signals);
}

export class OpenMeteoClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: SleepFn;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly forecastBaseUrl: string;
  private readonly marineBaseUrl: string;
  private readonly geocodeBaseUrl: string;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number | undefined;

  constructor(opts: OpenMeteoClientOptions = {}) {
    this.fetchImpl = opts.fetch ?? fetch.bind(globalThis);
    this.sleep = opts.sleep ?? defaultSleep;
    this.circuitBreaker = opts.circuitBreaker ?? new CircuitBreaker();
    this.forecastBaseUrl =
      opts.forecastBaseUrl ?? 'https://api.open-meteo.com/v1/forecast';
    this.marineBaseUrl =
      opts.marineBaseUrl ?? 'https://marine-api.open-meteo.com/v1/marine';
    this.geocodeBaseUrl =
      opts.geocodeBaseUrl ?? 'https://geocoding-api.open-meteo.com/v1/search';
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.timeoutMs = opts.timeoutMs;
  }

  async fetchForecast(
    lat: number,
    lon: number,
    opts?: { signal?: AbortSignal },
  ): Promise<WeatherDay[]> {
    const forecastUrl = new URL(this.forecastBaseUrl);
    forecastUrl.searchParams.set('latitude', String(lat));
    forecastUrl.searchParams.set('longitude', String(lon));
    forecastUrl.searchParams.set('daily', FORECAST_DAILY_PARAMS);
    // Pin m/s so ×3.6 → km/h is correct (API default is kmh — see docs/03 §6).
    forecastUrl.searchParams.set('wind_speed_unit', 'ms');
    // UTC day buckets; locked here for deterministic storage keys (docs/03 §6).
    forecastUrl.searchParams.set('timezone', 'UTC');
    forecastUrl.searchParams.set('forecast_days', '7');

    const marineUrl = new URL(this.marineBaseUrl);
    marineUrl.searchParams.set('latitude', String(lat));
    marineUrl.searchParams.set('longitude', String(lon));
    marineUrl.searchParams.set('daily', 'wave_height_max');
    marineUrl.searchParams.set('timezone', 'UTC');
    marineUrl.searchParams.set('forecast_days', '7');

    const signal = combineSignals(this.timeoutMs, opts?.signal);

    const forecast = await this.circuitBreaker.exec(() =>
      this.fetchJsonWithRetry<OpenMeteoForecastResponse>(
        forecastUrl.toString(),
        signal,
      ),
    );

    // Marine is best-effort and must not trip the shared forecast/geocode breaker.
    let marine: OpenMeteoMarineResponse | null = null;
    try {
      marine = await this.fetchJsonWithRetry<OpenMeteoMarineResponse>(
        marineUrl.toString(),
        signal,
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      // Still return forecast days with waveHeightM null.
      marine = null;
    }

    return this.mapForecastDays(forecast, marine);
  }

  async geocode(
    name: string,
    opts?: { signal?: AbortSignal },
  ): Promise<GeocodeResult[]> {
    const url = new URL(this.geocodeBaseUrl);
    url.searchParams.set('name', name);
    url.searchParams.set('count', '10');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');

    const signal = combineSignals(this.timeoutMs, opts?.signal);

    const body = await this.circuitBreaker.exec(() =>
      this.fetchJsonWithRetry<OpenMeteoGeocodeResponse>(url.toString(), signal),
    );

    return (body.results ?? [])
      .filter(
        (
          r,
        ): r is typeof r & {
          name: string;
          latitude: number;
          longitude: number;
        } =>
          typeof r.name === 'string' &&
          typeof r.latitude === 'number' &&
          typeof r.longitude === 'number',
      )
      .map((r) => ({
        name: r.name,
        country: r.country ?? null,
        admin1: r.admin1 ?? null,
        latitude: r.latitude,
        longitude: r.longitude,
      }));
  }

  private mapForecastDays(
    forecast: OpenMeteoForecastResponse,
    marine: OpenMeteoMarineResponse | null,
  ): WeatherDay[] {
    const daily = forecast.daily;
    if (!daily?.time?.length) {
      return [];
    }

    const waveByDate = new Map<string, number | null>();
    if (marine?.daily?.time) {
      for (let i = 0; i < marine.daily.time.length; i++) {
        waveByDate.set(
          marine.daily.time[i],
          at(marine.daily.wave_height_max, i),
        );
      }
    }

    const weatherCodes = daily.weather_code ?? daily.weathercode;

    return daily.time.map((date, i) => {
      const windMs = at(daily.wind_speed_10m_max, i);
      // Requested wind_speed_unit=ms; convert to km/h for WeatherDay.windMaxKmh.
      const windMaxKmh = windMs === null ? null : windMs * 3.6;

      return {
        date,
        tempMaxC: at(daily.temperature_2m_max, i),
        tempMinC: at(daily.temperature_2m_min, i),
        precipMm: at(daily.precipitation_sum, i),
        precipProbPct: at(daily.precipitation_probability_max, i),
        windMaxKmh,
        snowfallCm: at(daily.snowfall_sum, i),
        waveHeightM: waveByDate.get(date) ?? null,
        weatherCode: at(weatherCodes, i),
      };
    });
  }

  private async fetchJsonWithRetry<T>(
    url: string,
    signal?: AbortSignal,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const res = await this.fetchImpl(url, { signal });
        if (!res.ok) {
          throw new HttpError(res.status);
        }
        return (await res.json()) as T;
      } catch (err) {
        lastError = err;
        const retryable = isTransientError(err);
        if (!retryable || attempt === this.maxAttempts) {
          throw err;
        }
        await this.sleep(100 * 2 ** (attempt - 1));
      }
    }
    throw lastError;
  }
}
