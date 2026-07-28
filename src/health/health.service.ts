import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocationsRepository } from '../store/locations.repository';
import { RefreshMetaRepository } from '../store/refresh-meta.repository';

export type HealthRefreshPayload = {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  trackedLocationCount: number;
};

export type HealthPayload = {
  status: 'ok' | 'degraded';
  refresh: HealthRefreshPayload;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly refreshMeta: RefreshMetaRepository,
    private readonly locations: LocationsRepository,
    private readonly config: ConfigService,
  ) {}

  async getHealth(): Promise<HealthPayload> {
    const [meta, trackedLocationCount] = await Promise.all([
      this.refreshMeta.getRefreshMeta(),
      this.locations.countTrackedLocations(),
    ]);

    const staleAfterSeconds = this.config.get<number>(
      'staleAfterSeconds',
      21600,
    );
    const now = Date.now();

    const lastSuccessAt = meta.lastSuccessAt
      ? meta.lastSuccessAt.toISOString()
      : null;
    const lastAttemptAt = meta.lastAttemptAt
      ? meta.lastAttemptAt.toISOString()
      : null;

    const status = this.computeStatus({
      trackedLocationCount,
      lastSuccessAt: meta.lastSuccessAt,
      lastAttemptAt: meta.lastAttemptAt,
      lastError: meta.lastError,
      staleAfterSeconds,
      now,
    });

    return {
      status,
      refresh: {
        lastSuccessAt,
        lastAttemptAt,
        lastError: meta.lastError,
        trackedLocationCount,
      },
    };
  }

  private computeStatus(input: {
    trackedLocationCount: number;
    lastSuccessAt: Date | null;
    lastAttemptAt: Date | null;
    lastError: string | null;
    staleAfterSeconds: number;
    now: number;
  }): 'ok' | 'degraded' {
    if (input.trackedLocationCount === 0) {
      return 'ok';
    }

    const successAgeSeconds =
      input.lastSuccessAt === null
        ? null
        : Math.floor((input.now - input.lastSuccessAt.getTime()) / 1000);

    if (
      input.lastSuccessAt === null ||
      (successAgeSeconds !== null &&
        successAgeSeconds > input.staleAfterSeconds)
    ) {
      return 'degraded';
    }

    if (input.lastError != null && input.lastAttemptAt != null) {
      const attemptAgeSeconds = Math.floor(
        (input.now - input.lastAttemptAt.getTime()) / 1000,
      );
      if (attemptAgeSeconds <= input.staleAfterSeconds) {
        return 'degraded';
      }
    }

    return 'ok';
  }
}
