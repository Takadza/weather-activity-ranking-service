import { scoreAll } from './scoring.service';

describe('scoreAll ranking', () => {
  it('ranks outdoor above indoor on a mild clear day', () => {
    const days = [
      {
        date: '2026-07-28',
        tempMaxC: 22,
        tempMinC: 14,
        precipMm: 0,
        precipProbPct: 5,
        windMaxKmh: 10,
        snowfallCm: 0,
        waveHeightM: null,
        weatherCode: 1,
      },
    ];
    const rankings = scoreAll(days);
    const outdoor = rankings.find((r) => r.activity === 'OUTDOOR_SIGHTSEEING')!;
    const indoor = rankings.find((r) => r.activity === 'INDOOR_SIGHTSEEING')!;
    expect(outdoor.overallScore).toBe(75);
    expect(indoor.overallScore).toBe(10);
    expect(outdoor.rank).toBeLessThan(indoor.rank);
    expect(rankings.map((r) => r.rank).sort()).toEqual([1, 2, 3, 4]);
  });

  it('leaves surfing overallScore null when all days lack marine data', () => {
    const rankings = scoreAll([
      {
        date: '2026-07-28',
        tempMaxC: 20,
        tempMinC: 12,
        precipMm: 0,
        precipProbPct: 0,
        windMaxKmh: 5,
        snowfallCm: 0,
        waveHeightM: null,
        weatherCode: 0,
      },
    ]);
    const surf = rankings.find((r) => r.activity === 'SURFING')!;
    expect(surf.overallScore).toBeNull();
    expect(surf.rank).toBe(4);
  });

  it('averages only available daily scores for overallScore', () => {
    const rankings = scoreAll([
      {
        date: '2026-07-28',
        tempMaxC: 22,
        tempMinC: 14,
        precipMm: 0,
        precipProbPct: 5,
        windMaxKmh: 10,
        snowfallCm: 0,
        waveHeightM: 1.5,
        weatherCode: 1,
      },
      {
        date: '2026-07-29',
        tempMaxC: 22,
        tempMinC: 14,
        precipMm: 0,
        precipProbPct: 5,
        windMaxKmh: 10,
        snowfallCm: 0,
        waveHeightM: null,
        weatherCode: 1,
      },
    ]);
    const surf = rankings.find((r) => r.activity === 'SURFING')!;
    // Day 1 available (70); day 2 NO_MARINE_DATA — mean of available only
    expect(surf.overallScore).toBe(70);
    expect(surf.days[0].available).toBe(true);
    expect(surf.days[1].available).toBe(false);
  });
});
