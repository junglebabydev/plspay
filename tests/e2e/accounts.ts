// e2e accounts and fixtures, created by global-setup.ts in a local PocketBase.
import { readFileSync } from "node:fs";

export const ACCOUNTS_FILE = "playwright/.auth/accounts.json";
export const FIXTURES_FILE = "playwright/.auth/fixtures.json";
export const PROJECTS = ["iphone", "android"] as const;

export type Accounts = { password: string };
export type Fixtures = { dinnerId: string; valid: string; revoked: string; expired: string };

/** organiser: the shared session (has a profile). Per project: fresh (no profile), paynow, other, signin. */
export function accountEmail(role: "organiser" | "fresh" | "paynow" | "other" | "signin", project?: string): string {
  return project ? `e2e-${role}-${project}@plspay.test` : `e2e-${role}@plspay.test`;
}

export const accounts = (): Accounts => JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8"));
export const fixtures = (): Fixtures => JSON.parse(readFileSync(FIXTURES_FILE, "utf8"));
