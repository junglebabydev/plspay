// Runs on every request: per-request CSP nonce (SEC-07), payer rate limit (SEC-03), session refresh for /app.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { consume } from "@/server/ratelimit";
import { clientIp } from "@/server/ip";

const PAYER_PATH = /^\/(p\/|api\/claim$)/;

function csp(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  // No upgrade-insecure-requests: HSTS (next.config.security.ts) covers production, and WebKit would
  // upgrade form posts on plain-http localhost, breaking local and CI runs.
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PAYER_PATH.test(pathname)) {
    const limit = await consume("payer", clientIp(request.headers));
    if (!limit.ok) {
      return new NextResponse("Too many requests. Wait a minute and try again.", {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds), "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = csp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  if (pathname.startsWith("/app")) {
    // Refresh the organiser session cookie so Server Components (which cannot write cookies) see a live token.
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
    if (url && key) {
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (list) => {
            for (const { name, value } of list) request.cookies.set(name, value);
            response = NextResponse.next({ request: { headers: requestHeaders } });
            for (const { name, value, options } of list) response.cookies.set(name, value, options);
          },
        },
      });
      await supabase.auth.getUser();
    }
  }

  response.headers.set("Content-Security-Policy", policy);
  if (pathname.startsWith("/p/") || pathname.startsWith("/app")) response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|ico|webmanifest|txt)$).*)"],
};
