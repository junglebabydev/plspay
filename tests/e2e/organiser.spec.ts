// F02, F03, F05, F06: organiser flows. Runs with the session saved by auth.setup.ts.
import { test, expect, type Browser } from "@playwright/test";
import { boardStatus, createCollection, ipFor, phoneFor, signIn } from "./helpers";

test.use({ extraHTTPHeaders: async ({}, provide, testInfo) => { await provide({ "x-forwarded-for": ipFor(testInfo) }); } });

const GONE = "This link no longer works. Ask the person collecting for a new one.";

async function anonymousContext(browser: Browser, ip: string) {
  return browser.newContext({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-forwarded-for": ip } });
}

test.describe("F02 profile", () => {
  test("AC-F02-01 a new organiser must save a profile before creating a collection", async ({ browser }, testInfo) => {
    const ctx = await anonymousContext(browser, ipFor(testInfo) + "0");
    const page = await ctx.newPage();
    await signIn(page, phoneFor(testInfo, 3));
    await expect(page).toHaveURL(/\/app\/profile/);
    await page.goto("/app/new");
    await expect(page).toHaveURL(/\/app\/profile/);
    await expect(page.getByText("Set up your PayNow details first")).toBeVisible();
    await ctx.close();
  });

  test("AC-F02-02 validates PayNow mobile and UEN formats", async ({ page }) => {
    await page.goto("/app/profile");
    await page.getByRole("textbox", { name: "PayNow mobile number" }).fill("71234567");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("PayNow mobile must be 8 digits starting with 8 or 9")).toBeVisible();
    await page.getByRole("radio", { name: "UEN" }).check();
    await page.getByRole("textbox", { name: "PayNow UEN" }).fill("2019-12345K");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("UEN must be 9 or 10 letters and digits")).toBeVisible();
  });
});

test.describe("F03 create", () => {
  test("AC-F03-02 custom mode requires an amount above S$0.00 for every payer", async ({ page }) => {
    await page.goto("/app/new");
    await page.getByLabel("Title").fill("Custom");
    await page.getByLabel("Set each amount").check();
    await page.getByLabel("Payer 1 name").fill("Priya");
    await page.getByLabel("Payer 1 amount").fill("12.50");
    await page.getByLabel("Payer 2 name").fill("Ravi");
    await page.getByRole("button", { name: "Create collection" }).click();
    await expect(page.getByText("Every payer needs an amount above S$0.00")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/new$/);
  });

  test("AC-F03-07 default expiry is 30 days with 7, 30 and 90 offered", async ({ page }) => {
    await page.goto("/app/new");
    const select = page.getByLabel("Expires in");
    await expect(select).toHaveValue("30");
    await expect(select.locator("option")).toHaveText(["7 days", "30 days", "90 days"]);
  });

  test("AC-F03-04 preview shows the extra cents before creating", async ({ page }) => {
    await page.goto("/app/new");
    await page.getByLabel("Title").fill("Split");
    await page.getByLabel("Total (S$)").fill("100");
    await page.getByRole("button", { name: "Add payer" }).click();
    await page.getByLabel("Payer 1 name").fill("A");
    await page.getByLabel("Payer 2 name").fill("B");
    await page.getByLabel("Payer 3 name").fill("C");
    await expect(page.getByTestId("extra-cents")).toContainText("Adds S$0.03");
  });

  test("AC-F03-08 blocks more than 50 payers", async ({ page }) => {
    await page.goto("/app/new");
    const add = page.getByRole("button", { name: "Add payer" });
    for (let i = 2; i < 50; i++) await add.click();
    await expect(page.getByLabel(/^Payer \d+ name$/)).toHaveCount(50);
    await expect(add).toBeDisabled();
  });
});

