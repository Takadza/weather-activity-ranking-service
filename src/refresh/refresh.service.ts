import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenMeteoClient } from '../open-meteo/client';
import { ForecastsRepository } from '../store/forecasts.repository';
import { LocationsRepository } from '../store/locations.repository';
import { RefreshMetaRepository } from '../store/refresh-meta.repository';
import type { LocationRow } from '../store/types';

const FAILURE_SUMMARY_MAX = 2000;

@Injectable()
export class RefreshService {
  private readonly logger = new Logger(RefreshService.name);

  constructor(
    private readonly locations: LocationsRepository,
    private readonly forecasts: ForecastsRepository,
    private readonly refreshMeta: RefreshMetaRepository,
    private readonly openMeteo: OpenMeteoClient,
    private readonly config: ConfigService,
  ) {}

  async runCycle(): Promise<void> {
    const tracked = await this.locations.listTrackedLocations();
    const configured = this.config.get<number>('refreshConcurrency', 5);
    const concurrency =
      Number.isFinite(configured) && configured > 0
        ? Math.floor(configured)
        : 5;
    const failures: string[] = [];

    await mapPool(tracked, concurrency, async (location) => {
      try {
        await this.refreshLocation(location);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Refresh failed for location ${location.id}: ${message}`,
        );
        failures.push(`${location.id}: ${message}`);
      }
    });

    if (failures.length === 0) {
      await this.refreshMeta.recordRefreshSuccess();
      return;
    }

    const summary = failures.join('; ').slice(0, FAILURE_SUMMARY_MAX);
    await this.refreshMeta.recordRefreshFailure(summary);
  }

  private async refreshLocation(location: LocationRow): Promise<void> {
    const days = await this.openMeteo.fetchForecast(
      location.latitude,
      location.longitude,
    );
    if (days.length > 0) {
      await this.forecasts.upsertForecastDays(location.id, days);
    }
  }
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
}
