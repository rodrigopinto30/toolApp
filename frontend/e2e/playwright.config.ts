import { defineConfig, devices } from "@playwright/test";

import { BASE_URL } from "./support/stack";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  globalSetup: "./support/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 2,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "buyers", testMatch: /buyers\.setup\.ts/ },
    { name: "community", testMatch: /community\.setup\.ts/ },
    { name: "chromium", testIgnore: /\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
});
