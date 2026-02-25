import { defineConfig, devices } from "playwright/test";

const tiBaseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3001";
const riBaseURL = process.env.PLAYWRIGHT_RI_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },
  projects: [
    {
      name: "ti-smoke",
      testMatch: /ti-auth-join-gating\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: tiBaseURL,
      },
    },
    {
      name: "ri-smoke",
      testMatch: /ri-auth-join-gating\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: riBaseURL,
      },
    },
  ],
});
