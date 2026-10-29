// One rate-limit interface for the whole app (SPEC section 1, rule 4).
// Counters live in this process's memory. The app runs as a single container, so that is the
// whole picture; they reset when it restarts or redeploys. PocketBase keeps its own per-IP
// limits behind these (backend/pb_hooks/plspay.pb.js and its built-in auth limit).
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";

export type LimitName = "payer" | "signinIp";

// SEC-03, SEC-12
const RULES: Record<LimitName, { points: number; duration: number }> = {
  payer: { points: 30, duration: 60 },          // /p/* and /api/claim, per IP
  signinIp: { points: 10, duration: 600 },      // sign-in attempts per IP
};

export const RATE_LIMIT_PREFIX = "plspay:rl";

declare global {
  // Shared across the proxy and route bundles, which load this module separately.
  var __plspayLimiters: Partial<Record<LimitName, RateLimiterMemory>> | undefined;
}

function limiter(name: LimitName): RateLimiterMemory {
  globalThis.__plspayLimiters ??= {};
  return (globalThis.__plspayLimiters[name] ??= new RateLimiterMemory({ ...RULES[name], keyPrefix: `${RATE_LIMIT_PREFIX}:${name}` }));
}

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Consumes one point. Never throws. */
export async function consume(name: LimitName, key: string): Promise<LimitResult> {
  try {
    await limiter(name).consume(key);
    return { ok: true };
  } catch (e) {
    if (e instanceof RateLimiterRes) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(e.msBeforeNext / 1000)) };
    return { ok: true };
  }
}
