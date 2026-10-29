"use server";
import { redirect } from "next/navigation";
import { clearSession } from "@/server/pb";

export async function signOut() {
  await clearSession();
  redirect("/signin");
}
