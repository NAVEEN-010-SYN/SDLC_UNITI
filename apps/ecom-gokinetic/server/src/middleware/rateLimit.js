'use strict';

const { RateLimitError } = require('../errors');

/**
 * Fixed-window in-memory rate limiter.
 *
 * Suitable for a single instance or as a per-pod safety net behind the API
 * gateway's distributed limiter. The store is injectable so a Redis-backed
 * implementation can replace it without touching routes.
 */
function createMemoryStore({ now = () => Date.now() } = {}) {
  const buckets = new Map();
  return {
    /**
     * Increments the counter for `key` in the current window.
     * @returns {{count: number, resetAt: number}}
     */
    hit(key, windowMs) {
      const t = now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= t) {
        bucket = { count: 0, resetAt: t + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      return { count: bucket.count, resetAt: bucket.resetAt };
    },
    /** Drops expired buckets so memory stays bounded. */
    sweep() {
      const t = now();
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= t) buckets.delete(key);
      }
    },
    size: () => buckets.size,
  };
}

const defaultKey = (req) => (req.user ? `user:${req.user.id}` : `ip:${req.ip}`);

/**
 * @param {object} options
 * @param {number} options.windowMs
 * @param {number} options.max requests per window
 * @param {string} [options.name] bucket namespace (e.g. "auth")
 * @param {(req) => string} [options.keyGenerator]
 * @param {object} [options.store]
 * @param {() => number} [options.now]
 */
function rateLimit({ windowMs, max, name = 'global', keyGenerator = defaultKey, store, now = () => Date.now() }) {
  const backing = store || createMemoryStore({ now });
  const sweepTimer = setInterval(() => backing.sweep(), Math.max(windowMs, 1000));
  if (sweepTimer.unref) sweepTimer.unref();

  const middleware = (req, res, next) => {
    const key = `${name}:${keyGenerator(req)}`;
    const { count, resetAt } = backing.hit(key, windowMs);
    const remaining = Math.max(0, max - count);
    const resetSeconds = Math.max(0, Math.ceil((resetAt - now()) / 1000));
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(remaining));
    res.set('RateLimit-Reset', String(resetSeconds));
    if (count > max) {
      res.set('Retry-After', String(resetSeconds));
      return next(new RateLimitError(resetSeconds));
    }
    return next();
  };
  middleware.stop = () => clearInterval(sweepTimer);
  return middleware;
}

module.exports = { rateLimit, createMemoryStore };
