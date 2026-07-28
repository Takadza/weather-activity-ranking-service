import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLError } from 'graphql';
import { BadUserInputError } from '../geocoding/errors';
import { GeocodingService } from '../geocoding/geocoding.service';
import type {
  ResolveLocationInput,
  ResolveLocationResult,
} from '../geocoding/resolve';
import { OpenMeteoClient } from '../open-meteo/client';
import { RUBRIC_VERSION, ScoringService } from '../scoring/scoring.service';
import type { WeatherDay } from '../scoring/types';
import { ForecastsRepository } from '../store/forecasts.repository';
import type { LocationRow } from '../store/types';

export type ActivityRankingPayload = {
  location: LocationRow;
  alternatives: LocationRow[];
  rankings: ReturnType<ScoringService['scoreAll']>;
  rubricVersion: string;
  lastUpdated: Date;
  dataAgeSeconds: number;
  stale: boolean;
};

@Injectable()
export class ActivityRankingService {
  private readonly logger = new Logger(ActivityRankingService.name);

  constructor(
    private readonly geocoding: GeocodingService,
    private readonly forecasts: ForecastsRepository,
    private readonly openMeteo: OpenMeteoClient,
    private readonly scoring: ScoringService,
    private readonly config: ConfigService,
  ) {}

  async rank(input: ResolveLocationInput): Promise<ActivityRankingPayload> {
    let resolved: ResolveLocationResult;
    try {
      resolved = await this.geocoding.resolve(input);
    } catch (err) {
      if (err instanceof BadUserInputError) {
        throw new GraphQLError(err.message, {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      throw err;
    }

    const { location, alternatives } = resolved;
    let days = await this.forecasts.getForecastDays(location.id);

    if (days.length === 0) {
      days = await this.coldStart(location);
    }

    if (days.length === 0) {
      throw providerUnavailable();
    }

    const meta = await this.forecasts.getForecastMeta(location.id);
    if (!meta.fetchedAt) {
      throw providerUnavailable();
    }

    const now = Date.now();
    const dataAgeSeconds = Math.floor(
      (now - meta.fetchedAt.getTime()) / 1000,
    );
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

  private async coldStart(location: LocationRow): Promise<WeatherDay[]> {
    const timeoutMs = this.config.get<number>('coldStartTimeoutMs', 3000);
    let fetched: WeatherDay[];
    try {
      fetched = await this.openMeteo.fetchForecast(
        location.latitude,
        location.longitude,
        { signal: AbortSignal.timeout(timeoutMs) },
      );
    } catch (err) {
      // Provider/timeout failures surface as PROVIDER_UNAVAILABLE when still empty.
      this.logger.warn(
        `Cold-start forecast fetch failed for location ${location.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return this.forecasts.getForecastDays(location.id);
    }

    // Persistence errors must propagate — do not mislabel as provider failure.
    if (fetched.length > 0) {
      await this.forecasts.upsertForecastDays(location.id, fetched);
    }
    return this.forecasts.getForecastDays(location.id);
  }
}

function providerUnavailable(): GraphQLError {
  return new GraphQLError('Weather provider unavailable', {
    extensions: { code: 'PROVIDER_UNAVAILABLE' },
  });
}
