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

const explorer: Credentials = {
  email: process.env.TI_SMOKE_EXPLORER_EMAIL || "explorer_test@example.com",
  password: getEnvOrThrow("TI_SMOKE_EXPLORER_PASSWORD"),
};

const insider: Credentials = {
  email: process.env.TI_SMOKE_INSIDER_EMAIL || "insider_test@example.com",
  password: getEnvOrThrow("TI_SMOKE_INSIDER_PASSWORD"),
};

const joinCode = process.env.TI_SMOKE_JOIN_CODE || "VALID";

async function logout(page: Page) {
  await page.goto("/logout?returnTo=/", { waitUntil: "domcontentloaded" });
}

async function login(page: Page, credentials: Credentials, path = "/login") {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Email").fill(credentials.email);
  await page.getByPlaceholder("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test.describe("TI public beta smoke: join + auth + tier gating", () => {
  test("logged-out /venues/reviews redirects to /login with returnTo", async ({ page }) => {
    await logout(page);
    await page.goto("/venues/reviews", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/login\?returnTo=/);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("returnTo")).toBe("/venues/reviews");
  });

  test("logged-in Explorer is redirected to /account with notice", async ({ page }) => {
    await logout(page);
    await login(page, explorer, "/login?returnTo=%2Fvenues%2Freviews");

    await expect(page).toHaveURL(/\/account\?notice=/);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/account");
    expect(url.searchParams.get("notice")).toContain("Insider required");
  });

  test("logged-in Insider can access /venues/reviews", async ({ page }) => {
    await logout(page);
    await login(page, insider, "/login?returnTo=%2Fvenues%2Freviews");

    await expect(page).toHaveURL(/\/venues\/reviews/);
    await expect(page.getByRole("heading", { level: 1, name: "Venue Reviews" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /Step 1: Identify tournament/i })).toBeVisible();
  });

  test("/join?code preserves code through login and returns to /join?code", async ({ page }) => {
    await logout(page);

    await page.goto(`/join?code=${encodeURIComponent(joinCode)}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /Join with event code/i })).toBeVisible();

    await page.getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?code=${encodeURIComponent(joinCode)}`));

    await page.getByPlaceholder("Email").fill(insider.email);
    await page.getByPlaceholder("Password").fill(insider.password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(new RegExp(`/join\\?code=${encodeURIComponent(joinCode)}`));
    await expect(page.locator('input[name="code"]')).toHaveValue(joinCode);
  });

  test("/join without code shows friendly missing code state", async ({ page }) => {
    await logout(page);
    await page.goto("/join", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("ti-join-missing-code")).toBeVisible();
    await expect(page.getByText(/Missing event code/i)).toBeVisible();
  });
});
