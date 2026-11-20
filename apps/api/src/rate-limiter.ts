export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * In-memory sliding-window rate limiter keyed by client identifier (e.g. IP).
 */
export class SlidingWindowRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private hits = new Map<string, number[]>();

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
  }

  check(key: string, now = Date.now()): RateLimitCheckResult {
    const windowStart = now - this.windowMs;
    const existing = (this.hits.get(key) || []).filter((ts) => ts > windowStart);

    if (existing.length >= this.maxRequests) {
      const oldestInWindow = existing[0];
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldestInWindow + this.windowMs - now) / 1000),
      );
      this.hits.set(key, existing);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    existing.push(now);
    this.hits.set(key, existing);

    // Occasional sweep to prevent unbounded map growth across many distinct IPs
    if (this.hits.size > 1000) {
      for (const [k, timestamps] of this.hits.entries()) {
        if (timestamps.every((ts) => ts <= windowStart)) {
          this.hits.delete(k);
        }
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - existing.length),
      retryAfterSeconds: 0,
    };
  }

  reset(): void {
    this.hits.clear();
  }
}
