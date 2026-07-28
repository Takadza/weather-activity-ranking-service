import { scoreDay } from './scoring.service';

const base = {
  date: '2026-07-28',
  tempMaxC: 0,
  tempMinC: -5,
  precipMm: 0,
  precipProbPct: 10,
  windMaxKmh: 10,
  snowfallCm: 8,
  waveHeightM: null as number | null,
  weatherCode: 71,
};

describe('scoreDay skiing', () => {
  it('scores ski-friendly snow day highly', () => {
    const r = scoreDay('SKIING', base);
    expect(r.available).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it('marks warm rainy day as poor ski weather', () => {
    const r = scoreDay('SKIING', {
      ...base,
      tempMaxC: 18,
      snowfallCm: 0,
      precipMm: 20,
      weatherCode: 63,
    });
    expect(r.available).toBe(true);
    expect(r.score).toBeLessThan(40);
    expect(r.reasonCodes.length).toBeGreaterThan(0);
  });
});

describe('scoreDay surfing', () => {
  it('returns NO_MARINE_DATA when wave height missing', () => {
    const r = scoreDay('SURFING', { ...base, waveHeightM: null });
    expect(r.available).toBe(false);
    expect(r.score).toBeNull();
    expect(r.reasonCodes).toContain('NO_MARINE_DATA');
  });

  it('scores moderate waves well', () => {
    const r = scoreDay('SURFING', {
      ...base,
      tempMaxC: 22,
      waveHeightM: 1.5,
      windMaxKmh: 20,
      precipMm: 0,
    });
    expect(r.available).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(60);
  });
});

describe('scoreDay outdoor', () => {
  it('scores a mild clear day highly', () => {
    const r = scoreDay('OUTDOOR_SIGHTSEEING', {
      ...base,
      tempMaxC: 22,
      tempMinC: 14,
      precipMm: 0,
      precipProbPct: 5,
      windMaxKmh: 10,
      snowfallCm: 0,
      weatherCode: 1,
    });
    expect(r.available).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it('scores a rainy stormy day poorly', () => {
    const r = scoreDay('OUTDOOR_SIGHTSEEING', {
      ...base,
      tempMaxC: 12,
      precipMm: 25,
      precipProbPct: 80,
      windMaxKmh: 45,
      snowfallCm: 0,
      weatherCode: 65,
    });
    expect(r.available).toBe(true);
    expect(r.score).toBeLessThan(40);
    expect(r.reasonCodes.length).toBeGreaterThan(0);
  });
});

describe('scoreDay indoor', () => {
  it('scores higher when outdoor conditions are poor', () => {
    const stormy = {
      ...base,
      tempMaxC: 12,
      precipMm: 25,
      precipProbPct: 80,
      windMaxKmh: 45,
      snowfallCm: 0,
      weatherCode: 65,
    };
    const indoor = scoreDay('INDOOR_SIGHTSEEING', stormy);
    const outdoor = scoreDay('OUTDOOR_SIGHTSEEING', stormy);
    expect(indoor.available).toBe(true);
    expect(indoor.score!).toBeGreaterThan(outdoor.score!);
  });
});
