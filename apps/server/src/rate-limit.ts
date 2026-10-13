// Token-bucket rate limiter keyed by string (socket id or IP). Time is injected for tests.

export type RateLimiter = {
  /** Spends one token for `key`; false when the key is over its budget. */
  take(key: string): boolean;
  /** Forgets keys that have been idle long enough to be full again. */
  prune(): void;
  readonly size: number;
};

export type RateLimiterOptions = {
  /** Largest burst (bucket size). */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
  now?: () => number;
};

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? (() => performance.now());
  const buckets = new Map<string, { tokens: number; at: number }>();

  function refilled(bucket: { tokens: number; at: number }, at: number): number {
    const elapsedS = Math.max(0, at - bucket.at) / 1000;
    return Math.min(options.capacity, bucket.tokens + elapsedS * options.refillPerSecond);
  }

  return {
    take(key) {
      const at = now();
      const bucket = buckets.get(key) ?? { tokens: options.capacity, at };
      const tokens = refilled(bucket, at);
      const allowed = tokens >= 1;
      buckets.set(key, { tokens: allowed ? tokens - 1 : tokens, at });
      return allowed;
    },
    prune() {
      const at = now();
      for (const [key, bucket] of buckets) {
        if (refilled(bucket, at) >= options.capacity) {
          buckets.delete(key);
        }
      }
    },
    get size() {
      return buckets.size;
    },
  };
}
