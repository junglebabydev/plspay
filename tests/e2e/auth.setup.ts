import { test as setup } from "@playwright/test";
import { accountEmail } from "./accounts";
import { ensureProfile, ipFor, signIn } from "./helpers";

setup.use({ extraHTTPHeaders: async ({}, provide, testInfo) => { await provide({ "x-forwarded-for": ipFor(testInfo) }); } });

setup("organiser session", async ({ page }) => {
  await signIn(page, accountEmail("organiser"));
  await ensureProfile(page);
  await page.context().storageState({ path: "playwright/.auth/organiser.json" });
});
