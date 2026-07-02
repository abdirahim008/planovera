// Per-user rate limiting for the AI routes — a second layer behind the auth
// gate. Distributed via Upstash Redis so it works across serverless instances.
//
// It is CONFIG-GATED and FAIL-OPEN: with no Upstash env vars it no-ops (routes
// keep working; auth stays the primary defense), and a transient Redis/transport
// error never blocks a legitimate request.
//
// To enable, set on the host:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
// (free tier at upstash.com — create a Redis database, copy the REST URL/token).

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

// 30 requests per 60s per identifier — generous for a human, tight for a script.
const limiter =
  url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(30, "60 s"),
        prefix: "ai-ratelimit",
        analytics: false,
      })
    : null;

export function isAiRateLimitEnabled(): boolean {
  return limiter !== null;
}

export async function checkAiRateLimit(identifier: string): Promise<{ ok: boolean }> {
  if (!limiter) return { ok: true }; // not configured — no-op
  try {
    const { success } = await limiter.limit(identifier);
    return { ok: success };
  } catch {
    // Never take the assistant down because the limiter is unreachable.
    return { ok: true };
  }
}
