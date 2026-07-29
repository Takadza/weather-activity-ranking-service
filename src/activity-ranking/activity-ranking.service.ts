import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BadUserInputError } from '../geocoding/errors';
import { GeocodingService } from '../geocoding/geocoding.service';
import type {
  ResolveLocationInput,
  ResolveLocationResult,
} from '../geocoding/resolve';
import { MetricsService } from '../metrics/metrics.service';
import { CircuitOpenError } from '../open-meteo/circuit-breaker';
import { HttpError, OpenMeteoClient } from '../open-meteo/client';
import { RUBRIC_VERSION, ScoringService } from '../scoring/scoring.service';
import type { WeatherDay } from '../scoring/types';
import { ForecastsRepository } from '../store/forecasts.repository';
import type { LocationRow } from '../store/types';
import { ProviderUnavailableError } from './errors';

export type ActivityRankingPayload = {
  location: LocationRow;
  alternatives: LocationRow[];
  rankings: ReturnType<ScoringService['scoreAll']>;
  rubricVersion: string;
  lastUpdated: Date;
  dataAgeSeconds: number;
  stale: boolean;
};

function isProviderFailure(err: unknown): boolean {
  if (err instanceof HttpError || err instanceof CircuitOpenError) {
    return true;
  }
  return err instanceof Error && err.name === 'AbortError';
}

@Injectable()
export class ActivityRankingService {
  private readonly logger = new Logger(ActivityRankingService.name);
  private readonly coldStartInflight = new Map<string, Promise<WeatherDay[]>>();
  private coldStartInFlightCount = 0;

  constructor(
    private readonly geocoding: GeocodingService,
    private readonly forecasts: ForecastsRepository,
    private readonly openMeteo: OpenMeteoClient,
    private readonly scoring: ScoringService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  async rank(input: ResolveLocationInput): Promise<ActivityRankingPayload> {
    let resolved: ResolveLocationResult;
    try {
      resolved = await this.geocoding.resolve(input);
    } catch (err) {
      if (err instanceof BadUserInputError) {
        throw err;
      }
      if (isProviderFailure(err)) {
        this.metrics.increment('provider_errors_total');
        throw new ProviderUnavailableError();
      }
      throw err;
    }

    const { location, alternatives } = resolved;
    let days = await this.forecasts.getForecastDays(location.id);

    if (days.length === 0) {
      days = await this.coldStart(location);
    }

    if (days.length === 0) {
      this.metrics.increment('provider_errors_total');
      throw new ProviderUnavailableError();
    }

    const meta = await this.forecasts.getForecastMeta(location.id);
    if (!meta.fetchedAt) {
      this.metrics.increment('provider_errors_total');
      throw new ProviderUnavailableError();
    }

    const now = Date.now();
    const dataAgeSeconds = Math.floor((now - meta.fetchedAt.getTime()) / 1000);
    const staleAfterSeconds = this.config.get<number>(
      'staleAfterSeconds',
      21600,
    );

    return {
      location,
      alternatives,
      rankings: this.scoring.scoreAll(days),
      rubricVersion: RUBRIC_VERSION,
      lastUpdated: meta.fetchedAt,
      dataAgeSeconds,
      stale: dataAgeSeconds > staleAfterSeconds,
    };
  }

  private coldStart(location: LocationRow): Promise<WeatherDay[]> {
    const existing = this.coldStartInflight.get(location.id);
    if (existing) {
      return existing;
    }

    const pending = this.runColdStart(location).finally(() => {
      this.coldStartInflight.delete(location.id);
    });
    this.coldStartInflight.set(location.id, pending);
    return pending;
  }

  private async runColdStart(location: LocationRow): Promise<WeatherDay[]> {
    const maxConcurrent = this.config.get<number>('coldStartMaxConcurrent', 10);
    if (this.coldStartInFlightCount >= maxConcurrent) {
      this.logger.warn(
        `Cold-start rejected for location ${location.id}: concurrency limit`,
      );
      this.metrics.increment('cold_start_rejects_total');
      return this.forecasts.getForecastDays(location.id);
    }

    this.coldStartInFlightCount += 1;
    this.metrics.increment('cold_starts_total');
    const timeoutMs = this.config.get<number>('coldStartTimeoutMs', 3000);
    try {
      let fetched: WeatherDay[];
      try {
        fetched = await this.openMeteo.fetchForecast(
          location.latitude,
          location.longitude,
          { signal: AbortSignal.timeout(timeoutMs) },
        );
      } catch (err) {
        this.logger.warn(
          `Cold-start forecast fetch failed for location ${location.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        this.metrics.increment('provider_errors_total');
        return this.forecasts.getForecastDays(location.id);
      }

      if (fetched.length > 0) {
        await this.forecasts.upsertForecastDays(location.id, fetched);
      }
      return this.forecasts.getForecastDays(location.id);
    } finally {
      this.coldStartInFlightCount -= 1;
    }
  }
}
