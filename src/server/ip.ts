// Client IP for rate limiting. Behind Cloudflare Tunnel the connecting IP is in cf-connecting-ip,
// on Vercel in x-real-ip. Both proxies overwrite these headers, so they cannot be spoofed from outside.
// x-forwarded-for is taken from its LAST entry: proxies append the real address after client-supplied ones.
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
