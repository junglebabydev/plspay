"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { createSessionClient } from "@/server/supabase";

export type ActionResult = { error?: string };
const UUID = /^[0-9a-f-]{36}$/i;
const fail = (msg: string): ActionResult => ({ error: msg });

/** AC-F05-02: paid with a timestamp. */
export async function markPaid(collectionId: string, payerId: string): Promise<ActionResult> {
  await requireUser();
  if (!UUID.test(collectionId) || !UUID.test(payerId)) return fail("Not found");
  const supabase = await createSessionClient();
  const { error, count } = await supabase
    .from("payers")
    .update({ status: "paid", paid_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", payerId).eq("collection_id", collectionId);
  if (error || !count) return fail("Couldn't update that payer");
  revalidatePath(`/app/c/${collectionId}`);
  return {};
}

/** AC-F05-02: undo returns to the previous state (claimed if the payer had claimed, else waiting). */
export async function undoPaid(collectionId: string, payerId: string): Promise<ActionResult> {
  await requireUser();
  if (!UUID.test(collectionId) || !UUID.test(payerId)) return fail("Not found");
  const supabase = await createSessionClient();
  const { data: row } = await supabase.from("payers").select("claimed_at").eq("id", payerId).eq("collection_id", collectionId).maybeSingle();
  if (!row) return fail("Not found");
  const { error } = await supabase
    .from("payers")
    .update({ status: row.claimed_at ? "claimed" : "waiting", paid_at: null })
    .eq("id", payerId).eq("collection_id", collectionId);
  if (error) return fail("Couldn't update that payer");
  revalidatePath(`/app/c/${collectionId}`);
  return {};
}

/** AC-F06-01 */
export async function revokePayer(collectionId: string, payerId: string): Promise<ActionResult> {
  await requireUser();
  if (!UUID.test(collectionId) || !UUID.test(payerId)) return fail("Not found");
  const supabase = await createSessionClient();
  const { error, count } = await supabase.from("payers").update({ revoked: true }, { count: "exact" }).eq("id", payerId).eq("collection_id", collectionId);
  if (error || !count) return fail("Couldn't revoke that link");
  revalidatePath(`/app/c/${collectionId}`);
  return {};
}

/** AC-F06-05: new token via the reissue_payer RPC (runs as the organiser, RLS applies). */
export async function reissuePayer(collectionId: string, payerId: string): Promise<ActionResult> {
  await requireUser();
  if (!UUID.test(collectionId) || !UUID.test(payerId)) return fail("Not found");
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("reissue_payer", { p_payer_id: payerId });
  if (error || data !== true) return fail("Couldn't issue a new link");
  revalidatePath(`/app/c/${collectionId}`);
  return {};
}

/** AC-F06-02 */
export async function closeCollection(collectionId: string): Promise<ActionResult> {
  await requireUser();
  if (!UUID.test(collectionId)) return fail("Not found");
  const supabase = await createSessionClient();
  const { error, count } = await supabase.from("collections").update({ status: "closed" }, { count: "exact" }).eq("id", collectionId);
  if (error || !count) return fail("Couldn't close the collection");
  revalidatePath(`/app/c/${collectionId}`);
  return {};
}

/** AC-F06-03: immediate, cascades to payers. */
export async function deleteCollection(collectionId: string): Promise<ActionResult> {
  await requireUser();
  if (!UUID.test(collectionId)) return fail("Not found");
  const supabase = await createSessionClient();
  const { error, count } = await supabase.from("collections").delete({ count: "exact" }).eq("id", collectionId);
  if (error || !count) return fail("Couldn't delete the collection");
  redirect("/app");
}
