"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type PocketBase from "pocketbase";
import { requireUser } from "@/server/auth";
import { createSessionClient } from "@/server/pb";
import { RECORD_ID } from "@/server/data";

export type ActionResult = { error?: string };
const fail = (msg: string): ActionResult => ({ error: msg });

/** The payer, if it is in this collection and the organiser's own (the collection rules hide anyone else's). */
async function ownPayer(pb: PocketBase, collectionId: string, payerId: string): Promise<{ claimed_at: string; revoked: boolean } | null> {
  if (!RECORD_ID.test(collectionId) || !RECORD_ID.test(payerId)) return null;
  try {
    const p = await pb.collection("payers").getOne(payerId, { fields: "collection,claimed_at,revoked" });
    return p.collection === collectionId ? { claimed_at: p.claimed_at, revoked: p.revoked === true } : null;
  } catch {
    return null;
  }
}

async function updatePayer(collectionId: string, payerId: string, change: (p: { claimed_at: string; revoked: boolean }) => Record<string, unknown> | null, failMsg: string): Promise<ActionResult> {
  await requireUser();
  const pb = await createSessionClient();
  const payer = await ownPayer(pb, collectionId, payerId);
  if (!payer) return fail("Not found");
  const body = change(payer);
  if (!body) return fail(failMsg);
  try {
    await pb.collection("payers").update(payerId, body);
  } catch {
    return fail(failMsg);
  }
  revalidatePath(`/app/c/${collectionId}`);
  return {};
}

/** AC-F05-02: paid with a timestamp. */
export async function markPaid(collectionId: string, payerId: string): Promise<ActionResult> {
  return updatePayer(collectionId, payerId, () => ({ status: "paid", paid_at: new Date().toISOString() }), "Couldn't update that payer");
}

/** AC-F05-02: undo returns to the previous state (claimed if the payer had claimed, else waiting). */
export async function undoPaid(collectionId: string, payerId: string): Promise<ActionResult> {
  return updatePayer(collectionId, payerId, (p) => ({ status: p.claimed_at ? "claimed" : "waiting", paid_at: "" }), "Couldn't update that payer");
}

/** AC-F06-01 */
export async function revokePayer(collectionId: string, payerId: string): Promise<ActionResult> {
  return updatePayer(collectionId, payerId, () => ({ revoked: true }), "Couldn't revoke that link");
}

/** AC-F06-05: un-revoking makes the backend issue a new token (backend/pb_hooks/plspay.pb.js). */
export async function reissuePayer(collectionId: string, payerId: string): Promise<ActionResult> {
  return updatePayer(collectionId, payerId, (p) => (p.revoked ? { revoked: false } : null), "Couldn't issue a new link");
}

/** AC-F06-02 */
export async function closeCollection(collectionId: string): Promise<ActionResult> {
  await requireUser();
  if (!RECORD_ID.test(collectionId)) return fail("Not found");
  const pb = await createSessionClient();
  try {
    await pb.collection("collections").update(collectionId, { status: "closed" });
  } catch {
    return fail("Couldn't close the collection");
  }
  revalidatePath(`/app/c/${collectionId}`);
  return {};
}

/** AC-F06-03: immediate, cascades to payers. */
export async function deleteCollection(collectionId: string): Promise<ActionResult> {
  await requireUser();
  if (!RECORD_ID.test(collectionId)) return fail("Not found");
  const pb = await createSessionClient();
  try {
    await pb.collection("collections").delete(collectionId);
  } catch {
    return fail("Couldn't delete the collection");
  }
  redirect("/app");
}
