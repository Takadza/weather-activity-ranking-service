import type { WeatherDay } from '../scoring/types';
import type { ForecastMeta } from './types';

export type ForecastCacheEntry = {
  days: WeatherDay[];
  meta: ForecastMeta;
  expiresAt: number;
};

/**
 * Process-local TTL + LRU cache for warm forecast reads (ADR-005a).
 */
export class ForecastCache {
  private readonly entries = new Map<string, ForecastCacheEntry>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number = 256,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(locationId: string): ForecastCacheEntry | null {
    const entry = this.entries.get(locationId);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(locationId);
      return null;
    }
    // Refresh LRU order.
    this.entries.delete(locationId);
    this.entries.set(locationId, entry);
    return entry;
  }

  set(locationId: string, days: WeatherDay[], meta: ForecastMeta): void {
    if (this.entries.has(locationId)) {
      this.entries.delete(locationId);
    }
    this.entries.set(locationId, {
      days,
      meta,
      expiresAt: this.now() + this.ttlMs,
    });
    this.evictIfNeeded();
  }

  invalidate(locationId: string): void {
    this.entries.delete(locationId);
  }

  /** Test helper: current entry count. */
  get size(): number {
    return this.entries.size;
  }

  private evictIfNeeded(): void {
    const max = Math.max(1, this.maxEntries);
    while (this.entries.size > max) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
