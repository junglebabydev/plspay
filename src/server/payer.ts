// The ONLY module allowed to hold the service role key (CLAUDE.md hard rule 3).
// It exposes exactly the two payer RPCs. Callers must rate limit first (SEC-03).
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let service: SupabaseClient | undefined;
function serviceClient(): SupabaseClient {
  if (!service) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("Missing environment variable SUPABASE_SERVICE_ROLE_KEY");
    service = createClient(env.supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return service;
}

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

const TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

/** Returns the payer's own payment details, or null for invalid, expired and revoked tokens alike. */
export async function getPayment(token: string): Promise<Payment | null> {
  if (!TOKEN.test(token)) return null;
  const { data, error } = await serviceClient().rpc("get_payment", { p_token: token });
  if (error) throw new Error("get_payment failed");
  const row = (data as Payment[] | null)?.[0];
  return row ?? null;
}

/** Moves waiting -> claimed. Returns false when nothing changed (already claimed, paid, or token invalid). */
export async function claimPayment(token: string): Promise<boolean> {
  if (!TOKEN.test(token)) return false;
  const { data, error } = await serviceClient().rpc("claim_payment", { p_token: token });
  if (error) throw new Error("claim_payment failed");
  return data === true;
}
