// A small "N requests per window per visitor" counter. It lives in memory, so on a serverless host it is best-effort
// (each warm instance counts for itself), which is still enough to stop one person draining a free quota.

export interface RateLimiter {
  /** Counts one request. `ok` is false once the visitor is over the limit; `retryAfterSec` says when to try again. */
  hit(key: string): { ok: boolean; retryAfterSec: number };
}

export function createRateLimiter({ limit, windowMs, now = () => Date.now() }: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const seen = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key) {
      const t = now();
      // Forget visitors whose window has passed, so the map cannot grow forever.
      if (seen.size > 5000) for (const [k, v] of seen) if (v.resetAt <= t) seen.delete(k);
      const cur = seen.get(key);
      if (!cur || cur.resetAt <= t) {
        seen.set(key, { count: 1, resetAt: t + windowMs });
        return { ok: true, retryAfterSec: 0 };
      }
      cur.count += 1;
      return { ok: cur.count <= limit, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - t) / 1000)) };
    },
  };
}
