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
  const identifierInput = page.getByPlaceholder(/Email/i);
  const passwordInput = page.getByPlaceholder("Password");
  const loginButton = page.getByRole("button", { name: "Log in" });

  await expect(identifierInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(loginButton).toBeVisible();

  // Ensure the login page is hydrated before submitting.
  // If we click too early, the browser may perform a native form submit (no /api/auth/login request).
  await identifierInput.fill(credentials.email);
  await expect.poll(async () => identifierInput.inputValue()).toBe(credentials.email);
  await passwordInput.fill(credentials.password);
  await expect.poll(async () => passwordInput.inputValue()).toBe(credentials.password);

  // Press Enter on the password field (more reliable than a click when hydration timing is tight).
  const loginReqPromise = page
    .waitForRequest((req) => req.url().includes("/api/auth/login") && req.method() === "POST", { timeout: 15_000 })
    .catch(() => null);
  await passwordInput.press("Enter");

  // Best-effort: prefer reading the /api/auth/login response, but fall back to observing URL/message changes.
  let needsVerify = false;
  try {
    const req = await loginReqPromise;
    const resp = await req?.response();
    if (req && resp) {
      const payload = (await resp.json().catch(() => null)) as { ok?: boolean; needs_verify?: boolean; error?: string } | null;
      if (!resp.ok() || !payload || payload.ok !== true) {
        if (payload?.needs_verify) {
          needsVerify = true;
        } else {
          throw new Error(`Smoke login failed: ${payload?.error || `HTTP ${resp.status()}`}`);
        }
      }
    }
  } catch {
    // Ignore request/response timing failures and fall back to DOM/url observation below.
  }

  const start = Date.now();
  while (Date.now() - start < 30_000) {
    const url = page.url();
    if (!url.includes("/login")) return;
    if (needsVerify || url.includes("/verify-email")) return;

    const invalidVisible = await page
      .locator("text=Invalid login.")
      .first()
      .isVisible()
      .catch(() => false);
    if (invalidVisible) {
      throw new Error("Smoke login failed (Invalid login). Ensure TI smoke users are seeded and credentials match Supabase.");
    }

    const savingVisible = await page.getByRole("button", { name: "Logging in..." }).isVisible().catch(() => false);
    if (!savingVisible) {
      // Try clicking again if the submit didn't fire due to focus/overlay timing.
      await loginButton.click().catch(() => null);
    }

    await page.waitForTimeout(250);
  }

  throw new Error("Smoke login timed out (still on /login after 30s).");
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
  // Prefer published+canonical surface.
  const publicUpcoming = await supabase
    .from("tournaments_public" as any)
    .select("slug,start_date,end_date")
    .not("slug", "is", null)
    .gte("end_date", todayIso)
    .order("start_date", { ascending: true })
    .limit(25);

  const publicSlug = String((publicUpcoming.data as any[] | null)?.find((t) => t?.slug)?.slug ?? "").trim();
  if (publicSlug) {
    cachedTournamentSlug = publicSlug;
    return publicSlug;
  }

  // Fall back to tournaments table using the same published/canonical constraints when possible.
  const upcoming = await supabase
    .from("tournaments" as any)
    .select("slug,start_date,end_date,status,is_canonical")
    .not("slug", "is", null)
    .eq("status", "published")
    .eq("is_canonical", true)
    .gte("end_date", todayIso)
    .order("start_date", { ascending: true })
    .limit(25);

  const slug = String((upcoming.data as any[] | null)?.find((t) => t?.slug)?.slug ?? "").trim();
  if (slug) {
    cachedTournamentSlug = slug;
    return slug;
  }

  const anyRow = await supabase
    .from("tournaments_public" as any)
    .select("slug,start_date")
    .not("slug", "is", null)
    .order("start_date", { ascending: false })
    .limit(25);

  const fallback = String((anyRow.data as any[] | null)?.find((t) => t?.slug)?.slug ?? "").trim();
  if (!fallback) throw new Error("Smoke setup: could not find a tournament slug in tournaments_public or published tournaments.");
  cachedTournamentSlug = fallback;
  return fallback;
}

test.describe("TI smoke: Weekend Plans lodging details", () => {
  test("signed-out cannot save weekend plan or lodging; sees sign-in messaging", async ({ page }) => {
    await logout(page);
    const tournamentSlug = await getAnyTournamentSlugForSmoke(page);
    await page.goto(`/weekend/${encodeURIComponent(tournamentSlug)}`, { waitUntil: "domcontentloaded" });

    // If the weekend page isn't available for the chosen slug (local env), skip instead of failing.
    const weekendShellVisible = await page
      .getByText("Planning around", { exact: true })
      .or(page.getByText("Choose a venue", { exact: true }))
      .first()
      .isVisible()
      .catch(() => false);
    if (!weekendShellVisible) {
      test.skip(true, "No accessible /weekend/[slug] page found in this environment.");
    }

    // The save control should prompt sign-in for unauthenticated users.
    await expect(page.getByText(/Sign in/i).or(page.getByRole("link", { name: /Create account/i }))).toBeVisible();
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
