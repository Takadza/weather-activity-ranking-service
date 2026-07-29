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
  /** @deprecated Prefer forecastCircuitBreaker / geocodeCircuitBreaker. */
  circuitBreaker?: CircuitBreaker;
  forecastCircuitBreaker?: CircuitBreaker;
  geocodeCircuitBreaker?: CircuitBreaker;
  forecastBaseUrl?: string;
  marineBaseUrl?: string;
  geocodeBaseUrl?: string;
  maxAttempts?: number;
  /** Per-request timeout; combined with any caller AbortSignal. */
  timeoutMs?: number;
  /** 0..1 — injected for deterministic backoff jitter in tests. */
  random?: () => number;
  /** Optional hook when marine fetch fails (best-effort path). */
  onMarineError?: (err: unknown) => void;
};

export class HttpError extends Error {
  readonly name = 'HttpError';

  constructor(
    readonly status: number,
    message?: string,
    readonly retryAfterMs?: number,
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

/** Parse Retry-After as delay-seconds or HTTP-date → milliseconds. */
export function parseRetryAfterMs(
  header: string | null,
  nowMs: number = Date.now(),
): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  const when = Date.parse(trimmed);
  if (!Number.isNaN(when)) {
    return Math.max(0, when - nowMs);
  }
  return undefined;
}

async function httpErrorFromResponse(res: Response): Promise<HttpError> {
  let reason: string | undefined;
  try {
    const body: unknown = await res.json();
    if (
      body &&
      typeof body === 'object' &&
      'reason' in body &&
      typeof body.reason === 'string'
    ) {
      reason = (body as { reason: string }).reason;
    }
  } catch {
    // Body may be empty or non-JSON.
  }
  const retryAfterMs = parseRetryAfterMs(res.headers.get('Retry-After'));
  const message = reason
    ? `HTTP ${res.status}: ${reason}`
    : `HTTP ${res.status}`;
  return new HttpError(res.status, message, retryAfterMs);
}

export class OpenMeteoClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: SleepFn;
  private readonly forecastBreaker: CircuitBreaker;
  private readonly geocodeBreaker: CircuitBreaker;
  private readonly forecastBaseUrl: string;
  private readonly marineBaseUrl: string;
  private readonly geocodeBaseUrl: string;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number | undefined;
  private readonly random: () => number;
  private readonly onMarineError?: (err: unknown) => void;

  constructor(opts: OpenMeteoClientOptions = {}) {
    this.fetchImpl = opts.fetch ?? fetch.bind(globalThis);
    this.sleep = opts.sleep ?? defaultSleep;
    this.forecastBreaker =
      opts.forecastCircuitBreaker ??
      opts.circuitBreaker ??
      new CircuitBreaker();
    this.geocodeBreaker = opts.geocodeCircuitBreaker ?? new CircuitBreaker();
    this.forecastBaseUrl =
      opts.forecastBaseUrl ?? 'https://api.open-meteo.com/v1/forecast';
    this.marineBaseUrl =
      opts.marineBaseUrl ?? 'https://marine-api.open-meteo.com/v1/marine';
    this.geocodeBaseUrl =
      opts.geocodeBaseUrl ?? 'https://geocoding-api.open-meteo.com/v1/search';
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.timeoutMs = opts.timeoutMs;
    this.random = opts.random ?? Math.random;
    this.onMarineError = opts.onMarineError;
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

    // Start marine only once the breaker admits a forecast attempt (no marine
    // when circuit is open). Inside the attempt, both requests overlap.
    let marineP: Promise<OpenMeteoMarineResponse | null> =
      Promise.resolve(null);
    const forecast = await this.forecastBreaker.exec(async () => {
      marineP = this.fetchJsonWithRetry<OpenMeteoMarineResponse>(
        marineUrl.toString(),
        signal,
      ).then(
        (body) => body,
        (err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') {
            throw err;
          }
          this.onMarineError?.(err);
          return null;
        },
      );
      return this.fetchJsonWithRetry<OpenMeteoForecastResponse>(
        forecastUrl.toString(),
        signal,
      );
    });
    const marine = await marineP;
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

    const body = await this.geocodeBreaker.exec(() =>
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
        raw: {
          date,
          temperature_2m_max: at(daily.temperature_2m_max, i),
          temperature_2m_min: at(daily.temperature_2m_min, i),
          precipitation_sum: at(daily.precipitation_sum, i),
          precipitation_probability_max: at(
            daily.precipitation_probability_max,
            i,
          ),
          wind_speed_10m_max_ms: windMs,
          snowfall_sum: at(daily.snowfall_sum, i),
          weather_code: at(weatherCodes, i),
          wave_height_max: waveByDate.get(date) ?? null,
        },
      };
    });
  }

  private backoffMs(attempt: number, retryAfterMs?: number): number {
    if (retryAfterMs != null && retryAfterMs > 0) {
      return retryAfterMs;
    }
    const base = 100 * 2 ** (attempt - 1);
    const jitter = Math.floor(this.random() * base * 0.5);
    return base + jitter;
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
          throw await httpErrorFromResponse(res);
        }
        return (await res.json()) as T;
      } catch (err) {
        lastError = err;
        const retryable = isTransientError(err);
        if (!retryable || attempt === this.maxAttempts) {
          throw err;
        }
        const retryAfterMs =
          err instanceof HttpError ? err.retryAfterMs : undefined;
        await this.sleep(this.backoffMs(attempt, retryAfterMs));
      }
    }
    throw lastError;
  }
}
