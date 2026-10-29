// Organiser reads. Every query runs as the signed-in organiser; the collection rules decide
// what they see (backend/pb_migrations).
import "server-only";
import type PocketBase from "pocketbase";
import { ClientResponseError, type RecordModel } from "pocketbase";

export type Profile = { id: string; display_name: string; paynow_type: "mobile" | "uen"; paynow_id: string; whatsapp: string | null };
export type Collection = {
  id: string; title: string; kind: "personal" | "business"; payee_name: string; paynow_type: "mobile" | "uen"; paynow_id: string;
  status: "open" | "closed"; expires_at: string; created: string; closed_at: string | null;
};
export type Payer = {
  id: string; collection: string; first_name: string; whatsapp: string | null; amount_cents: number; reference: string;
  token: string; status: "waiting" | "claimed" | "paid"; revoked: boolean; claimed_at: string | null; paid_at: string | null;
};

/** PocketBase record ids: 15 characters, a-z and 0-9. */
export const RECORD_ID = /^[a-z0-9]{15}$/;

const PROFILE_FIELDS = "id,display_name,paynow_type,paynow_id,whatsapp";
const PAYER_FIELDS = "id,collection,first_name,whatsapp,amount_cents,reference,token,status,revoked,claimed_at,paid_at";

// PocketBase dates look like "2006-01-02 15:04:05.000Z" and empty values are "". The app uses
// ISO 8601 (Safari's Date can't parse the space) and null.
const iso = (v: unknown): string => String(v ?? "").replace(" ", "T");
const isoOrNull = (v: unknown): string | null => (v ? iso(v) : null);
const orNull = (v: unknown): string | null => (v ? String(v) : null);

const toProfile = (r: RecordModel): Profile => ({
  id: r.id, display_name: r.display_name, paynow_type: r.paynow_type, paynow_id: r.paynow_id, whatsapp: orNull(r.whatsapp),
});

const toCollection = (r: RecordModel): Collection => ({
  id: r.id, title: r.title, kind: r.kind, payee_name: r.payee_name, paynow_type: r.paynow_type, paynow_id: r.paynow_id,
  status: r.status, expires_at: iso(r.expires_at), created: iso(r.created), closed_at: isoOrNull(r.closed_at),
});

const toPayer = (r: RecordModel): Payer => ({
  id: r.id, collection: r.collection, first_name: r.first_name, whatsapp: orNull(r.whatsapp), amount_cents: r.amount_cents,
  reference: r.reference, token: r.token, status: r.status, revoked: r.revoked === true,
  claimed_at: isoOrNull(r.claimed_at), paid_at: isoOrNull(r.paid_at),
});

export async function getProfile(pb: PocketBase): Promise<Profile | null> {
  const { items } = await pb.collection("profiles").getList(1, 1, { fields: PROFILE_FIELDS });
  return items[0] ? toProfile(items[0]) : null;
}

export async function listCollections(pb: PocketBase): Promise<Collection[]> {
  return (await pb.collection("collections").getFullList({ sort: "-created" })).map(toCollection);
}

/** null when the id is malformed, the collection doesn't exist, or it isn't this organiser's (the rules hide it). */
export async function getCollection(pb: PocketBase, id: string): Promise<Collection | null> {
  if (!RECORD_ID.test(id)) return null;
  try {
    return toCollection(await pb.collection("collections").getOne(id));
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}

export async function listPayers(pb: PocketBase, collectionId: string): Promise<Payer[]> {
  const rows = await pb.collection("payers").getFullList({
    filter: pb.filter("collection = {:id}", { id: collectionId }),
    sort: "created,@rowid", // payers created together share a timestamp: keep the order they were entered in
    fields: PAYER_FIELDS,
  });
  return rows.map(toPayer);
}

export async function payerCounts(pb: PocketBase): Promise<Map<string, { total: number; paid: number }>> {
  const rows = await pb.collection("payers").getFullList({ fields: "collection,status" });
  const m = new Map<string, { total: number; paid: number }>();
  for (const row of rows) {
    const c = m.get(row.collection) ?? { total: 0, paid: 0 };
    c.total += 1; if (row.status === "paid") c.paid += 1;
    m.set(row.collection, c);
  }
  return m;
}
