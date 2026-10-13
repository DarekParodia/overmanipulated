import { describe, expect, it } from 'bun:test';
import { createRateLimiter } from './rate-limit.ts';

describe('rate limiter', () => {
  it('allows a burst, then refills over time', () => {
    let time = 0;
    const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 1, now: () => time });
    expect([1, 2, 3, 4].map(() => limiter.take('a'))).toEqual([true, true, true, false]);
    time = 1000;
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
  });

  it('keeps keys independent and never exceeds the capacity', () => {
    let time = 0;
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 10, now: () => time });
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
    expect(limiter.take('b')).toBe(true);
    time = 60_000;
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
  });

  it('prunes keys that are full again', () => {
    let time = 0;
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 1, now: () => time });
    limiter.take('a');
    limiter.take('b');
    limiter.prune();
    expect(limiter.size).toBe(2);
    time = 5000;
    limiter.prune();
    expect(limiter.size).toBe(0);
  });
});
