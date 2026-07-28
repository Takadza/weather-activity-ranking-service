export type ActivityType =
  | 'SKIING'
  | 'SURFING'
  | 'OUTDOOR_SIGHTSEEING'
  | 'INDOOR_SIGHTSEEING';

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  'SKIING',
  'SURFING',
  'OUTDOOR_SIGHTSEEING',
  'INDOOR_SIGHTSEEING',
] as const;

export type WeatherDay = {
  date: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipMm: number | null;
  precipProbPct: number | null;
  windMaxKmh: number | null;
  snowfallCm: number | null;
  waveHeightM: number | null;
  weatherCode: number | null;
};

export type DayScore = {
  date: string;
  score: number | null;
  available: boolean;
  reasonCodes: string[];
};

export type ActivityRanking = {
  activity: ActivityType;
  overallScore: number | null;
  rank: number;
  days: DayScore[];
};

export const RUBRIC_VERSION = '2026-07-28.1';

export function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
