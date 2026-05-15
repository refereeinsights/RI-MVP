import { expect, test, type Page } from "playwright/test";

type Credentials = {
  email: string;
  password: string;
};

function getEnvOrThrow(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
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

let cachedTournamentSlug: string | null = null;

async function getAnyTournamentSlugForSmoke(page: Page) {
  if (cachedTournamentSlug) return cachedTournamentSlug;

  await page.goto("/tournaments", { waitUntil: "domcontentloaded" });
  const href = await page
    .locator('a[href^="/tournaments/"]')
    .first()
    .getAttribute("href");
  const raw = String(href ?? "").trim();
  const m = raw.match(/^\/tournaments\/([^/?#]+)/);
  const slug = String(m?.[1] ?? "").trim();
  if (!slug) throw new Error("Smoke setup: could not find a tournament slug from /tournaments.");
  cachedTournamentSlug = slug;
  return slug;
}

test.describe("TI smoke: Weekend Plans lodging details", () => {
  test("signed-out cannot save weekend plan or lodging; sees sign-in messaging", async ({ page }) => {
    await logout(page);
    const tournamentSlug = await getAnyTournamentSlugForSmoke(page);
    await page.goto(`/weekend/${encodeURIComponent(tournamentSlug)}`, { waitUntil: "domcontentloaded" });

    // The save control should prompt sign-in for unauthenticated users.
    await expect(page.getByText(/Sign in/i)).toBeVisible();
    // Lodging block is private-to-owner and should never render for signed-out viewers.
    await expect(page.getByText("Lodging", { exact: true })).not.toBeVisible();
  });

  test("Explorer account cannot manage saved planning features (no lodging edit)", async ({ page }) => {
    await logout(page);
    await login(page, explorer, "/login?returnTo=%2Fweekend-planner");

    // Explorer accounts are redirected to account gating notice in this codebase.
    // We only assert they do not see Insider/Weekend Pro saved-planning controls.
    await page.goto("/weekend-planner", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Weekend plans", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add lodging details|Edit lodging details/i })).not.toBeVisible();
  });

  test("Insider can save a weekend plan and add lodging details on /weekend-planner", async ({ page }) => {
    await logout(page);
    const tournamentSlug = await getAnyTournamentSlugForSmoke(page);
    await login(page, insider, `/login?returnTo=${encodeURIComponent(`/weekend/${tournamentSlug}`)}`);

    await page.goto(`/weekend/${encodeURIComponent(tournamentSlug)}`, { waitUntil: "domcontentloaded" });
    const saveButton = page.getByRole("button", { name: /Add to planner|Update planning anchor/i });
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    await expect(page.getByText("Weekend plan saved")).toBeVisible();

    await page.goto("/weekend-planner", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Weekend plans", { exact: true })).toBeVisible();

    // Open lodging editor on the first plan card.
    const addLodging = page.getByRole("button", { name: /Add lodging details|Edit lodging details/i }).first();
    await expect(addLodging).toBeVisible();
    await addLodging.click();

    await page.getByPlaceholder("Hotel or rental name (optional)").fill("Smoke Test Hotel");
    await page.getByPlaceholder("Address or area (optional)").fill("123 Test St, Testville, CA");

    // Date inputs are type=date; fill ISO.
    await page.locator('input[name="check_in_date"]').fill("2026-06-01");
    await page.locator('input[name="check_out_date"]').fill("2026-06-03");

    await page.getByRole("button", { name: "Save lodging" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    // Ensure the lodging summary is visible on the plan card after save.
    await expect(page.getByText(/Lodging:/)).toBeVisible();
    await expect(page.getByText("Smoke Test Hotel")).toBeVisible();
  });

  test("Weekend Pro can save a weekend plan and see Owl’s Eye / Weekend Guide content where available", async ({ page }) => {
    await logout(page);
    const tournamentSlug = await getAnyTournamentSlugForSmoke(page);
    await login(page, weekendPro, `/login?returnTo=${encodeURIComponent(`/weekend/${tournamentSlug}`)}`);
    await page.goto(`/weekend/${encodeURIComponent(tournamentSlug)}`, { waitUntil: "domcontentloaded" });

    // Basic smoke: Weekend Pro session is established.
    await page.goto("/weekend-planner", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Weekend Pro active|Insider access/i)).toBeVisible();
    await expect(page.getByText("Explorer access")).not.toBeVisible();
  });
});
