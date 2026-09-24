// One rate-limit interface for the whole app (SPEC section 1, rule 4). Backed by REDIS_URL.
// Without REDIS_URL it falls back to process memory and warns: fine for a laptop, never for a deployment.
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes, type RateLimiterAbstract } from "rate-limiter-flexible";
import Redis from "ioredis";

export type LimitName = "payer" | "otpPhone" | "otpIp";

// SEC-03, SEC-04
const RULES: Record<LimitName, { points: number; duration: number }> = {
  payer: { points: 30, duration: 60 },          // /p/* and /api/claim, per IP
  otpPhone: { points: 3, duration: 600 },       // OTP sends per phone
  otpIp: { points: 10, duration: 3600 },        // OTP sends per IP
};

export const RATE_LIMIT_PREFIX = "plspay:rl";

declare global {
  var __plspayRedis: Redis | undefined;
  var __plspayLimiters: Partial<Record<LimitName, RateLimiterAbstract>> | undefined;
  var __plspayWarned: boolean | undefined;
}

function redis(): Redis | undefined {
  const url = process.env.REDIS_URL;
  if (!url) {
    if (!globalThis.__plspayWarned) {
      globalThis.__plspayWarned = true;
      console.warn("REDIS_URL is not set: rate limits are held in process memory only");
    }
    return undefined;
  }
  if (!globalThis.__plspayRedis) {
    globalThis.__plspayRedis = new Redis(url, { enableOfflineQueue: false, maxRetriesPerRequest: 1, lazyConnect: false });
    globalThis.__plspayRedis.on("error", () => { /* limiter falls back to insurance; nothing sensitive to log */ });
  }
  return globalThis.__plspayRedis;
}

function limiter(name: LimitName): RateLimiterAbstract {
  globalThis.__plspayLimiters ??= {};
  const existing = globalThis.__plspayLimiters[name];
  if (existing) return existing;
  const rule = RULES[name];
  const client = redis();
  const memory = new RateLimiterMemory({ ...rule, keyPrefix: `${RATE_LIMIT_PREFIX}:${name}` });
  const built = client
    ? new RateLimiterRedis({ ...rule, storeClient: client, keyPrefix: `${RATE_LIMIT_PREFIX}:${name}`, insuranceLimiter: memory })
    : memory;
  globalThis.__plspayLimiters[name] = built;
  return built;
}

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Consumes one point. Never throws: a broken store degrades to the in-memory insurance limiter. */
export async function consume(name: LimitName, key: string): Promise<LimitResult> {
  try {
    await limiter(name).consume(key);
    return { ok: true };
  } catch (e) {
    if (e instanceof RateLimiterRes) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(e.msBeforeNext / 1000)) };
    return { ok: true };
  }
}
