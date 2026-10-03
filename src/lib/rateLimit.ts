import { AppError } from '@/lib/http-error';

/**
 * A tiny in-memory sliding-window limiter for throttling inside the
 * SERVICE layer, not just at Express middleware. `express-rate-limit`
 * (middleware/rateLimiter.ts) only protects whichever route it's mounted
 * on — a function reachable from more than one API surface (REST and
 * GraphQL both call `insightsService.generateInsights`, for example) needs
 * its own limit so every caller is covered, not just the one that
 * happened to get a middleware in front of it first.
 *
 * In-memory and per-process, same as express-rate-limit's default store —
 * consistent with the rest of this stack (no Redis here), and fine for a
 * single-instance deployment. A multi-instance deployment would need a
 * shared store for either limiter, not just this one.
 */
export function createKeyedLimiter(options: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();

  return {
    /** Throws AppError.tooMany() if `key` has exceeded `max` calls within
     *  the current window; otherwise records this call and returns. */
    consume(key: string): void {
      const now = Date.now();
      const windowStart = now - options.windowMs;
      const existing = hits.get(key) ?? [];
      const recent = existing.filter((ts) => ts > windowStart);

      if (recent.length >= options.max) {
        throw AppError.tooMany('Too many requests — try again shortly.', 'RATE_LIMITED');
      }

      recent.push(now);
      hits.set(key, recent);

      // Bound memory: opportunistically drop keys with no recent activity
      // rather than letting `hits` grow forever across distinct callers.
      if (hits.size > 10_000) {
        for (const [k, timestamps] of hits) {
          if (timestamps.every((ts) => ts <= windowStart)) hits.delete(k);
        }
      }
    }
  };
}
