"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { createSessionClient } from "@/server/supabase";
import { getProfile } from "@/server/data";
import { firstIssue, newCollectionSchema } from "@/lib/validate";
import { equalShares, makeReferences, makeUnique } from "@/lib/split";

export type CreateResult = { error: string };

/** AC-F03-01..08. Everything is recomputed here; the client preview is only a preview. */
export async function createCollection(raw: unknown): Promise<CreateResult> {
  await requireUser();
  const parsed = newCollectionSchema.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const c = parsed.data;

  const supabase = await createSessionClient();
  if (!(await getProfile(supabase))) redirect("/app/profile?first=1"); // AC-F02-01

  let amounts: number[];
  try {
    amounts = c.mode === "split"
      ? equalShares(c.total_cents!, c.payers.length, c.include_organiser)   // AC-F03-01
      : c.payers.map((p) => p.amount_cents!);                                // AC-F03-02
  } catch {
    return { error: "That total is too small to split between everyone" };
  }
  const unique = makeUnique(amounts);                                        // AC-F03-03
  const references = makeReferences(c.title, c.payers.map((p) => p.first_name)); // AC-F03-05

  const expiresAt = new Date(Date.now() + c.expiry_days * 24 * 3600 * 1000).toISOString(); // AC-F03-07
  const { data: created, error: cErr } = await supabase
    .from("collections")
    .insert({ title: c.title, expires_at: expiresAt })
    .select("id")
    .single();
  if (cErr || !created) {
    if (cErr?.message.includes("profile_required")) redirect("/app/profile?first=1");
    return { error: "Couldn't create the collection. Try again." };
  }

  const rows = c.payers.map((p, i) => ({
    collection_id: created.id,
    first_name: p.first_name,
    whatsapp: p.whatsapp || null,
    amount_cents: unique.amounts[i]!,
    reference: references[i]!,
  }));
  const { error: pErr } = await supabase.from("payers").insert(rows);
  if (pErr) {
    await supabase.from("collections").delete().eq("id", created.id);
    return { error: "Couldn't add the payers. Check names are different and amounts are above S$0.00." };
  }
  redirect(`/app/c/${created.id}`); // AC-F03-06: tokens and PayNow snapshot are set by the database
}
