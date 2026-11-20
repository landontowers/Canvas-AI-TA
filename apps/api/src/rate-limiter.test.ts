import { describe, it, expect } from 'vitest';
import { SlidingWindowRateLimiter } from './rate-limiter.js';

describe('SlidingWindowRateLimiter', () => {
  it('permits requests within the window, blocks excess with retryAfterSeconds, and recovers after expiry', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, maxRequests: 2 });

    const r1 = limiter.check('127.0.0.1', 1000);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = limiter.check('127.0.0.1', 1200);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);

    const r3 = limiter.check('127.0.0.1', 1500);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    // Independent client key is unaffected
    const other = limiter.check('10.0.0.5', 1500);
    expect(other.allowed).toBe(true);

    // After first hit expires (> 2000ms), capacity opens again
    const recovered = limiter.check('127.0.0.1', 2005);
    expect(recovered.allowed).toBe(true);

    limiter.reset();
    expect(limiter.check('127.0.0.1', 2010).remaining).toBe(1);
  });
});
