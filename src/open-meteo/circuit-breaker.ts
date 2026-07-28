export type CircuitBreakerOptions = {
  failureThreshold?: number;
  coolDownMs?: number;
  now?: () => number;
};

type CircuitState = 'closed' | 'open' | 'half-open';

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

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.now() - this.openedAt < this.coolDownMs) {
        throw new Error('Circuit open');
      }
      this.state = 'half-open';
    }

    try {
      const result = await fn();
      this.consecutiveFailures = 0;
      this.state = 'closed';
      return result;
    } catch (err) {
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
