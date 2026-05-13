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
  email: process.env.TI_SMOKE_INSIDER_EMAIL || "insider_test@example.com",
  password: getEnvOrThrow("TI_SMOKE_INSIDER_PASSWORD"),
};

const weekendPro: Credentials = {
  email: process.env.TI_SMOKE_WEEKENDPRO_EMAIL || "weekendpro_test@example.com",
  password: getEnvOrThrow("TI_SMOKE_WEEKENDPRO_PASSWORD"),
};

async function logout(page: Page) {
  await page.goto("/logout?returnTo=/", { waitUntil: "domcontentloaded" });
}

async function login(page: Page, credentials: Credentials, path = "/login") {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Email").fill(credentials.email);
  await page.getByPlaceholder("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("button", { name: "Log in" })).not.toBeVisible({ timeout: 10_000 });
}

test.describe("TI smoke: Weekend Planner hub", () => {
  test("logged-out can view /weekend-planner and navigate to travel/tournaments", async ({ page }) => {
    await logout(page);
    await page.goto("/weekend-planner", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: "Weekend Planner" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Search travel" })).toHaveAttribute("href", "/book-travel");
    await expect(page.getByRole("link", { name: "Browse tournaments" }).first()).toHaveAttribute(
      "href",
      "/tournaments",
    );
  });

  test("logged-in Insider can view /weekend-planner and sees saved tournaments section", async ({ page }) => {
    await logout(page);
    await login(page, insider, "/login?returnTo=%2Fweekend-planner");

    await expect(page).toHaveURL(/\/weekend-planner/);
    await expect(page.getByRole("heading", { level: 1, name: "Weekend Planner" })).toBeVisible();
    await expect(page.getByText("Insider access")).toBeVisible();
    await expect(page.getByText("Saved tournaments", { exact: true })).toBeVisible();
  });

  test("logged-in Weekend Pro sees Weekend Pro active on /weekend-planner", async ({ page }) => {
    await logout(page);
    await login(page, weekendPro, "/login?returnTo=%2Fweekend-planner");

    await expect(page).toHaveURL(/\/weekend-planner/);
    await expect(page.getByRole("heading", { level: 1, name: "Weekend Planner" })).toBeVisible();
    await expect(page.getByText("Weekend Pro active")).toBeVisible();
  });
});
