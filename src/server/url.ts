import "server-only";
import { headers } from "next/headers";
import { env } from "./env";

/** Public origin for links we hand out. APP_URL wins; otherwise the request's forwarded host. */
export async function publicOrigin(): Promise<string> {
  if (env.appUrl) return env.appUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
