import { SlidingWindowRateLimiter } from './rateLimiter';

describe('SlidingWindowRateLimiter', () => {
  let now = 0;
  const clock = () => now;

  beforeEach(() => {
    now = 1_000_000;
  });

  it('allows up to max hits within the window', () => {
    const limiter = new SlidingWindowRateLimiter(60_000, 3, clock);
    expect(limiter.hit('u').remaining).toBe(2);
    expect(limiter.hit('u').remaining).toBe(1);
    expect(limiter.hit('u').remaining).toBe(0);
    const denied = limiter.hit('u');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(60);
  });

  it('slides the window rather than resetting at fixed boundaries', () => {
    const limiter = new SlidingWindowRateLimiter(10_000, 2, clock);
    limiter.hit('u');
    now += 6_000;
    limiter.hit('u');
    now += 2_000;
    const denied = limiter.hit('u');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(2);
    now += 2_001;
    expect(limiter.hit('u').allowed).toBe(true);
  });

  it('keeps keys independent', () => {
    const limiter = new SlidingWindowRateLimiter(1_000, 1, clock);
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('b').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(false);
  });

  it('sweeps idle keys', () => {
    const limiter = new SlidingWindowRateLimiter(1_000, 5, clock);
    limiter.hit('a');
    limiter.hit('b');
    now += 500;
    limiter.hit('b');
    now += 600;
    expect(limiter.sweep()).toBe(1);
    expect(limiter.size).toBe(1);
  });

  it('rejects invalid configuration', () => {
    expect(() => new SlidingWindowRateLimiter(0, 1)).toThrow(RangeError);
  });
});
