/**
 * Sliding-window-log rate limiter keyed by user (or IP for anonymous traffic).
 * Shared by the REST message endpoint and the WebSocket gateway so a client
 * cannot bypass limits by switching transport.
 *
 * Memory is bounded: timestamps outside the window are pruned on every hit,
 * and idle keys are swept periodically.
 */

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  /** Seconds until the next message would be allowed (0 when allowed). */
  retryAfterSeconds: number;
  limit: number;
}

export interface RateLimiter {
  hit(key: string): RateLimitDecision;
  reset(key: string): void;
}

export class SlidingWindowRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
    private readonly now: () => number = Date.now,
  ) {
    if (windowMs <= 0 || max <= 0) throw new RangeError('windowMs and max must be positive');
  }

  hit(key: string): RateLimitDecision {
    const now = this.now();
    const windowStart = now - this.windowMs;
    const log = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (log.length >= this.max) {
      this.hits.set(key, log);
      const retryAfterMs = log[0] + this.windowMs - now;
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)), limit: this.max };
    }

    log.push(now);
    this.hits.set(key, log);
    return { allowed: true, remaining: this.max - log.length, retryAfterSeconds: 0, limit: this.max };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Removes keys with no hits inside the window. Returns the number removed. */
  sweep(): number {
    const windowStart = this.now() - this.windowMs;
    let removed = 0;
    for (const [key, log] of this.hits) {
      if (log.length === 0 || log[log.length - 1] <= windowStart) {
        this.hits.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.hits.size;
  }
}
