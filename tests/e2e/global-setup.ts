// Local runs only: clear our rate-limit keys so a re-run within 10 minutes is not "Too many codes".
// Never touches a remote Redis (BASE_URL set means the suite targets a deployed instance).
import Redis from "ioredis";

export default async function globalSetup() {
  const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  if (process.env.BASE_URL || !/127\.0\.0\.1|localhost/.test(url)) return;
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const keys = await redis.keys("plspay:rl:*");
    if (keys.length) await redis.del(...keys);
  } catch {
    // No local Redis: the app falls back to memory limits, nothing to clear.
  } finally {
    redis.disconnect();
  }
}
