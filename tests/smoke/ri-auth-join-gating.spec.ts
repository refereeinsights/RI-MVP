import { expect, test, type Page } from "playwright/test";

type Credentials = {
  email: string;
  password: string;
};

function getEnvOrThrow(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const insider: Credentials = {
  email: process.env.RI_SMOKE_EMAIL || process.env.TI_SMOKE_INSIDER_EMAIL || "insider_test@example.com",
  password: process.env.RI_SMOKE_PASSWORD || getEnvOrThrow("TI_SMOKE_INSIDER_PASSWORD"),
};

async function logout(page: Page) {
  await page.goto("/api/logout", { waitUntil: "domcontentloaded" });
}

test.describe("RI public beta smoke: auth sanity", () => {
  test("logged-out /account shows login prompt", async ({ page }) => {
    await logout(page);
    await page.goto("/account", { waitUntil: "domcontentloaded" });

    await expect(page.getByText("Please sign in to view your account.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to login" })).toBeVisible();
  });

  test("logged-in user can access /account", async ({ page }) => {
    await logout(page);
    await page.goto("/account/login", { waitUntil: "domcontentloaded" });

    await page.locator('input[type="email"]').fill(insider.email);
    await page.locator('input[type="password"]').fill(insider.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect
      .poll(() => new URL(page.url()).pathname, {
        timeout: 20_000,
        message: "Expected successful login to land on /account. If this fails, verify RI_SMOKE_EMAIL/RI_SMOKE_PASSWORD.",
      })
      .toBe("/account");
    await expect(page.getByRole("heading", { level: 1, name: "My account" })).toBeVisible();
  });
});
