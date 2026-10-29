// The ONLY module that calls the public payer routes (backend/pb_hooks/plspay.pb.js).
// It holds no credential: those routes are public by design and answer for one token only.
// Callers must rate limit first (SEC-03).
import "server-only";
import { headers } from "next/headers";
import { env } from "./env";
import { clientIp, forwardableIp } from "./ip";

export type Payment = {
  title: string;
  payee_name: string;
  paynow_type: "mobile" | "uen";
  paynow_id: string;
  amount_cents: number;
  reference: string;
  status: "waiting" | "claimed" | "paid";
  expires_at: string;
};

const TOKEN = /^[A-Za-z0-9_-]{24}$/;

// The token travels in the body, never the URL: PocketBase logs request URLs (SPEC 4.4).
async function call(route: "payment" | "claim", token: string): Promise<Response> {
  const ip = forwardableIp(clientIp(await headers()));
  return fetch(`${env.pbUrl}/api/plspay/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(ip ? { "CF-Connecting-IP": ip } : {}) },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });
}

/** Returns the payer's own payment details, or null for invalid, expired and revoked tokens alike. */
export async function getPayment(token: string): Promise<Payment | null> {
  if (!TOKEN.test(token)) return null;
  const res = await call("payment", token);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get_payment failed (${res.status})`);
  return (await res.json()) as Payment;
}

/** Moves waiting -> claimed. Returns false when nothing changed (already claimed, paid, or token invalid). */
export async function claimPayment(token: string): Promise<boolean> {
  if (!TOKEN.test(token)) return false;
  const res = await call("claim", token);
  if (!res.ok) throw new Error(`claim_payment failed (${res.status})`);
  return ((await res.json()) as { ok?: unknown }).ok === true;
}
