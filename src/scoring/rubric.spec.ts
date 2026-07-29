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
  it('scores ski-friendly snow day at golden 72', () => {
    const r = scoreDay('SKIING', base);
    expect(r.available).toBe(true);
    expect(r.score).toBe(72);
    expect(r.reasonCodes).toEqual([]);
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
    expect(r.score).toBe(0);
    expect(r.reasonCodes).toEqual(
      expect.arrayContaining(['TOO_WARM', 'NO_SNOW']),
    );
  });

  it('returns MISSING_TEMP when tempMaxC is null', () => {
    const r = scoreDay('SKIING', { ...base, tempMaxC: null });
    expect(r.available).toBe(false);
    expect(r.score).toBeNull();
    expect(r.reasonCodes).toContain('MISSING_TEMP');
  });
});

describe('scoreDay surfing', () => {
  it('returns NO_MARINE_DATA when wave height missing', () => {
    const r = scoreDay('SURFING', { ...base, waveHeightM: null });
    expect(r.available).toBe(false);
    expect(r.score).toBeNull();
    expect(r.reasonCodes).toContain('NO_MARINE_DATA');
  });

  it('scores moderate waves at golden 70', () => {
    const r = scoreDay('SURFING', {
      ...base,
      tempMaxC: 22,
      waveHeightM: 1.5,
      windMaxKmh: 20,
      precipMm: 0,
    });
    expect(r.available).toBe(true);
    expect(r.score).toBe(70);
    expect(r.reasonCodes).toEqual([]);
  });

  it('penalizes flat water toward 20 with FLAT', () => {
    const r = scoreDay('SURFING', { ...base, waveHeightM: 0.1 });
    expect(r.available).toBe(true);
    expect(r.score).toBe(30);
    expect(r.reasonCodes).toContain('FLAT');
  });

  it('penalizes large waves with TOO_BIG', () => {
    const r = scoreDay('SURFING', { ...base, waveHeightM: 5 });
    expect(r.available).toBe(true);
    expect(r.score).toBe(20);
    expect(r.reasonCodes).toContain('TOO_BIG');
  });
});

describe('scoreDay outdoor', () => {
  it('scores a mild clear day at golden 75', () => {
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
    expect(r.score).toBe(75);
    expect(r.reasonCodes).toEqual([]);
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
    expect(r.score).toBe(0);
    expect(r.reasonCodes).toEqual(
      expect.arrayContaining(['HEAVY_RAIN', 'HIGH_WIND', 'BAD_WEATHER']),
    );
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
    expect(indoor.score).toBe(90);
    expect(indoor.reasonCodes).toEqual(['POOR_OUTDOOR_WEATHER']);
    expect(outdoor.score).toBe(0);
    expect(indoor.score!).toBeGreaterThan(outdoor.score!);
  });

  it('emits GOOD_OUTDOOR_WEATHER when outdoor conditions are pleasant', () => {
    const pleasant = {
      ...base,
      tempMaxC: 22,
      precipMm: 0,
      precipProbPct: 5,
      windMaxKmh: 10,
      snowfallCm: 0,
      weatherCode: 1,
    };
    const indoor = scoreDay('INDOOR_SIGHTSEEING', pleasant);
    expect(indoor.reasonCodes).toEqual(['GOOD_OUTDOOR_WEATHER']);
  });
});
