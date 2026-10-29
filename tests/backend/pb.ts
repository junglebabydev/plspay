// Helpers for the backend tests. They run against the throwaway PocketBase started by
// scripts/pb-test.mjs (`npm run test:db`): fresh database, real migrations and hooks.
import { randomBytes } from "node:crypto";
import { expect } from "vitest";

export const PB = (process.env.PB_TEST_URL ?? "").replace(/\/+$/, "");
if (!PB) throw new Error("PB_TEST_URL is not set. Run these tests with `npm run test:db`.");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are checked field by field
export type Res = { status: number; body: any };

/** A distinct client IP. PocketBase rate limits per CF-Connecting-IP, so each call gets its own bucket unless a test pins one. */
export function randomIp(): string {
  const b = randomBytes(3);
  return `10.${b[0]}.${b[1]}.${b[2]}`;
}

export async function api(method: string, path: string, opts: { token?: string; json?: unknown; ip?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = { "CF-Connecting-IP": opts.ip ?? randomIp() };
  if (opts.token) headers.Authorization = opts.token;
  if (opts.json !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(PB + path, { method, headers, body: opts.json === undefined ? undefined : JSON.stringify(opts.json) });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body };
}

let superuser: Promise<string> | undefined;
export function superuserToken(): Promise<string> {
  superuser ??= (async () => {
    const r = await api("POST", "/api/collections/_superusers/auth-with-password", {
      json: { identity: process.env.PB_TEST_SUPERUSER_EMAIL, password: process.env.PB_TEST_SUPERUSER_PASSWORD },
    });
    expect(r.status, "superuser login").toBe(200);
    return r.body.token as string;
  })();
  return superuser;
}

export type Organiser = { id: string; token: string; email: string; password: string };

/** A new organiser account, created the only way there is: by a superuser. Logged in. */
export async function organiser(label = "org"): Promise<Organiser> {
  const email = `${label}-${randomBytes(4).toString("hex")}@plspay.test`;
  const password = randomBytes(12).toString("base64url");
  const created = await api("POST", "/api/collections/users/records", {
    token: await superuserToken(),
    json: { email, password, passwordConfirm: password, verified: true },
  });
  expect(created.status, "create user").toBe(200);
  const login = await api("POST", "/api/collections/users/auth-with-password", { json: { identity: email, password } });
  expect(login.status, "user login").toBe(200);
  return { id: created.body.id, token: login.body.token, email, password };
}

export async function profile(org: Organiser, fields: Record<string, unknown> = {}): Promise<Res> {
  const r = await api("POST", "/api/collections/profiles/records", {
    token: org.token,
    json: { owner: org.id, display_name: "Alice", paynow_type: "mobile", paynow_id: "91234567", ...fields },
  });
  return r;
}

/** An organiser with a profile, ready to create collections. */
export async function organiserWithProfile(label = "org", fields: Record<string, unknown> = {}): Promise<Organiser> {
  const org = await organiser(label);
  const r = await profile(org, fields);
  expect(r.status, "create profile").toBe(200);
  return org;
}

export async function collection(org: Organiser, fields: Record<string, unknown> = {}): Promise<Res> {
  return api("POST", "/api/collections/collections/records", { token: org.token, json: { owner: org.id, title: "Dinner", ...fields } });
}

export async function payer(org: Organiser, collectionId: string, fields: Record<string, unknown> = {}): Promise<Res> {
  return api("POST", "/api/collections/payers/records", {
    token: org.token,
    json: { collection: collectionId, first_name: "Priya", amount_cents: 2500, reference: `REF-${randomBytes(3).toString("hex")}`, ...fields },
  });
}

/** An open collection with one payer, owned by `org`. Returns both records. */
export async function collectionWithPayer(org: Organiser, collectionFields: Record<string, unknown> = {}, payerFields: Record<string, unknown> = {}) {
  const c = await collection(org, collectionFields);
  expect(c.status, "create collection").toBe(200);
  const p = await payer(org, c.body.id, payerFields);
  expect(p.status, "create payer").toBe(200);
  return { collection: c.body, payer: p.body };
}

export async function asSuperuser(method: string, path: string, json?: unknown): Promise<Res> {
  return api(method, path, { token: await superuserToken(), json });
}

/** PocketBase date for `days` from now (negative = in the past). */
export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export const payment = (token: unknown, ip?: string) => api("POST", "/api/plspay/payment", { json: { token }, ip });
export const claim = (token: unknown, ip?: string) => api("POST", "/api/plspay/claim", { json: { token }, ip });
