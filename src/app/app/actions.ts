"use server";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/server/supabase";

export async function signOut() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/signin");
}
