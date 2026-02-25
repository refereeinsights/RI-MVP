import { defineConfig, devices } from "playwright/test";
import fs from "node:fs";
import path from "node:path";

function loadDotEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// Load env files from repo + app roots so smoke tests can reuse existing local setup.
const repoRoot = process.cwd();
loadDotEnvFile(path.join(repoRoot, ".env.local"));
loadDotEnvFile(path.join(repoRoot, "apps", "ti-web", ".env.local"));
loadDotEnvFile(path.join(repoRoot, "apps", "referee", ".env.local"));

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
