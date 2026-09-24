import { test as setup } from "@playwright/test";
import { ensureProfile, SETUP_PHONE, signIn } from "./helpers";

setup.use({ extraHTTPHeaders: { "x-forwarded-for": "10.0.0.1" } });

setup("organiser session", async ({ page }) => {
  await signIn(page, SETUP_PHONE);
  await ensureProfile(page);
  await page.context().storageState({ path: "playwright/.auth/organiser.json" });
});
