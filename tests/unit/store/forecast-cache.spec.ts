import { ForecastCache } from '../../../src/store/forecast-cache';
import type { WeatherDay } from '../../../src/scoring/types';

const day: WeatherDay = {
  date: '2026-07-29',
  tempMaxC: 20,
  tempMinC: 10,
  precipMm: 0,
  precipProbPct: 10,
  windMaxKmh: 15,
  snowfallCm: 0,
  waveHeightM: null,
  weatherCode: 1,
};

const meta = {
  fetchedAt: new Date('2026-07-29T00:00:00.000Z'),
};

describe('ForecastCache LRU', () => {
  it('evicts oldest entries when over maxEntries', () => {
    const cache = new ForecastCache(60_000, 2, () => 1_000);
    cache.set('a', [day], meta);
    cache.set('b', [day], meta);
    expect(cache.size).toBe(2);
    cache.set('c', [day], meta);
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).not.toBeNull();
    expect(cache.get('c')).not.toBeNull();
  });

  it('treats get as a recency refresh for LRU', () => {
    const cache = new ForecastCache(60_000, 2, () => 1_000);
    cache.set('a', [day], meta);
    cache.set('b', [day], meta);
    expect(cache.get('a')).not.toBeNull();
    cache.set('c', [day], meta);
    expect(cache.get('b')).toBeNull();
    expect(cache.get('a')).not.toBeNull();
    expect(cache.get('c')).not.toBeNull();
  });
});
