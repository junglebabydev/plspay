// The only place PocketBase clients exist (SPEC section 1). The browser never talks to
// PocketBase: no PocketBase URL or token reaches client code, and the session cookie is httpOnly.
import "server-only";
import { cookies, headers } from "next/headers";
import PocketBase, { BaseAuthStore, ClientResponseError, getTokenPayload } from "pocketbase";
import { env } from "./env";
import { clientIp, forwardableIp } from "./ip";
import { publicOrigin } from "./url";

/** httpOnly cookie holding the organiser's PocketBase auth token. */
export const SESSION_COOKIE = "pb_auth";

export type User = { id: string; email: string };

/**
 * A new client with no session. Never share one between requests: its auth store would
 * carry one visitor's session into the next. The visitor's IP goes along as CF-Connecting-IP,
 * the header PocketBase trusts, so its rate limits count per visitor and not per app server.
 */
export function newClient(ip: string): PocketBase {
  const pb = new PocketBase(env.pbUrl, new BaseAuthStore());
  pb.autoCancellation(false); // parallel requests in one render must not cancel each other
  const visitor = forwardableIp(ip);
  if (visitor) {
    pb.beforeSend = (url, options) => {
      options.headers = { ...options.headers, "CF-Connecting-IP": visitor };
      return { url, options };
    };
  }
  return pb;
}

/** A new client for this request, signed in as the organiser in the session cookie (if any). */
export async function createSessionClient(): Promise<PocketBase> {
  const [store, h] = await Promise.all([cookies(), headers()]);
  const pb = newClient(clientIp(h));
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) pb.authStore.save(token);
  return pb;
}

/**
 * The signed-in organiser, or null when there is no session or PocketBase no longer accepts
 * it. Reads the user's own record (allowed by the users view rule) rather than calling
 * authRefresh, which PocketBase's auth rate limit would throttle on quick reloads.
 */
export async function getCurrentUser(pb: PocketBase): Promise<User | null> {
  if (!pb.authStore.isValid) return null;
  const id = getTokenPayload(pb.authStore.token).id as string | undefined;
  if (!id) return null;
  try {
    const r = await pb.collection("users").getOne(id, { fields: "id,email" });
    return { id: r.id, email: String(r.email ?? "") };
  } catch (err) {
    if (err instanceof ClientResponseError && [401, 403, 404].includes(err.status)) return null;
    throw err;
  }
}

/** Stores the token from a successful sign-in. Lives as long as the token (PocketBase default: 5 days). */
export async function setSession(token: string): Promise<void> {
  const exp = getTokenPayload(token).exp as number | undefined;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: (await publicOrigin()).startsWith("https://"), // plain http on localhost would drop a Secure cookie
    path: "/",
    ...(exp ? { expires: new Date(exp * 1000) } : {}),
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
