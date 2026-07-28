import {
  OpenMeteoClient,
  parseRetryAfterMs,
} from '../../../src/open-meteo/client';
import { CircuitBreaker } from '../../../src/open-meteo/circuit-breaker';
import type { WeatherDay } from '../../../src/scoring/types';

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => normalized[name.toLowerCase()] ?? null,
    },
    json: () => Promise.resolve(body),
  } as Response;
}

const noopSleep = (): Promise<void> => Promise.resolve();
const noJitter = (): number => 0;

describe('parseRetryAfterMs', () => {
  it('parses delay-seconds', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
  });

  it('parses HTTP-date relative to now', () => {
    const now = Date.parse('Wed, 29 Jul 2026 00:00:00 GMT');
    expect(parseRetryAfterMs('Wed, 29 Jul 2026 00:00:05 GMT', now)).toBe(5000);
  });
});

describe('OpenMeteoClient', () => {
  const forecastDaily = {
    time: ['2026-07-28', '2026-07-29'],
    temperature_2m_max: [10, 12],
    temperature_2m_min: [2, 4],
    precipitation_sum: [1.5, 0],
    precipitation_probability_max: [40, 10],
    wind_speed_10m_max: [5, 10], // m/s (wind_speed_unit=ms) → km/h via × 3.6
    snowfall_sum: [3, 0],
    weather_code: [71, 1],
  };

  const marineDaily = {
    time: ['2026-07-28', '2026-07-29'],
    wave_height_max: [1.2, 0.8],
  };

  function clientOpts(
    fetchMock: jest.Mock,
    extra: ConstructorParameters<typeof OpenMeteoClient>[0] = {},
  ) {
    return {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: noopSleep,
      random: noJitter,
      circuitBreaker: new CircuitBreaker({ failureThreshold: 10 }),
      ...extra,
    };
  }

  it('maps forecast + marine JSON to WeatherDay[]', async () => {
    const fetchMock = jest.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('marine-api.open-meteo.com')) {
        return Promise.resolve(jsonResponse({ daily: marineDaily }));
      }
      return Promise.resolve(jsonResponse({ daily: forecastDaily }));
    });
    const sleep = jest.fn(noopSleep);
    const client = new OpenMeteoClient({
      ...clientOpts(fetchMock),
      sleep,
    });

    const days = await client.fetchForecast(48.85, 2.35);

    const expected: WeatherDay[] = [
      {
        date: '2026-07-28',
        tempMaxC: 10,
        tempMinC: 2,
        precipMm: 1.5,
        precipProbPct: 40,
        windMaxKmh: 18, // 5 m/s × 3.6
        snowfallCm: 3,
        waveHeightM: 1.2,
        weatherCode: 71,
      },
      {
        date: '2026-07-29',
        tempMaxC: 12,
        tempMinC: 4,
        precipMm: 0,
        precipProbPct: 10,
        windMaxKmh: 36, // 10 m/s × 3.6
        snowfallCm: 0,
        waveHeightM: 0.8,
        weatherCode: 1,
      },
    ];
    expect(days).toEqual(expected);
  });

  it('requests forecast with pinned wind_speed_unit=ms and daily fields', async () => {
    const fetchMock = jest.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('marine-api')) {
        return Promise.resolve(jsonResponse({ daily: marineDaily }));
      }
      return Promise.resolve(jsonResponse({ daily: forecastDaily }));
    });
    const client = new OpenMeteoClient(clientOpts(fetchMock));

    await client.fetchForecast(48.85, 2.35);

    const forecastCall = (
      fetchMock.mock.calls as unknown as Array<[string | URL]>
    ).find(([u]) => String(u).includes('/v1/forecast'));
    expect(forecastCall).toBeDefined();
    const params = new URL(String(forecastCall![0])).searchParams;
    expect(params.get('wind_speed_unit')).toBe('ms');
    expect(params.get('timezone')).toBe('UTC');
    expect(params.get('forecast_days')).toBe('7');
    expect(params.get('daily')).toContain('wind_speed_10m_max');
    expect(params.get('daily')).toContain('precipitation_probability_max');
  });

  it('fetches forecast and marine in parallel', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = jest.fn(async (url: string | URL) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      const href = String(url);
      if (href.includes('marine-api')) {
        return jsonResponse({ daily: marineDaily });
      }
      return jsonResponse({ daily: forecastDaily });
    });
    const client = new OpenMeteoClient(clientOpts(fetchMock));
    await client.fetchForecast(1, 2);
    expect(maxInFlight).toBeGreaterThanOrEqual(2);
  });

  it('retries transient 5xx then succeeds (3 attempts total)', async () => {
    let forecastCalls = 0;
    const fetchMock = jest.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('marine-api.open-meteo.com')) {
        return Promise.resolve(jsonResponse({ daily: marineDaily }));
      }
      forecastCalls += 1;
      if (forecastCalls < 3) {
        return Promise.resolve(jsonResponse({ error: true }, 500));
      }
      return Promise.resolve(jsonResponse({ daily: forecastDaily }));
    });
    const sleep = jest.fn(noopSleep);
    const client = new OpenMeteoClient({
      ...clientOpts(fetchMock),
      sleep,
    });

    const days = await client.fetchForecast(1, 2);
    expect(days).toHaveLength(2);
    expect(forecastCalls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it('retries HTTP 429 honoring Retry-After', async () => {
    let forecastCalls = 0;
    const fetchMock = jest.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('marine-api')) {
        return Promise.resolve(jsonResponse({ daily: marineDaily }));
      }
      forecastCalls += 1;
      if (forecastCalls < 2) {
        return Promise.resolve(
          jsonResponse({ error: true, reason: 'Rate limited' }, 429, {
            'Retry-After': '3',
          }),
        );
      }
      return Promise.resolve(jsonResponse({ daily: forecastDaily }));
    });
    const sleep = jest.fn(noopSleep);
    const client = new OpenMeteoClient({
      ...clientOpts(fetchMock),
      sleep,
    });

    await client.fetchForecast(1, 2);
    expect(forecastCalls).toBe(2);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it('includes upstream reason in HttpError message', async () => {
    const fetchMock = jest.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('marine-api')) {
        return Promise.resolve(jsonResponse({ daily: marineDaily }));
      }
      return Promise.resolve(
        jsonResponse({ error: true, reason: 'Latitude out of range' }, 400),
      );
    });
    const client = new OpenMeteoClient(clientOpts(fetchMock));
    await expect(client.fetchForecast(1, 2)).rejects.toThrow(
      /HTTP 400: Latitude out of range/,
    );
  });

  it('does not retry non-429 4xx', async () => {
    const fetchMock = jest.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('marine-api')) {
        return Promise.resolve(jsonResponse({ daily: marineDaily }));
      }
      return Promise.resolve(jsonResponse({ error: true }, 400));
    });
    const sleep = jest.fn(noopSleep);
    const client = new OpenMeteoClient({
      ...clientOpts(fetchMock),
      sleep,
    });

    await expect(client.fetchForecast(1, 2)).rejects.toThrow(/HTTP 400/);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('exhausts retries on persistent 5xx', async () => {
    const fetchMock = jest.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('marine-api')) {
        return Promise.resolve(jsonResponse({ daily: marineDaily }));
      }
      return Promise.resolve(jsonResponse({ error: true }, 503));
    });
    const sleep = jest.fn(noopSleep);
    const client = new OpenMeteoClient({
      ...clientOpts(fetchMock),
      sleep,
      maxAttempts: 3,
    });

    await expect(client.fetchForecast(1, 2)).rejects.toThrow(/HTTP 503/);
    const forecastCalls = (
      fetchMock.mock.calls as unknown as Array<[string | URL]>
    ).filter(([u]) => String(u).includes('/v1/forecast')).length;
    expect(forecastCalls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('opens circuit after consecutive forecast failures and fail-fasts', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve(jsonResponse({ error: true }, 500)),
    );
    const client = new OpenMeteoClient({
      ...clientOpts(fetchMock, {
        circuitBreaker: new CircuitBreaker({ failureThreshold: 3 }),
        maxAttempts: 1,
      }),
    });

    for (let i = 0; i < 3; i++) {
      await expect(client.fetchForecast(1, 2)).rejects.toThrow(/HTTP 500/);
    }
    const callsBefore = fetchMock.mock.calls.length;
    await expect(client.fetchForecast(1, 2)).rejects.toThrow(/circuit/i);
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('returns waveHeightM null when marine fails after retries', async () => {
    const onMarineError = jest.fn();
    const fetchMock = jest.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('marine-api.open-meteo.com')) {
        return Promise.resolve(jsonResponse({ error: true }, 500));
      }
      return Promise.resolve(jsonResponse({ daily: forecastDaily }));
    });
    const client = new OpenMeteoClient({
      ...clientOpts(fetchMock),
      onMarineError,
    });

    const days = await client.fetchForecast(1, 2);
    expect(days.every((d) => d.waveHeightM === null)).toBe(true);
    expect(days[0].tempMaxC).toBe(10);
    expect(onMarineError).toHaveBeenCalled();
  });

  it('does not trip shared circuit breaker on marine-only failures', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    const fetchMock = jest.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('marine-api')) {
        return Promise.resolve(jsonResponse({ error: true }, 500));
      }
      return Promise.resolve(jsonResponse({ daily: forecastDaily }));
    });
    const client = new OpenMeteoClient({
      ...clientOpts(fetchMock, { circuitBreaker: breaker }),
    });

    for (let i = 0; i < 3; i++) {
      const days = await client.fetchForecast(1, 2);
      expect(days[0].tempMaxC).toBe(10);
      expect(days.every((d) => d.waveHeightM === null)).toBe(true);
    }

    const after = await client.fetchForecast(1, 2);
    expect(after[0].tempMaxC).toBe(10);
    expect(after.every((d) => d.waveHeightM === null)).toBe(true);
  });

  it('returns empty array when daily is absent', async () => {
    const fetchMock = jest.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('marine-api')) {
        return Promise.resolve(jsonResponse({ daily: marineDaily }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    const client = new OpenMeteoClient(clientOpts(fetchMock));
    await expect(client.fetchForecast(1, 2)).resolves.toEqual([]);
  });

  it('passes AbortSignal through to fetch', async () => {
    const fetchMock = jest.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('marine-api')) {
        return Promise.resolve(jsonResponse({ daily: marineDaily }));
      }
      return Promise.resolve(jsonResponse({ daily: forecastDaily }));
    });
    const client = new OpenMeteoClient(clientOpts(fetchMock));
    const signal = new AbortController().signal;
    await client.fetchForecast(1, 2, { signal });

    const calls = fetchMock.mock.calls as unknown as Array<
      [string | URL, RequestInit?]
    >;
    for (const call of calls) {
      expect(call[1]?.signal).toBe(signal);
    }
  });

  it('geocodes a name to candidate locations', async () => {
    const fetchMock = jest.fn((url: string | URL) => {
      void url;
      return Promise.resolve(
        jsonResponse({
          results: [
            {
              name: 'Paris',
              country: 'France',
              admin1: 'Île-de-France',
              latitude: 48.85,
              longitude: 2.35,
            },
            {
              name: 'Paris',
              country: null,
              admin1: null,
              latitude: 33.66,
              longitude: -95.55,
            },
          ],
        }),
      );
    });
    const client = new OpenMeteoClient(clientOpts(fetchMock));

    const results = await client.geocode('Paris');
    expect(results).toEqual([
      {
        name: 'Paris',
        country: 'France',
        admin1: 'Île-de-France',
        latitude: 48.85,
        longitude: 2.35,
      },
      {
        name: 'Paris',
        country: null,
        admin1: null,
        latitude: 33.66,
        longitude: -95.55,
      },
    ]);
    const firstUrl = (
      fetchMock.mock.calls as unknown as Array<[string | URL]>
    )[0][0];
    expect(String(firstUrl)).toContain('geocoding-api.open-meteo.com');
  });

  it('filters malformed geocode results', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve(
        jsonResponse({
          results: [
            { name: 'Ok', latitude: 1, longitude: 2 },
            { name: 'Bad', latitude: 'x', longitude: 2 },
            { latitude: 3, longitude: 4 },
          ],
        }),
      ),
    );
    const client = new OpenMeteoClient(clientOpts(fetchMock));
    const results = await client.geocode('x');
    expect(results).toEqual([
      { name: 'Ok', country: null, admin1: null, latitude: 1, longitude: 2 },
    ]);
  });

  it('accepts weathercode alias from forecast daily', async () => {
    const fetchMock = jest.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('marine-api')) {
        return Promise.resolve(
          jsonResponse({
            daily: { time: ['2026-07-28'], wave_height_max: [null] },
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          daily: {
            time: ['2026-07-28'],
            temperature_2m_max: [1],
            temperature_2m_min: [0],
            precipitation_sum: [0],
            precipitation_probability_max: [0],
            wind_speed_10m_max: [0],
            snowfall_sum: [0],
            weathercode: [3],
          },
        }),
      );
    });
    const client = new OpenMeteoClient(clientOpts(fetchMock));
    const days = await client.fetchForecast(0, 0);
    expect(days[0].weatherCode).toBe(3);
  });
});
