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

function getFirstEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

const insider: Credentials = {
  email: getFirstEnv("RI_SMOKE_EMAIL", "TI_SMOKE_INSIDER_EMAIL") || "insider_test@example.com",
  // In CI this should be the RI credential; TI fallback is for local convenience only.
  password: getFirstEnv("RI_SMOKE_PASSWORD", "TI_SMOKE_INSIDER_PASSWORD") || getEnvOrThrow("RI_SMOKE_PASSWORD"),
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
    // Give Next.js hydration a moment so controlled inputs don't get reset after fill().
    await page.waitForTimeout(750);

    // Scope to the login form in case other layout components include inputs.
    const emailInput = page.locator('form input[type="email"]').first();
    const passwordInput = page.locator('form input[type="password"]').first();
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await emailInput.fill(insider.email);
    await passwordInput.fill(insider.password);
    await expect(emailInput).toHaveValue(insider.email);
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