test.describe("F05 board and F06 lifecycle", () => {
  test("AC-F05-01 board lists payers with amount, reference, status and totals", async ({ page }) => {
    const id = await createCollection(page, { title: "Friday dinner", total: "100", payers: [{ name: "Priya" }, { name: "Ravi" }, { name: "Tan" }] });
    const rows = page.getByTestId("payer-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Priya");
    await expect(rows.nth(0)).toContainText("S$33.33");
    await expect(rows.nth(0)).toContainText("FRID-PRIYA");
    await expect(rows.nth(1)).toContainText("S$33.34"); // AC-F03-03 collision +1 cent
    await expect(rows.nth(0)).toContainText("Waiting");
    await expect(page.getByTestId("collected")).toContainText("S$0.00 of S$100.02");
    expect((await boardStatus(page, id)).payers.map((p) => p.token).every((t) => t.length === 24)).toBe(true); // AC-F03-06
  });

  test("AC-F05-02 mark paid stamps the time and undo restores the previous state", async ({ page }) => {
    const id = await createCollection(page, { title: "Paid test", total: "20", payers: [{ name: "Priya" }] });
    const row = page.getByTestId("payer-row").first();
    await row.getByRole("button", { name: "Mark paid" }).click();
    await expect(row).toContainText("Paid");
    await expect(page.getByTestId("collected")).toContainText("S$20.00 of S$20.00");
    const paid = (await boardStatus(page, id)).payers[0]!;
    expect(paid.status).toBe("paid");
    await row.getByRole("button", { name: "Undo" }).click();
    await expect(row).toContainText("Waiting");
    expect((await boardStatus(page, id)).payers[0]!.status).toBe("waiting");
  });

  test("AC-F05-04 AC-F04-07 a payer's claim shows as Says paid within 10 seconds without a reload", async ({ page, browser }, testInfo) => {
    const id = await createCollection(page, { title: "Live", total: "30", payers: [{ name: "Priya" }] });
    const { payers } = await boardStatus(page, id);
    const ctx = await anonymousContext(browser, ipFor(testInfo) + "1");
    const payer = await ctx.newPage();
    await payer.goto(`/p/${payers[0]!.token}`);
    await payer.getByRole("button", { name: "I've paid" }).click();
    await expect(payer.getByText("we've told the organiser")).toBeVisible();
    await expect(page.getByTestId("payer-row").first()).toContainText("Says paid", { timeout: 10_000 });
    // Payer can never set paid: the API only ever claims, and a second claim changes nothing.
    const again = await payer.request.post("/api/claim", { data: { token: payers[0]!.token } });
    expect((await again.json()).ok).toBe(false);
    expect((await boardStatus(page, id)).payers[0]!.status).toBe("claimed");
    await ctx.close();
  });

  test("AC-F05-05 WhatsApp and group-chat links are prefilled with payer links", async ({ page }) => {
    const id = await createCollection(page, { title: "Group", total: "50", payers: [{ name: "Priya", whatsapp: "91230000" }, { name: "Ravi" }] });
    const { payers } = await boardStatus(page, id);
    const single = page.getByTestId("payer-row").first().getByRole("link", { name: "WhatsApp" });
    const href = decodeURIComponent((await single.getAttribute("href"))!);
    expect(href.startsWith("https://wa.me/6591230000?text=")).toBe(true);
    expect(href).toContain(`/p/${payers[0]!.token}`);
    expect(href).toContain("S$25.00");
    const group = decodeURIComponent((await page.getByRole("link", { name: "Send all to group chat" }).getAttribute("href"))!);
    expect(group.startsWith("https://wa.me/?text=")).toBe(true);
    for (const p of payers) expect(group).toContain(`/p/${p.token}`);
  });

  test("AC-F06-01 AC-F06-05 revoke kills the link at once and a new link gets a new token", async ({ page, browser }, testInfo) => {
    const id = await createCollection(page, { title: "Revoke", total: "10", payers: [{ name: "Priya" }] });
    const before = (await boardStatus(page, id)).payers[0]!;
    const ctx = await anonymousContext(browser, ipFor(testInfo) + "2");
    const payer = await ctx.newPage();
    await payer.goto(`/p/${before.token}`);
    await expect(payer.getByTestId("amount")).toHaveText("S$10.00");

    await page.getByTestId("payer-row").first().getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByTestId("payer-row").first()).toContainText("Link revoked");
    await payer.goto(`/p/${before.token}`);
    await expect(payer.getByText(GONE)).toBeVisible();

    await page.getByTestId("payer-row").first().getByRole("button", { name: "New link" }).click();
    await expect(page.getByTestId("payer-row").first().getByRole("button", { name: "Revoke" })).toBeVisible();
    const after = (await boardStatus(page, id)).payers[0]!;
    expect(after.token).not.toBe(before.token);
    expect(after.revoked).toBe(false);
    await payer.goto(`/p/${after.token}`);
    await expect(payer.getByTestId("amount")).toHaveText("S$10.00");
    await payer.goto(`/p/${before.token}`);
    await expect(payer.getByText(GONE)).toBeVisible();
    await ctx.close();
  });

  test("AC-F06-02 closing a collection stops every payer link", async ({ page, browser }, testInfo) => {
    const id = await createCollection(page, { title: "Close", total: "10", payers: [{ name: "Priya" }, { name: "Ravi" }] });
    const { payers } = await boardStatus(page, id);
    await page.getByRole("button", { name: "Close collection" }).click();
    await expect(page.getByText("Closed")).toBeVisible();
    const ctx = await anonymousContext(browser, ipFor(testInfo) + "3");
    const payer = await ctx.newPage();
    for (const p of payers) {
      await payer.goto(`/p/${p.token}`);
      await expect(payer.getByText(GONE)).toBeVisible();
    }
    await ctx.close();
  });

  test("AC-F06-03 delete removes the collection and its payers immediately", async ({ page, browser }, testInfo) => {
    const id = await createCollection(page, { title: "Delete", total: "10", payers: [{ name: "Priya" }] });
    const { payers } = await boardStatus(page, id);
    await page.getByRole("button", { name: "Delete collection" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page).toHaveURL(/\/app$/);
    expect((await page.request.get(`/app/c/${id}/status`)).status()).toBe(404);
    const ctx = await anonymousContext(browser, ipFor(testInfo) + "4");
    const payer = await ctx.newPage();
    const res = await payer.goto(`/p/${payers[0]!.token}`);
    expect(res!.status()).toBe(404);
    await expect(payer.getByText(GONE)).toBeVisible();
    await ctx.close();
  });

  test("AC-F05-03 AC-F02-05 another organiser gets 404 and zero rows for a board that is not theirs", async ({ page, browser }, testInfo) => {
    const id = await createCollection(page, { title: "Private", total: "10", payers: [{ name: "Priya" }] });
    const ctx = await anonymousContext(browser, ipFor(testInfo) + "5");
    const other = await ctx.newPage();
    await signIn(other, phoneFor(testInfo, 4));
    await other.waitForLoadState("networkidle"); // a new organiser is redirected on to the profile page
    const res = await other.request.get(`/app/c/${id}`);
    expect(res.status()).toBe(404);
    expect(await res.text()).not.toContain("Priya");
    const status = await other.request.get(`/app/c/${id}/status`);
    expect(status.status()).toBe(404);
    expect(await status.text()).not.toContain("Priya");
    await ctx.close();
  });
});
