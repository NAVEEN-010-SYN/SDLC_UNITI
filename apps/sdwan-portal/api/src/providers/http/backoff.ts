export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  /** Random source in [0,1); injectable for deterministic tests. */
  random?: () => number;
}

/**
 * "Full jitter" exponential backoff (AWS architecture blog): sleep a random amount in
 * [0, min(max, base * 2^attempt)]. Spreads retries from many pollers hitting the same
 * controller so they do not synchronise into bursts.
 */
export function backoffDelay(attempt: number, opts: BackoffOptions): number {
  const rnd = opts.random ?? Math.random;
  const ceiling = Math.min(opts.maxMs, opts.baseMs * 2 ** Math.max(0, attempt));
  return Math.floor(rnd() * ceiling);
}

/**
 * Parses a Retry-After header (delta-seconds or HTTP date). Returns milliseconds,
 * or undefined if absent/unparseable.
 */
export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return undefined;
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Minimal circuit breaker. After `failureThreshold` consecutive failures the circuit
 * opens and calls fail fast for `cooldownMs`; the next call after cooldown is a trial
 * (half-open) whose outcome closes or re-opens the circuit. Protects a degraded vendor
 * controller from being hammered by the metrics poller.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly failureThreshold = 5,
    private readonly cooldownMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    if (this.openedAt === null) return 'CLOSED';
    return this.now() - this.openedAt >= this.cooldownMs ? 'HALF_OPEN' : 'OPEN';
  }

  canRequest(): boolean {
    return this.state !== 'OPEN';
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure(): void {
    if (this.state === 'HALF_OPEN') {
      this.openedAt = this.now();
      return;
    }
    this.failures++;
    if (this.failures >= this.failureThreshold) this.openedAt = this.now();
  }

  retryInMs(): number {
    if (this.openedAt === null) return 0;
    return Math.max(0, this.cooldownMs - (this.now() - this.openedAt));
  }
}
