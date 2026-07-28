export type CircuitBreakerOptions = {
  failureThreshold?: number;
  coolDownMs?: number;
  now?: () => number;
};

type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitOpenError extends Error {
  readonly name = 'CircuitOpenError';

  constructor(message = 'Circuit open') {
    super(message);
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly coolDownMs: number;
  private readonly now: () => number;

  private consecutiveFailures = 0;
  private state: CircuitState = 'closed';
  private openedAt = 0;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.coolDownMs = opts.coolDownMs ?? 30_000;
    this.now = opts.now ?? (() => Date.now());
  }

  getState(): CircuitState {
    return this.state;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.now() - this.openedAt < this.coolDownMs) {
        throw new CircuitOpenError();
      }
      this.state = 'half-open';
    }

    try {
      const result = await fn();
      this.consecutiveFailures = 0;
      this.state = 'closed';
      return result;
    } catch (err) {
      // Caller cancellation must not count as a provider failure.
      if (isAbortError(err)) {
        throw err;
      }
      this.consecutiveFailures += 1;
      if (
        this.state === 'half-open' ||
        this.consecutiveFailures >= this.failureThreshold
      ) {
        this.state = 'open';
        this.openedAt = this.now();
      }
      throw err;
    }
  }
}
