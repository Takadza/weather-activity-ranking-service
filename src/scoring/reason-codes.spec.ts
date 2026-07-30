import { scoreDay } from './scoring.service';
import type { ReasonCode, WeatherDay } from './types';

const ALL_REASON_CODES: ReasonCode[] = [
  'MISSING_TEMP',
  'TOO_WARM',
  'TOO_COLD',
  'NO_SNOW',
  'HIGH_WIND',
  'NO_MARINE_DATA',
  'FLAT',
  'TOO_BIG',
  'TOO_HOT',
  'HEAVY_RAIN',
  'BAD_WEATHER',
  'GOOD_OUTDOOR_WEATHER',
  'POOR_OUTDOOR_WEATHER',
];

const base: WeatherDay = {
  date: '2026-07-28',
  tempMaxC: 0,
  tempMinC: -5,
  precipMm: 0,
  precipProbPct: 10,
  windMaxKmh: 10,
  snowfallCm: 8,
  waveHeightM: null,
  weatherCode: 71,
};

/** Each ReasonCode in schema.graphql must appear from at least one scoring fixture. */
const FIXTURES: Array<{
  activity: Parameters<typeof scoreDay>[0];
  day: WeatherDay;
}> = [
  { activity: 'SKIING', day: { ...base, tempMaxC: null } },
  {
    activity: 'SKIING',
    day: { ...base, tempMaxC: 18, snowfallCm: 0, precipMm: 20 },
  },
  { activity: 'SKIING', day: { ...base, tempMaxC: -20, snowfallCm: 5 } },
  { activity: 'SKIING', day: { ...base, snowfallCm: 0, windMaxKmh: 10 } },
  { activity: 'SKIING', day: { ...base, windMaxKmh: 50 } },
  { activity: 'SURFING', day: { ...base, waveHeightM: null } },
  { activity: 'SURFING', day: { ...base, waveHeightM: 0.1 } },
  { activity: 'SURFING', day: { ...base, waveHeightM: 5 } },
  {
    activity: 'OUTDOOR_SIGHTSEEING',
    day: { ...base, tempMaxC: 35, precipMm: 0, weatherCode: 1 },
  },
  {
    activity: 'OUTDOOR_SIGHTSEEING',
    day: {
      ...base,
      tempMaxC: 12,
      precipMm: 25,
      precipProbPct: 80,
      windMaxKmh: 45,
      weatherCode: 65,
    },
  },
  {
    activity: 'INDOOR_SIGHTSEEING',
    day: {
      ...base,
      tempMaxC: 22,
      precipMm: 0,
      precipProbPct: 5,
      windMaxKmh: 10,
      weatherCode: 1,
    },
  },
  {
    activity: 'INDOOR_SIGHTSEEING',
    day: {
      ...base,
      tempMaxC: 12,
      precipMm: 25,
      precipProbPct: 80,
      windMaxKmh: 45,
      weatherCode: 65,
    },
  },
];

describe('ReasonCode coverage', () => {
  it('every schema ReasonCode is emitted by at least one fixture', () => {
    const emitted = new Set<ReasonCode>();
    for (const { activity, day } of FIXTURES) {
      for (const code of scoreDay(activity, day).reasonCodes) {
        emitted.add(code);
      }
    }

    for (const code of ALL_REASON_CODES) {
      expect(emitted.has(code)).toBe(true);
    }
  });
});
