// F01: organiser sign-in. Each test uses its own test-OTP number and fake IP (see helpers.ts).
import { test, expect } from "@playwright/test";
import { ipFor, OTP, phoneFor } from "./helpers";

test.use({
  storageState: { cookies: [], origins: [] },
  extraHTTPHeaders: async ({}, provide, testInfo) => { await provide({ "x-forwarded-for": ipFor(testInfo) }); },
});

test("AC-F01-01 sends OTP to a +65 number and asks for the code", async ({ page }, testInfo) => {
  await page.goto("/signin");
  await page.getByLabel("Mobile number").fill(phoneFor(testInfo, 0));
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();
});

test("AC-F01-02 rejects non-Singapore numbers without sending", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Mobile number").fill("+14155550100");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Use a Singapore mobile number")).toBeVisible();
  await expect(page.getByLabel("Code")).toHaveCount(0);
});

test("AC-F01-03 SEC-04 refuses a fourth code request for the same number within 10 minutes", async ({ page }, testInfo) => {
  await page.goto("/signin");
  await page.getByLabel("Mobile number").fill(phoneFor(testInfo, 1));
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();
  const resend = page.getByRole("button", { name: "Resend code" });
  for (let i = 0; i < 3; i++) {
    await resend.click();
    await expect(resend).toBeEnabled();
  }
  await expect(page.getByText("Too many codes. Try again in a few minutes")).toBeVisible();
});

test("AC-F01-04 wrong code shows an error and stays; correct code signs in", async ({ page }, testInfo) => {
  await page.goto("/signin");
  await page.getByLabel("Mobile number").fill(phoneFor(testInfo, 2));
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That code didn't work")).toBeVisible();
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("Code").fill(OTP);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app/);
});

test("AC-F01-05 /app routes redirect to sign-in and return no collection data without a session", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/signin/);
  await page.goto("/app/c/30000000-0000-0000-0000-000000000001");
  await expect(page).toHaveURL(/\/signin/);
  const res = await page.request.get("/app/c/30000000-0000-0000-0000-000000000001/status");
  expect(res.status()).toBe(401);
  expect(await res.text()).not.toContain("Priya");
});
