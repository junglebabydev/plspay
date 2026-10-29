import "server-only";
import { redirect } from "next/navigation";
import { createSessionClient, getCurrentUser, type User } from "./pb";

export async function getUser(): Promise<User | null> {
  return getCurrentUser(await createSessionClient());
}

/** AC-F01-05: every /app route needs a session. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/signin");
  return user;
}
