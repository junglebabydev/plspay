"use server";
import { redirect } from "next/navigation";
import { ClientResponseError } from "pocketbase";
import { requireUser } from "@/server/auth";
import { createSessionClient } from "@/server/pb";
import { getProfile } from "@/server/data";
import { firstIssue, profileSchema } from "@/lib/validate";

type ProfileValues = { display_name: string; paynow_type: string; paynow_id: string; whatsapp: string };
// `values` echoes what was submitted: React resets the form after an action, and the fields
// must keep the new PayNow details while the form asks for the password.
export type ProfileState = { error?: string; needPassword?: boolean; saved?: boolean; values?: ProfileValues };

const REAUTH_MESSAGE = "To change PayNow details, enter your password.";
const SAVE_FAILED = "Couldn't save your profile. Check the details and try again.";

/** AC-F02-01, AC-F02-02, AC-F02-03 (SEC-05) */
export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const values: ProfileValues = {
    display_name: String(formData.get("display_name") ?? ""),
    paynow_type: String(formData.get("paynow_type") ?? "mobile"),
    paynow_id: String(formData.get("paynow_id") ?? ""),
    whatsapp: String(formData.get("whatsapp") ?? ""),
  };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error), values };
  const input = parsed.data;

  const pb = await createSessionClient();
  const existing = await getProfile(pb);

  if (!existing) {
    try {
      await pb.collection("profiles").create({ owner: user.id, ...input });
    } catch {
      return { error: SAVE_FAILED, values };
    }
    redirect("/app");
  }

  // Name and WhatsApp save as they are. PayNow details change only through the backend route that
  // checks the password on the same request; the generic update rule refuses them.
  if (input.paynow_type === existing.paynow_type && input.paynow_id === existing.paynow_id) {
    try {
      await pb.collection("profiles").update(existing.id, { display_name: input.display_name, whatsapp: input.whatsapp });
    } catch {
      return { error: SAVE_FAILED, values };
    }
    return { saved: true, values };
  }

  const password = String(formData.get("password") ?? "");
  if (!password) return { needPassword: true, error: REAUTH_MESSAGE, values };
  try {
    await pb.send("/api/plspay/profile", { method: "POST", body: { password, ...input } });
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 403) return { needPassword: true, error: "That password didn't work", values };
    if (err instanceof ClientResponseError && err.status === 429) return { needPassword: true, error: "Too many attempts. Try again in a few minutes", values };
    return { error: SAVE_FAILED, values };
  }
  return { saved: true, values };
}
