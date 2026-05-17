import { expect, test, type Page } from "playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginViaApi, logout } from "./tiAuth";

type Credentials = {
  email: string;
  password: string;
};

function getEnvOrThrow(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const insider: Credentials = {
  email: process.env.TI_SMOKE_INSIDER_EMAIL || "insider_test@example.com",
  password: getEnvOrThrow("TI_SMOKE_INSIDER_PASSWORD"),
};

async function login(page: Page, credentials: Credentials, returnTo: string) {
  await loginViaApi(page, credentials, returnTo);
}

let cachedTournamentSlug: string | null = null;

async function getAnyTournamentSlugForSmoke() {
  if (cachedTournamentSlug) return cachedTournamentSlug;

  const explicit = String(process.env.TI_SMOKE_TOURNAMENT_SLUG ?? "").trim();
  if (explicit) {
    cachedTournamentSlug = explicit;
    return explicit;
  }

  const url = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const todayIso = new Date().toISOString().slice(0, 10);

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

async function getValidVenueIdForTournamentSlug(slug: string) {
  const url = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: t } = await (supabase.from("tournaments_public" as any) as any)
    .select("id,slug")
    .eq("slug", slug)
    .maybeSingle();
  const tournamentId = String(t?.id ?? "").trim();
  if (!tournamentId) return null;

  const { data: tvRows } = await (supabase.from("tournament_venues" as any) as any)
    .select("venue_id")
    .eq("tournament_id", tournamentId)
    .limit(25);
  const venueId = String((tvRows as any[] | null)?.find((r) => r?.venue_id)?.venue_id ?? "").trim();
  return venueId || null;
}

async function ensurePlanVisibleOnPlanner(page: Page) {
  await page.goto("/weekend-planner", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Weekend plans", { exact: true })).toBeVisible();
  if (await page.getByText("Weekend plans are unavailable right now.").isVisible().catch(() => false)) {
    throw new Error("Weekend plans unavailable: Supabase schema likely out of date or Supabase unavailable for this environment.");
  }
  // Ensure we rendered a normal plan card (not the fallback state).
  await expect(page.getByText(/Continue plan →/i).first()).toBeVisible({ timeout: 20_000 });
}

async function openNotesEditor(page: Page) {
  const toggle = page.getByRole("button", { name: "Edit notes" }).first();
  // Give the client component a beat to hydrate before interacting.
  await page.waitForTimeout(500);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await toggle.click({ force: true });
    const visible = await page.locator('textarea[name="notes"]').first().isVisible().catch(() => false);
    if (visible) return;
    await page.waitForTimeout(250);
  }
  await expect(page.locator('textarea[name="notes"]').first()).toBeVisible({ timeout: 10_000 });
}

test.describe("TI smoke: Weekend Plan lifecycle", () => {
  test("Insider can save, anchor, edit notes/lodging, and archive a Weekend Plan", async ({ page }) => {
    test.setTimeout(180_000);

    await logout(page);
    const slug = await getAnyTournamentSlugForSmoke();
    await login(page, insider, `/weekend/${encodeURIComponent(slug)}`);

    // Unverified accounts can't save plans in this codebase.
    if (await page.getByText(/Confirm your email to save weekend plans/i).isVisible().catch(() => false)) {
      test.skip(true, "Smoke Insider user is unverified in this environment.");
    }

    // A) Ensure a plan exists from /weekend/[slug].
    await page.goto(`/weekend/${encodeURIComponent(slug)}`, { waitUntil: "domcontentloaded" });
    const saveButton = page.getByRole("button", { name: /Add to planner|Update planning anchor|Save weekend plan/i });
    if (await saveButton.isVisible().catch(() => false)) {
      await saveButton.click({ noWaitAfter: true });
      await page.waitForTimeout(750);
    } else {
      // Some environments already have an active plan for this smoke user + tournament.
      await expect(page.getByText(/Weekend plan saved/i)).toBeVisible({ timeout: 15_000 });
    }

    await ensurePlanVisibleOnPlanner(page);

    // B) Save with a selected venue anchor (prefer getting a valid venue id via DB).
    const venueId = await getValidVenueIdForTournamentSlug(slug);
    if (!venueId) {
      test.skip(true, "No tournament venue available for selected tournament slug in this environment.");
    }

    await page.goto(`/weekend/${encodeURIComponent(slug)}?venue=${encodeURIComponent(venueId!)}`, { waitUntil: "domcontentloaded" });
    const saveWithVenue = page.getByRole("button", { name: /Add to planner|Update planning anchor|Save weekend plan/i });
    if (await saveWithVenue.isVisible().catch(() => false)) {
      await saveWithVenue.click({ noWaitAfter: true });
      await page.waitForTimeout(750);
    } else {
      await expect(page.getByText(/Weekend plan saved/i)).toBeVisible({ timeout: 15_000 });
    }

    await ensurePlanVisibleOnPlanner(page);

    // Continue plan should preserve venue context when a selected anchor exists.
    const continueHref = await page.getByRole("link", { name: "Continue plan →" }).first().getAttribute("href");
    expect(String(continueHref ?? "")).toContain(`?venue=${venueId}`);

    // C) Invalid venue param is safe and ignored.
    await page.goto(`/weekend/${encodeURIComponent(slug)}?venue=00000000-0000-0000-0000-000000000000`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Choose a venue/i).or(page.getByRole("link", { name: /Open venue map/i })).first()).toBeVisible();

    // D) Notes persist.
    await ensurePlanVisibleOnPlanner(page);
    await openNotesEditor(page);
    const noteText = `smoke-note-${Date.now()}`;
    const notesArea = page.locator('textarea[name="notes"]').first();
    await expect(notesArea).toBeVisible({ timeout: 10_000 });
    await notesArea.fill(noteText);
    await page.getByRole("button", { name: "Save notes" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    // Notes are edited via an expander; confirm persistence by re-opening the editor.
    await openNotesEditor(page);
    await expect(page.locator('textarea[name="notes"]').first()).toHaveValue(noteText);

    // E) Lodging persists if lodging UI exists.
    const lodgingButton = page.getByRole("button", { name: /Add lodging details|Edit lodging details/i }).first();
    const lodgingButtonExists = await lodgingButton.isVisible().catch(() => false);
    if (!lodgingButtonExists) {
      test.skip(true, "Lodging UI not implemented/visible in this environment.");
    }

    await lodgingButton.click();
    await page.getByPlaceholder("Hotel or rental name (optional)").fill("Lifecycle Smoke Lodging");
    await page.getByPlaceholder("Address or area (optional)").fill("456 Smoke St, Testville, CA");
    await page.locator('input[name="check_in_date"]').fill("2026-06-10");
    await page.locator('input[name="check_out_date"]').fill("2026-06-12");
    await page.getByRole("button", { name: "Save lodging" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Lodging:/i)).toBeVisible();
    await expect(page.getByText("Lifecycle Smoke Lodging")).toBeVisible();

    // F) Archive removes active plan.
    const slugPrefix = `/weekend/${encodeURIComponent(slug)}`;
    const planCard = page.locator(`div:has(a[href^="${slugPrefix}"]):has(button:has-text("Remove plan"))`).first();
    await expect(planCard).toBeVisible({ timeout: 20_000 });

    const removeButton = planCard.getByRole("button", { name: "Remove plan" });
    await removeButton.scrollIntoViewIfNeeded();
    await removeButton.click();

    // The remove confirmation UI is rendered inline within the same plan card.
    const confirmRemove = planCard.getByRole("button", { name: "Confirm remove" });
    await expect(confirmRemove).toBeVisible({ timeout: 10_000 });
    await confirmRemove.click();
    await page.waitForTimeout(750);
    await page.reload({ waitUntil: "domcontentloaded" });

    // We don't assert "no plans" (the user may have other plans); we only assert this tournament no longer
    // has an active plan entry on the hub.
    await expect(page.locator(`a[href^="/weekend/${encodeURIComponent(slug)}"]`)).toHaveCount(0);
  });
});
