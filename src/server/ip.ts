// Client IP for rate limiting. Behind Cloudflare Tunnel the connecting IP is in cf-connecting-ip,
// which Cloudflare overwrites, so it cannot be spoofed from outside (nothing but cloudflared can reach
// the server: docs/MAC-MINI.md). x-real-ip next. x-forwarded-for is taken from its LAST entry:
// proxies append the real address after client-supplied ones.
import { isIP } from "node:net";

export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return "unknown";
}

/**
 * The client IP to pass on to PocketBase as CF-Connecting-IP, or null. PocketBase ignores a value
 * that isn't an IP and counts the request against the app server's own address instead, which
 * would put every such visitor in one rate-limit bucket.
 */
export function forwardableIp(ip: string): string | null {
  return isIP(ip) ? ip : null;
}
