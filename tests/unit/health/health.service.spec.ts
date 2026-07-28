import { ConfigService } from '@nestjs/config';
import { HealthService } from '../../../src/health/health.service';
import type { RefreshMetaRow } from '../../../src/store/types';

const STALE_AFTER = 21600;

function meta(
  overrides: Partial<RefreshMetaRow> = {},
): RefreshMetaRow {
  return {
    id: 1,
    lastSuccessAt: null,
    lastAttemptAt: null,
    lastError: null,
    ...overrides,
  };
}

function makeService(overrides: {
  refreshMeta?: RefreshMetaRow;
  trackedLocationCount?: number;
  staleAfterSeconds?: number;
  now?: Date;
} = {}) {
  const getRefreshMeta = jest
    .fn()
    .mockResolvedValue(overrides.refreshMeta ?? meta());
  const countTrackedLocations = jest
    .fn()
    .mockResolvedValue(overrides.trackedLocationCount ?? 0);

  const service = new HealthService(
    { getRefreshMeta } as never,
    { countTrackedLocations } as never,
    {
      get: (key: string, defaultValue?: number) => {
        if (key === 'staleAfterSeconds') {
          return overrides.staleAfterSeconds ?? STALE_AFTER;
        }
        return defaultValue;
      },
    } as ConfigService,
  );

  if (overrides.now) {
    jest.useFakeTimers({ now: overrides.now });
  }

  return { service, getRefreshMeta, countTrackedLocations };
}

describe('HealthService.getHealth', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns ok when no locations are tracked', async () => {
    const { service } = makeService({
      trackedLocationCount: 0,
      refreshMeta: meta({ lastSuccessAt: null, lastError: 'boom' }),
    });

    const result = await service.getHealth();

    expect(result.status).toBe('ok');
    expect(result.refresh.trackedLocationCount).toBe(0);
    expect(result.refresh.lastError).toBe('boom');
  });

  it('returns degraded when tracked and lastSuccessAt is null', async () => {
    const { service } = makeService({
      trackedLocationCount: 3,
      refreshMeta: meta({ lastSuccessAt: null }),
    });

    const result = await service.getHealth();

    expect(result.status).toBe('degraded');
    expect(result.refresh.trackedLocationCount).toBe(3);
    expect(result.refresh.lastSuccessAt).toBeNull();
  });

  it('returns degraded when tracked and lastSuccessAt is older than threshold', async () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const lastSuccessAt = new Date(
      now.getTime() - (STALE_AFTER + 1) * 1000,
    );
    const { service } = makeService({
      trackedLocationCount: 1,
      now,
      refreshMeta: meta({
        lastSuccessAt,
        lastAttemptAt: lastSuccessAt,
      }),
    });

    const result = await service.getHealth();

    expect(result.status).toBe('degraded');
    expect(result.refresh.lastSuccessAt).toBe(lastSuccessAt.toISOString());
  });

  it('returns degraded when tracked, lastError set, and lastAttemptAt within threshold', async () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const lastSuccessAt = new Date(now.getTime() - 60 * 1000);
    const lastAttemptAt = new Date(now.getTime() - 30 * 1000);
    const { service } = makeService({
      trackedLocationCount: 2,
      now,
      refreshMeta: meta({
        lastSuccessAt,
        lastAttemptAt,
        lastError: 'provider down',
      }),
    });

    const result = await service.getHealth();

    expect(result.status).toBe('degraded');
    expect(result.refresh.lastError).toBe('provider down');
    expect(result.refresh.lastAttemptAt).toBe(lastAttemptAt.toISOString());
  });

  it('returns ok when tracked, success fresh, and no recent error', async () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const lastSuccessAt = new Date(now.getTime() - 60 * 1000);
    const { service } = makeService({
      trackedLocationCount: 5,
      now,
      refreshMeta: meta({
        lastSuccessAt,
        lastAttemptAt: lastSuccessAt,
        lastError: null,
      }),
    });

    const result = await service.getHealth();

    expect(result).toEqual({
      status: 'ok',
      refresh: {
        lastSuccessAt: lastSuccessAt.toISOString(),
        lastAttemptAt: lastSuccessAt.toISOString(),
        lastError: null,
        trackedLocationCount: 5,
      },
    });
  });

  it('returns ok when success age equals staleAfterSeconds', async () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const lastSuccessAt = new Date(now.getTime() - STALE_AFTER * 1000);
    const { service } = makeService({
      trackedLocationCount: 1,
      now,
      refreshMeta: meta({
        lastSuccessAt,
        lastAttemptAt: lastSuccessAt,
        lastError: null,
      }),
    });

    const result = await service.getHealth();

    expect(result.status).toBe('ok');
  });
});
