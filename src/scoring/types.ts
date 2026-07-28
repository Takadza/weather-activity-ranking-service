export type ActivityType =
  'SKIING' | 'SURFING' | 'OUTDOOR_SIGHTSEEING' | 'INDOOR_SIGHTSEEING';

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  'SKIING',
  'SURFING',
  'OUTDOOR_SIGHTSEEING',
  'INDOOR_SIGHTSEEING',
] as const;

export type ReasonCode =
  | 'MISSING_TEMP'
  | 'TOO_WARM'
  | 'TOO_COLD'
  | 'NO_SNOW'
  | 'HIGH_WIND'
  | 'NO_MARINE_DATA'
  | 'FLAT'
  | 'TOO_BIG'
  | 'TOO_HOT'
  | 'HEAVY_RAIN'
  | 'BAD_WEATHER';

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
  reasonCodes: ReasonCode[];
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
