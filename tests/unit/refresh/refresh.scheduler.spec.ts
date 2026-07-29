import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RefreshScheduler } from '../../../src/refresh/refresh.scheduler';
import { RefreshService } from '../../../src/refresh/refresh.service';

describe('RefreshScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function makeScheduler(runCycle: jest.Mock, intervalMs = 1000) {
    const refresh = { runCycle } as unknown as RefreshService;
    const config = {
      get: (key: string, defaultValue?: number) => {
        if (key === 'refreshIntervalMs') return intervalMs;
        return defaultValue;
      },
    } as ConfigService;
    return new RefreshScheduler(refresh, config);
  }

  it('runs once on init and again on each interval tick', async () => {
    const runCycle = jest.fn().mockResolvedValue(undefined);
    const scheduler = makeScheduler(runCycle, 1000);

    scheduler.onModuleInit();
    await Promise.resolve();
    expect(runCycle).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(runCycle).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(1000);
    expect(runCycle).toHaveBeenCalledTimes(3);

    scheduler.onModuleDestroy();
  });

  it('skips overlapping cycles while a previous run is in flight', async () => {
    let resolveCycle!: () => void;
    const runCycle = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCycle = resolve;
        }),
    );
    const scheduler = makeScheduler(runCycle, 1000);

    scheduler.onModuleInit();
    await Promise.resolve();
    expect(runCycle).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(runCycle).toHaveBeenCalledTimes(1);

    resolveCycle();
    await Promise.resolve();
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(1000);
    expect(runCycle).toHaveBeenCalledTimes(2);

    scheduler.onModuleDestroy();
  });

  it('stops scheduling after destroy', async () => {
    const runCycle = jest.fn().mockResolvedValue(undefined);
    const scheduler = makeScheduler(runCycle, 1000);

    scheduler.onModuleInit();
    await Promise.resolve();
    expect(runCycle).toHaveBeenCalledTimes(1);

    scheduler.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(5000);
    expect(runCycle).toHaveBeenCalledTimes(1);
  });
});
