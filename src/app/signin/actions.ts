"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ClientResponseError } from "pocketbase";
import { newClient, setSession } from "@/server/pb";
import { consume } from "@/server/ratelimit";
import { clientIp } from "@/server/ip";
import { signInSchema } from "@/lib/validate";

export type SignInState = { email?: string; error?: string };

const WRONG_LOGIN = "Wrong email or password";
const TOO_MANY_ATTEMPTS = "Too many attempts. Try again in a few minutes";

/** AC-F01-04, AC-F01-07 (SEC-12). Accounts are created by a superuser; there is no sign-up (AC-F01-06). */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = signInSchema.safeParse({ email, password: formData.get("password") ?? "" });
  if (!parsed.success) return { email, error: WRONG_LOGIN };

  const ip = clientIp(await headers());
  if (!(await consume("signinIp", ip)).ok) return { email, error: TOO_MANY_ATTEMPTS }; // the backend is not asked

  const pb = newClient(ip);
  try {
    await pb.collection("users").authWithPassword(parsed.data.email, parsed.data.password);
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 429) return { email, error: TOO_MANY_ATTEMPTS }; // PocketBase's own limit
    if (err instanceof ClientResponseError && err.status === 400) return { email, error: WRONG_LOGIN };
    return { email, error: "Couldn't sign in just now. Try again in a minute." };
  }
  await setSession(pb.authStore.token);
  redirect("/app");
}
