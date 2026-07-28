import {
  CircuitBreaker,
  CircuitOpenError,
} from '../../../src/open-meteo/circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens after threshold failures and rejects fast', async () => {
    const b = new CircuitBreaker({ failureThreshold: 3, coolDownMs: 60_000 });
    const fail = (): Promise<never> => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) {
      await expect(b.exec(fail)).rejects.toThrow('boom');
    }
    await expect(b.exec(() => Promise.resolve('ok'))).rejects.toThrow(
      CircuitOpenError,
    );
    await expect(b.exec(() => Promise.resolve('ok'))).rejects.toThrow(
      /circuit/i,
    );
  });

  it('allows a half-open probe after cool-down', async () => {
    const b = new CircuitBreaker({ failureThreshold: 3, coolDownMs: 60_000 });
    const fail = (): Promise<never> => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) {
      await expect(b.exec(fail)).rejects.toThrow('boom');
    }

    jest.advanceTimersByTime(60_000);

    await expect(b.exec(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('does not count AbortError toward opening the circuit', async () => {
    const b = new CircuitBreaker({ failureThreshold: 1, coolDownMs: 60_000 });
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    await expect(b.exec(() => Promise.reject(abort))).rejects.toThrow(
      'aborted',
    );
    await expect(b.exec(() => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(b.getState()).toBe('closed');
  });
});
