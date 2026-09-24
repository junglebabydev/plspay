"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/server/supabase";
import { consume } from "@/server/ratelimit";
import { clientIp } from "@/server/ip";
import { normaliseSgPhone, otpCodeSchema } from "@/lib/validate";

export type SignInState = { step: "phone" | "code"; phone?: string; error?: string; sent?: boolean };

const TOO_MANY_CODES = "Too many codes. Try again in a few minutes";

/** AC-F01-01, AC-F01-02, AC-F01-03 (SEC-04) */
export async function sendCode(prev: SignInState, formData: FormData): Promise<SignInState> {
  const raw = String(formData.get("phone") ?? "");
  const phone = normaliseSgPhone(raw);
  if (!phone) return { step: "phone", error: "Use a Singapore mobile number" };

  const ip = clientIp(await headers());
  const byPhone = await consume("otpPhone", phone);
  const byIp = await consume("otpIp", ip);
  if (!byPhone.ok || !byIp.ok) return { step: prev.step, phone, error: TOO_MANY_CODES };

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { channel: "sms" } });
  if (error) return { step: prev.step, phone, error: "Couldn't send a code just now. Try again in a minute." };
  return { step: "code", phone, sent: true };
}

/** AC-F01-04 */
export async function verifyCode(prev: SignInState, formData: FormData): Promise<SignInState> {
  const phone = normaliseSgPhone(String(formData.get("phone") ?? ""));
  const code = otpCodeSchema.safeParse(formData.get("code"));
  if (!phone) return { step: "phone", error: "Use a Singapore mobile number" };
  if (!code.success) return { step: "code", phone, error: "That code didn't work" };

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token: code.data, type: "sms" });
  if (error) return { step: "code", phone, error: "That code didn't work" };
  redirect("/app");
}

