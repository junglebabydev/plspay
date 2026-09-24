// F04: payer page. Seeded by supabase/seed.sql: token e2e_valid_token_0000000 (Dinner, S$25.00, DINN-PRIYA),
// e2e_revoked_token_00000, e2e_expired_token_00000. Other payer in the collection: Ravi.
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { decodeQrDataUrl, parseTlv } from "../helpers/qr-decode";
import { ipFor } from "./helpers";

const VALID = "/p/e2e_valid_token_0000000";
const GONE = "This link no longer works. Ask the person collecting for a new one.";

test.use({
  storageState: { cookies: [], origins: [] },
  extraHTTPHeaders: async ({}, provide, testInfo) => { await provide({ "x-forwarded-for": ipFor(testInfo) }); },
});

test("AC-F04-01 shows title, amount, payee, reference and a PayNow QR", async ({ page }) => {
  await page.goto(VALID);
  await expect(page.getByRole("heading", { name: "Dinner" })).toBeVisible();
  await expect(page.getByTestId("amount")).toHaveText("S$25.00");
  await expect(page.getByText("E2E Organiser").first()).toBeVisible();
  await expect(page.getByText("DINN-PRIYA")).toBeVisible();
  await expect(page.getByAltText("PayNow QR code")).toBeVisible();
});

test("AC-F04-02 the QR decodes to a valid SGQR PayNow payload", async ({ page }) => {
  await page.goto(VALID);
  const src = await page.getByAltText("PayNow QR code").getAttribute("src");
  const payload = decodeQrDataUrl(src!);
  expect(payload).toBeTruthy();
  const tlv = parseTlv(payload!);
  expect(tlv.get("00")).toBe("01");
  expect(tlv.get("01")).toBe("12");
  const merchant = parseTlv(tlv.get("26")!);
  expect(merchant.get("00")).toBe("SG.PAYNOW");
  expect(merchant.get("01")).toBe("0");
  expect(merchant.get("02")).toBe("+6591234567");
  expect(merchant.get("03")).toBe("0"); // amount not editable
  expect(merchant.get("04")).toMatch(/^\d{8}$/); // expiry YYYYMMDD
  expect(tlv.get("54")).toBe("25.00");
  expect(parseTlv(tlv.get("62")!).get("01")).toBe("DINN-PRIYA");
  expect(tlv.get("63")).toMatch(/^[0-9A-F]{4}$/);
});

test("AC-F04-03 hides other payers, totals and the organiser's WhatsApp", async ({ page }) => {
  await page.goto(VALID);
  const html = await page.content();
  expect(html).not.toContain("Ravi");
  expect(html).not.toMatch(/collected/i);
  expect(html).not.toContain("S$50.01");
  expect(html).not.toMatch(/whatsapp/i);
});

test("AC-F04-04 invalid, expired and revoked tokens render identical HTML with 404", async ({ page }) => {
  const bodies: string[] = [];
  for (const t of ["nope", "e2e_expired_token_00000", "e2e_revoked_token_00000"]) {
    const res = await page.goto(`/p/${t}`);
    expect(res!.status()).toBe(404);
    await expect(page.getByText(GONE)).toBeVisible();
    bodies.push(await page.locator("main").innerHTML());
  }
  expect(new Set(bodies).size).toBe(1);
});

test("AC-F04-05 offers Save QR and copy PayNow ID, amount and reference", async ({ page }) => {
  await page.goto(VALID);
  const save = page.getByRole("link", { name: "Save QR" });
  await expect(save).toBeVisible();
  expect(await save.getAttribute("download")).toBe("paynow-DINN-PRIYA.png");
  expect((await save.getAttribute("href"))!.startsWith("data:image/png;base64,")).toBe(true);
  for (const name of ["Copy PayNow ID", "Copy amount", "Copy reference"]) await expect(page.getByRole("button", { name })).toBeVisible();
});

test("AC-F04-06 tells the payer to check the payee name in their bank", async ({ page }) => {
  await page.goto(VALID);
  await expect(page.getByText("Check your bank shows the name E2E Organiser before you confirm")).toBeVisible();
});

test("AC-F04-08 SEC-03 returns 429 after 30 requests a minute from one IP", async ({ baseURL }, testInfo) => {
  const ctx = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ipFor(testInfo) + "9" } });
  const codes: number[] = [];
  for (let i = 0; i < 35; i++) codes.push((await ctx.get(VALID)).status());
  expect(codes.slice(0, 30).every((c) => c === 200)).toBe(true);
  expect(codes[34]).toBe(429);
  expect((await ctx.post("/api/claim", { data: { token: "x" } })).status()).toBe(429);
  await ctx.dispose();
});

test("AC-F04-09 SEC-06 no payer name or phone in the head or Open Graph tags", async ({ page }) => {
  await page.goto(VALID);
  const head = await page.locator("head").innerHTML();
  expect(head).not.toContain("Priya");
  expect(head).not.toContain("91234567");
  expect(head).toContain('property="og:title"');
  expect(head).not.toMatch(/og:[a-z]+" content="[^"]*(Priya|Ravi|Dinner)/);
});

test("SEC-07 security headers are present on the payer page", async ({ page }) => {
  const res = await page.goto(VALID);
  const h = res!.headers();
  expect(h["content-security-policy"]).toMatch(/default-src 'self'/);
  expect(h["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
  expect(h["strict-transport-security"]).toMatch(/max-age=/);
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["x-content-type-options"]).toBe("nosniff");
});
