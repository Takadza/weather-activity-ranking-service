import { Injectable } from '@nestjs/common';
import {
  ACTIVITY_TYPES,
  ActivityRanking,
  ActivityType,
  DayScore,
  WeatherDay,
  clamp,
} from './types';

export { RUBRIC_VERSION } from './types';

function scoreSkiing(day: WeatherDay): DayScore {
  if (day.tempMaxC === null) {
    return {
      date: day.date,
      available: false,
      score: null,
      reasonCodes: ['MISSING_TEMP'],
    };
  }

  let score = 20;
  const reasonCodes: string[] = [];
  const tempMaxC = day.tempMaxC;

  if (tempMaxC >= -15 && tempMaxC <= 5) {
    score += 20;
  } else if (tempMaxC > 5) {
    reasonCodes.push('TOO_WARM');
  } else {
    reasonCodes.push('TOO_COLD');
  }

  const snowfallCm = day.snowfallCm ?? 0;
  score += Math.min(40, snowfallCm * 4);
  if (snowfallCm <= 0) {
    reasonCodes.push('NO_SNOW');
  }

  const precipMm = day.precipMm ?? 0;
  if (tempMaxC > 2 && precipMm > 5) {
    score -= Math.min(30, precipMm);
  }

  const windMaxKmh = day.windMaxKmh ?? 0;
  if (windMaxKmh > 40) {
    score -= 15;
    reasonCodes.push('HIGH_WIND');
  }

  return {
    date: day.date,
    available: true,
    score: clamp(score),
    reasonCodes,
  };
}

function scoreSurfing(day: WeatherDay): DayScore {
  if (day.waveHeightM === null) {
    return {
      date: day.date,
      available: false,
      score: null,
      reasonCodes: ['NO_MARINE_DATA'],
    };
  }

  const waveHeightM = day.waveHeightM;
  const reasonCodes: string[] = [];
  let score: number;

  if (waveHeightM >= 0.5 && waveHeightM <= 2.5) {
    score = 70;
  } else if (waveHeightM < 0.5) {
    // Linear from 20 at 0m to 70 at 0.5m
    score = 20 + (waveHeightM / 0.5) * 50;
    reasonCodes.push('FLAT');
  } else {
    score = Math.max(20, 70 - (waveHeightM - 2.5) * 20);
    reasonCodes.push('TOO_BIG');
  }

  if ((day.windMaxKmh ?? 0) > 45) {
    score -= 20;
    reasonCodes.push('HIGH_WIND');
  }

  if ((day.precipMm ?? 0) > 15) {
    score -= 10;
  }

  return {
    date: day.date,
    available: true,
    score: clamp(score),
    reasonCodes,
  };
}

function scoreOutdoor(day: WeatherDay): DayScore {
  if (day.tempMaxC === null) {
    return {
      date: day.date,
      available: false,
      score: null,
      reasonCodes: ['MISSING_TEMP'],
    };
  }

  let score = 35;
  const reasonCodes: string[] = [];
  const tempMaxC = day.tempMaxC;

  if (tempMaxC >= 10 && tempMaxC <= 28) {
    score += 30;
  } else if (tempMaxC > 28) {
    reasonCodes.push('TOO_HOT');
  } else {
    reasonCodes.push('TOO_COLD');
  }

  const precipMm = day.precipMm ?? 0;
  if (precipMm > 0) {
    score -= Math.min(40, precipMm * 3);
    if (precipMm > 5) {
      reasonCodes.push('HEAVY_RAIN');
    }
  }

  if ((day.precipProbPct ?? 0) > 40) {
    score -= 10;
  }

  if ((day.windMaxKmh ?? 0) > 30) {
    score -= 15;
    reasonCodes.push('HIGH_WIND');
  }

  if (day.weatherCode != null && day.weatherCode >= 60) {
    score -= 25;
    reasonCodes.push('BAD_WEATHER');
  } else if (day.weatherCode != null && day.weatherCode <= 3) {
    score += 10;
  }

  return {
    date: day.date,
    available: true,
    score: clamp(score),
    reasonCodes,
  };
}

function scoreIndoor(day: WeatherDay): DayScore {
  if (day.tempMaxC === null) {
    return {
      date: day.date,
      available: false,
      score: null,
      reasonCodes: ['MISSING_TEMP'],
    };
  }

  let score = 50;
  const reasonCodes: string[] = [];
  const tempMaxC = day.tempMaxC;

  if (tempMaxC < 10 || tempMaxC > 28) {
    score += 20;
  } else {
    score -= 15;
  }

  const precipMm = day.precipMm ?? 0;
  if (precipMm > 5) {
    score += 25;
  } else if (precipMm === 0) {
    score -= 10;
  }

  if ((day.windMaxKmh ?? 0) > 30) {
    score += 10;
  }

  if (day.weatherCode != null && day.weatherCode >= 60) {
    score += 20;
  } else if (day.weatherCode != null && day.weatherCode <= 3) {
    score -= 15;
  }

  return {
    date: day.date,
    available: true,
    score: clamp(score),
    reasonCodes,
  };
}

export function scoreDay(activity: ActivityType, day: WeatherDay): DayScore {
  switch (activity) {
    case 'SKIING':
      return scoreSkiing(day);
    case 'SURFING':
      return scoreSurfing(day);
    case 'OUTDOOR_SIGHTSEEING':
      return scoreOutdoor(day);
    case 'INDOOR_SIGHTSEEING':
      return scoreIndoor(day);
  }
}

export function scoreAll(days: WeatherDay[]): ActivityRanking[] {
  const rankings: Omit<ActivityRanking, 'rank'>[] = ACTIVITY_TYPES.map(
    (activity) => {
      const dayScores = days.map((d) => scoreDay(activity, d));
      const availableScores = dayScores
        .filter((d) => d.available && d.score !== null)
        .map((d) => d.score as number);
      const overallScore =
        availableScores.length === 0
          ? null
          : availableScores.reduce((a, b) => a + b, 0) /
            availableScores.length;

      return {
        activity,
        overallScore,
        days: dayScores,
      };
    },
  );

  const activityOrder = new Map(
    ACTIVITY_TYPES.map((activity, index) => [activity, index]),
  );

  rankings.sort((a, b) => {
    if (a.overallScore === null && b.overallScore === null) {
      return (
        (activityOrder.get(a.activity) ?? 0) -
        (activityOrder.get(b.activity) ?? 0)
      );
    }
    if (a.overallScore === null) return 1;
    if (b.overallScore === null) return -1;
    if (b.overallScore !== a.overallScore) {
      return b.overallScore - a.overallScore;
    }
    return (
      (activityOrder.get(a.activity) ?? 0) -
      (activityOrder.get(b.activity) ?? 0)
    );
  });

  return rankings.map((r, index) => ({
    ...r,
    rank: index + 1,
  }));
}

@Injectable()
export class ScoringService {
  scoreDay(activity: ActivityType, day: WeatherDay): DayScore {
    return scoreDay(activity, day);
  }

  scoreAll(days: WeatherDay[]): ActivityRanking[] {
    return scoreAll(days);
  }
}
