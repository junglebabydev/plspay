// Organiser reads. Every query runs under the organiser's session, RLS decides visibility.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Profile = { id: string; display_name: string; paynow_type: "mobile" | "uen"; paynow_id: string; whatsapp: string | null };
export type Collection = {
  id: string; title: string; payee_name: string; paynow_type: "mobile" | "uen"; paynow_id: string;
  status: "open" | "closed"; expires_at: string; created_at: string; closed_at: string | null;
};
export type Payer = {
  id: string; collection_id: string; first_name: string; whatsapp: string | null; amount_cents: number; reference: string;
  token: string; status: "waiting" | "claimed" | "paid"; revoked: boolean; claimed_at: string | null; paid_at: string | null;
};

export const PAYER_COLUMNS = "id, collection_id, first_name, whatsapp, amount_cents, reference, token, status, revoked, claimed_at, paid_at";

export async function getProfile(supabase: SupabaseClient): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("id, display_name, paynow_type, paynow_id, whatsapp").maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function listCollections(supabase: SupabaseClient): Promise<Collection[]> {
  const { data } = await supabase.from("collections").select("*").order("created_at", { ascending: false });
  return (data as Collection[] | null) ?? [];
}

export async function getCollection(supabase: SupabaseClient, id: string): Promise<Collection | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from("collections").select("*").eq("id", id).maybeSingle();
  return (data as Collection | null) ?? null;
}

export async function listPayers(supabase: SupabaseClient, collectionId: string): Promise<Payer[]> {
  const { data } = await supabase.from("payers").select(PAYER_COLUMNS).eq("collection_id", collectionId).order("created_at", { ascending: true });
  return (data as Payer[] | null) ?? [];
}

export async function payerCounts(supabase: SupabaseClient): Promise<Map<string, { total: number; paid: number }>> {
  const { data } = await supabase.from("payers").select("collection_id, status");
  const m = new Map<string, { total: number; paid: number }>();
  for (const row of (data as { collection_id: string; status: string }[] | null) ?? []) {
    const c = m.get(row.collection_id) ?? { total: 0, paid: 0 };
    c.total += 1; if (row.status === "paid") c.paid += 1;
    m.set(row.collection_id, c);
  }
  return m;
}
