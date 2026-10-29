import { expect, type Page, type TestInfo } from "@playwright/test";
import { accountEmail, accounts } from "./accounts";

/** The e2e account for this test's project (see global-setup.ts). */
export function accountFor(testInfo: TestInfo, role: "fresh" | "paynow" | "other" | "signin"): string {
  return accountEmail(role, testInfo.project.name);
}

/**
 * A distinct fake client IP per test, per `n` and per run, so per-IP limits (SEC-03, SEC-12) are isolated.
 * clientIp() reads the last x-forwarded-for hop, and the app passes it on to PocketBase, which ignores
 * an address that isn't a valid IP: so this always returns a valid one.
 */
export function ipFor(testInfo: TestInfo, n = 0): string {
  let h = 0;
  for (const ch of `${process.env.E2E_RUN_SALT ?? ""}|${testInfo.project.name}|${testInfo.titlePath.join("/")}|${n}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `10.${(h >>> 16) & 255}.${(h >>> 8) & 255}.${h & 255}`;
}

export async function signIn(page: Page, email: string, password = accounts().password) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app/);
}

export async function ensureProfile(page: Page, displayName = "E2E Organiser") {
  await page.goto("/app");
  if (!/\/app\/profile/.test(page.url())) return;
  await page.getByLabel("Display name").fill(displayName);
  await page.getByRole("textbox", { name: "PayNow mobile number" }).fill("91234567");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

export type NewPayer = { name: string; whatsapp?: string; amount?: string };

/** Creates a collection through the UI and returns its id. */
export async function createCollection(page: Page, opts: { title: string; kind?: "personal" | "business"; mode?: "split" | "custom"; total?: string; payers: NewPayer[]; includeOrganiser?: boolean }): Promise<string> {
  await page.goto("/app/new");
  await page.getByLabel("Title").fill(opts.title);
  if (opts.kind === "business") await page.getByLabel("Business receipt").check();
  const mode = opts.mode ?? "split";
  await page.getByLabel(mode === "split" ? "Split a total" : "Set each amount").check();
  if (mode === "split") {
    await page.getByLabel("Total (S$)").fill(opts.total ?? "100");
    if (opts.includeOrganiser) await page.getByLabel("I'm in the split").check();
  }
  // The form starts with two rows; add or remove to match.
  const rows = page.getByLabel(/^Payer \d+ name$/);
  while ((await rows.count()) < opts.payers.length) await page.getByRole("button", { name: "Add payer" }).click();
  while ((await rows.count()) > opts.payers.length) await page.getByRole("button", { name: "Remove" }).last().click();
  for (const [i, p] of opts.payers.entries()) {
    await page.getByLabel(`Payer ${i + 1} name`).fill(p.name);
    if (p.whatsapp) await page.getByLabel(`Payer ${i + 1} WhatsApp`).fill(p.whatsapp);
    if (mode === "custom" && p.amount !== undefined) await page.getByLabel(`Payer ${i + 1} amount`).fill(p.amount);
  }
  await page.getByRole("button", { name: "Create collection" }).click();
  await expect(page).toHaveURL(/\/app\/c\/[a-z0-9]{15}$/);
  return page.url().split("/").pop()!;
}

export type StatusPayer = { id: string; first_name: string; amount_cents: number; reference: string; token: string; status: string; revoked: boolean };

export async function boardStatus(page: Page, id: string): Promise<{ status: string; payers: StatusPayer[] }> {
  const res = await page.request.get(`/app/c/${id}/status`);
  expect(res.status()).toBe(200);
  return res.json();
}
