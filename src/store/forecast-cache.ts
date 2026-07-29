import type { WeatherDay } from '../scoring/types';
import type { ForecastMeta } from './types';

export type ForecastCacheEntry = {
  days: WeatherDay[];
  meta: ForecastMeta;
  expiresAt: number;
};

/**
 * Process-local TTL cache for warm forecast reads (ADR-005).
 */
export class ForecastCache {
  private readonly entries = new Map<string, ForecastCacheEntry>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(locationId: string): ForecastCacheEntry | null {
    const entry = this.entries.get(locationId);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(locationId);
      return null;
    }
    return entry;
  }

  set(locationId: string, days: WeatherDay[], meta: ForecastMeta): void {
    this.entries.set(locationId, {
      days,
      meta,
      expiresAt: this.now() + this.ttlMs,
    });
  }

  invalidate(locationId: string): void {
    this.entries.delete(locationId);
  }
}
