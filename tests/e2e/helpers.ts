import { expect, type Page, type TestInfo } from "@playwright/test";

export const OTP = "123456";
export const SETUP_PHONE = "91234567"; // 6591234567 in supabase/config.toml [auth.sms.test_otp]

/** One test OTP number per (project, slot) so per-phone rate limits (SEC-04) never collide across tests. */
export function phoneFor(testInfo: TestInfo, slot: number): string {
  const base = testInfo.project.name === "android" ? 91234580 : 91234570;
  if (slot < 0 || slot > 9) throw new Error("slot 0-9");
  return String(base + slot);
}

/** A distinct fake client IP per test, so per-IP limits (SEC-03, SEC-04) are isolated. clientIp() reads the last hop. */
export function ipFor(testInfo: TestInfo): string {
  let h = 0;
  for (const ch of testInfo.project.name + "|" + testInfo.titlePath.join("/")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `10.${(h >>> 16) & 255}.${(h >>> 8) & 255}.${h & 255}`;
}

export async function signIn(page: Page, phone: string) {
  await page.goto("/signin");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill(OTP);
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
export async function createCollection(page: Page, opts: { title: string; mode?: "split" | "custom"; total?: string; payers: NewPayer[]; includeOrganiser?: boolean }): Promise<string> {
  await page.goto("/app/new");
  await page.getByLabel("Title").fill(opts.title);
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
  await expect(page).toHaveURL(/\/app\/c\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

export type StatusPayer = { id: string; first_name: string; amount_cents: number; reference: string; token: string; status: string; revoked: boolean };

export async function boardStatus(page: Page, id: string): Promise<{ status: string; payers: StatusPayer[] }> {
  const res = await page.request.get(`/app/c/${id}/status`);
  expect(res.status()).toBe(200);
  return res.json();
}
