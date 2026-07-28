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
  /** Ensures only one concurrent half-open probe after cool-down. */
  private halfOpenProbeInFlight = false;

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
      if (this.halfOpenProbeInFlight) {
        throw new CircuitOpenError();
      }
      this.state = 'half-open';
      this.halfOpenProbeInFlight = true;
    } else if (this.state === 'half-open' && this.halfOpenProbeInFlight) {
      throw new CircuitOpenError();
    } else if (this.state === 'half-open') {
      this.halfOpenProbeInFlight = true;
    }

    try {
      const result = await fn();
      this.consecutiveFailures = 0;
      this.state = 'closed';
      this.halfOpenProbeInFlight = false;
      return result;
    } catch (err) {
      // Caller cancellation must not count as a provider failure.
      if (isAbortError(err)) {
        this.halfOpenProbeInFlight = false;
        // Revert to open without resetting cool-down so the next caller can probe.
        if (this.state === 'half-open') {
          this.state = 'open';
        }
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
      this.halfOpenProbeInFlight = false;
      throw err;
    }
  }
}
