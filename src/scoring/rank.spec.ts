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
    expect(outdoor.overallScore!).toBeGreaterThan(indoor.overallScore!);
    expect(outdoor.rank).toBeLessThan(indoor.rank);
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
  });
});
