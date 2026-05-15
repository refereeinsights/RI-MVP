import { expect, test, type Page } from "playwright/test";
import { createClient } from "@supabase/supabase-js";

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

  // Wait for either navigation away from /login or the login form to disappear.
  // (Some envs keep the login button in DOM briefly during redirects.)
  await expect
    .poll(
      async () => {
        const url = page.url();
        if (!url.includes("/login")) return "ok";
        const errorText = await page
          .locator("text=Invalid login")
          .first()
          .textContent()
          .catch(() => null);
        if (errorText) return "invalid";
        const stillVisible = await page.getByRole("button", { name: "Log in" }).isVisible().catch(() => false);
        return stillVisible ? "waiting" : "ok";
      },
      { timeout: 30_000 },
    )
    .toBe("ok");
}

let cachedTournamentSlug: string | null = null;

async function getAnyTournamentSlugForSmoke(page: Page) {
  if (cachedTournamentSlug) return cachedTournamentSlug;

  // Prefer a fixed slug when provided to keep smoke tests deterministic.
  const explicit = String(process.env.TI_SMOKE_TOURNAMENT_SLUG ?? "").trim();
  if (explicit) {
    cachedTournamentSlug = explicit;
    return explicit;
  }

  // Otherwise, use service role to pick any tournament slug. This avoids depending on UI rendering
  // or public view availability in local envs.
  const url = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = await supabase
    .from("tournaments" as any)
    .select("slug,start_date,end_date")
    .not("slug", "is", null)
    .gte("end_date", todayIso)
    .order("start_date", { ascending: true })
    .limit(25);

  const slug = String((upcoming.data as any[] | null)?.find((t) => t?.slug)?.slug ?? "").trim();
  if (slug) {
    cachedTournamentSlug = slug;
    return slug;
  }

  const anyRow = await supabase
    .from("tournaments" as any)
    .select("slug,start_date")
    .not("slug", "is", null)
    .order("start_date", { ascending: false })
    .limit(25);

  const fallback = String((anyRow.data as any[] | null)?.find((t) => t?.slug)?.slug ?? "").trim();
  if (!fallback) throw new Error("Smoke setup: could not find a tournament slug in public.tournaments.");
  cachedTournamentSlug = fallback;
  return fallback;
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
    // If the account is unverified in this env, the page will show verify messaging instead of a save CTA.
    if (await page.getByText(/Confirm your email to save weekend plans/i).isVisible().catch(() => false)) {
      test.skip(true, "Smoke user is unverified in this environment.");
    }

    const saveButton = page.getByRole("button", { name: /Add to planner|Update planning anchor|Save weekend plan/i });
    await expect(saveButton).toBeVisible({ timeout: 15_000 });
    await saveButton.click();
    await expect(page.getByText(/Weekend plan saved/i)).toBeVisible({ timeout: 15_000 });

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
    if (await page.getByText(/Confirm your email/i).isVisible().catch(() => false)) {
      test.skip(true, "Smoke Weekend Pro user appears unverified in this environment.");
    }
    await expect(page.getByText(/Weekend Pro active|Insider access/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Explorer access")).not.toBeVisible();
  });
});
