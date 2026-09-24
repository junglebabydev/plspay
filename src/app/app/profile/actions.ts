"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { createSessionClient } from "@/server/supabase";
import { getProfile } from "@/server/data";
import { consume } from "@/server/ratelimit";
import { clientIp } from "@/server/ip";
import { firstIssue, otpCodeSchema, profileSchema } from "@/lib/validate";

export type ProfileState = { error?: string; needCode?: boolean; saved?: boolean };

const REAUTH_MESSAGE = "To change PayNow details, confirm with the code we just sent to your mobile.";

/** AC-F02-01, AC-F02-02, AC-F02-03 (SEC-05) */
export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    display_name: formData.get("display_name") ?? "",
    paynow_type: formData.get("paynow_type") ?? "mobile",
    paynow_id: formData.get("paynow_id") ?? "",
    whatsapp: formData.get("whatsapp") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = { ...parsed.data, whatsapp: parsed.data.whatsapp || null };

  const supabase = await createSessionClient();
  const existing = await getProfile(supabase);

  if (!existing) {
    const { error } = await supabase.from("profiles").insert({ id: user.id, ...input });
    if (error) return { error: "Couldn't save your profile. Check the details and try again." };
    redirect("/app");
  }

  // Existing profile. If a code was supplied, verify it first: that refreshes the session's OTP timestamp.
  const code = String(formData.get("code") ?? "").trim();
  if (code) {
    const parsedCode = otpCodeSchema.safeParse(code);
    if (!parsedCode.success || !user.phone) return { error: "That code didn't work", needCode: true };
    const phone = user.phone.startsWith("+") ? user.phone : `+${user.phone}`;
    const { error } = await supabase.auth.verifyOtp({ phone, token: parsedCode.data, type: "sms" });
    if (error) return { error: "That code didn't work", needCode: true };
  }

  const { error } = await supabase.from("profiles").update(input).eq("id", user.id);
  if (!error) return { saved: true };

  if (error.message.includes("reauth_required")) {
    if (!user.phone) return { error: "Sign out and in again, then change your PayNow details." };
    const phone = user.phone.startsWith("+") ? user.phone : `+${user.phone}`;
    const ip = clientIp(await headers());
    const byPhone = await consume("otpPhone", phone);
    const byIp = await consume("otpIp", ip);
    if (!byPhone.ok || !byIp.ok) return { error: "Too many codes. Try again in a few minutes" };
    const sent = await supabase.auth.signInWithOtp({ phone, options: { channel: "sms" } });
    if (sent.error) return { error: "Couldn't send a code just now. Try again in a minute." };
    return { needCode: true, error: REAUTH_MESSAGE };
  }
  return { error: "Couldn't save your profile. Check the details and try again." };
}
