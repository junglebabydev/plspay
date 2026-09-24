import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSessionClient } from "./supabase";

export async function getUser(): Promise<User | null> {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** AC-F01-05: every /app route needs a session. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/signin");
  return user;
}
