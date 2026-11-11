import { SlidingWindowRateLimiter } from './rateLimiter';

describe('SlidingWindowRateLimiter edge cases', () => {
  let now: number;
  const clock = () => now;

  beforeEach(() => {
    now = 5_000_000;
  });

  it('never tells a client to retry in less than one second', () => {
    const limiter = new SlidingWindowRateLimiter(10_000, 1, clock);
    limiter.hit('u');
    now += 9_999;
    expect(limiter.hit('u')).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 1, limit: 1 });
  });

  it('does not let denied attempts extend the lockout', () => {
    const limiter = new SlidingWindowRateLimiter(10_000, 1, clock);
    limiter.hit('u');
    for (let i = 0; i < 5; i += 1) {
      now += 1_000;
      expect(limiter.hit('u').allowed).toBe(false);
    }
    now += 5_001;
    expect(limiter.hit('u').allowed).toBe(true);
  });

  it('treats a hit exactly one window old as expired', () => {
    const limiter = new SlidingWindowRateLimiter(1_000, 1, clock);
    limiter.hit('u');
    now += 1_000;
    expect(limiter.hit('u').allowed).toBe(true);
  });

  it('restores the full budget after reset', () => {
    const limiter = new SlidingWindowRateLimiter(60_000, 2, clock);
    limiter.hit('u');
    limiter.hit('u');
    limiter.reset('u');
    expect(limiter.hit('u')).toMatchObject({ allowed: true, remaining: 1 });
  });

  it('keeps active keys during a sweep and frees memory for idle ones', () => {
    const limiter = new SlidingWindowRateLimiter(1_000, 3, clock);
    for (let i = 0; i < 100; i += 1) limiter.hit(`ip:10.0.0.${i}`);
    now += 1_001;
    limiter.hit('user:active');
    expect(limiter.sweep()).toBe(100);
    expect(limiter.size).toBe(1);
  });
});
