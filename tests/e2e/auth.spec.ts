// F01: organiser sign-in with email and password. Each test uses its own account and fake IP (see helpers.ts).
import { test, expect, type Page } from "@playwright/test";
import { accounts } from "./accounts";
import { accountFor, ipFor } from "./helpers";

test.use({
  storageState: { cookies: [], origins: [] },
  extraHTTPHeaders: async ({}, provide, testInfo) => { await provide({ "x-forwarded-for": ipFor(testInfo) }); },
});

// PocketBase allows 2 sign-ins per 3 seconds per IP (SEC-12). Tests that sign in several times
// space their attempts so that limit never answers for the app's own.
const BACKEND_SPACING_MS = 1600;

/** The form's message. (Next's route announcer is a role=alert element too.) */
const formAlert = (page: Page) => page.locator("p[role=alert]");

async function attempt(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("AC-F01-04 wrong password and unknown email show the same error and stay; the right password signs in", async ({ page }, testInfo) => {
  const email = accountFor(testInfo, "signin");
  await page.goto("/signin");
  await attempt(page, email, "not-the-password");
  await expect(formAlert(page)).toHaveText("Wrong email or password");
  await expect(page).toHaveURL(/\/signin/);
  await page.waitForTimeout(BACKEND_SPACING_MS);
  await attempt(page, "nobody@plspay.test", "not-the-password");
  await expect(formAlert(page)).toHaveText("Wrong email or password");
  await expect(page).toHaveURL(/\/signin/);
  await page.waitForTimeout(BACKEND_SPACING_MS);
  await attempt(page, email, accounts().password);
  await expect(page).toHaveURL(/\/app/);
  const cookie = (await page.context().cookies()).find((c) => c.name === "pb_auth");
  expect(cookie?.httpOnly).toBe(true); // the browser never holds a readable PocketBase token
});

test("AC-F01-05 /app routes redirect to sign-in and return no collection data without a session", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/signin/);
  await page.goto("/app/c/abcdefghijklmno");
  await expect(page).toHaveURL(/\/signin/);
  const res = await page.request.get("/app/c/abcdefghijklmno/status");
  expect(res.status()).toBe(401);
  expect(await res.text()).not.toContain("Priya");
});

test("AC-F01-06 there is no sign-up page or link", async ({ page }) => {
  for (const path of ["/signup", "/register", "/app/signup"]) {
    const res = await page.goto(path);
    expect(res!.status(), path).toBe(404);
  }
  await page.goto("/signin");
  await expect(page.getByRole("link", { name: /sign ?up|register|create account/i })).toHaveCount(0);
  await expect(page.getByText("There is no sign-up")).toBeVisible();
});

test("AC-F01-07 SEC-12 refuses an 11th sign-in attempt from one IP within 10 minutes", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const email = accountFor(testInfo, "signin");
  await page.goto("/signin");
  for (let i = 1; i <= 10; i++) {
    await attempt(page, email, `wrong-${i}`);
    await expect(formAlert(page)).toHaveText("Wrong email or password");
    await page.waitForTimeout(BACKEND_SPACING_MS);
  }
  await attempt(page, email, accounts().password); // even the right password
  await expect(formAlert(page)).toHaveText("Too many attempts. Try again in a few minutes");
  await expect(page).toHaveURL(/\/signin/);
});
