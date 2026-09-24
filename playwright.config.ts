import { defineConfig, devices } from "@playwright/test";

const AUTH = "playwright/.auth/organiser.json";

export default defineConfig({
  testDir: "tests/e2e",
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3000", trace: "on-first-retry" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "iphone", testIgnore: /auth\.setup\.ts/, dependencies: ["setup"], use: { ...devices["iPhone 14"], storageState: AUTH } },
    { name: "android", testIgnore: /auth\.setup\.ts/, dependencies: ["setup"], use: { ...devices["Pixel 7"], storageState: AUTH } },
  ],
  webServer: process.env.BASE_URL ? undefined : { command: "npm run start", port: 3000, reuseExistingServer: !process.env.CI },
});
