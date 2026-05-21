import { expect, test } from "playwright/test";
import { createClient } from "@supabase/supabase-js";
import { logout } from "./tiAuth";

function getEnvOrThrow(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
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

test.describe("TI smoke: Tournament detail CTA dedupe", () => {
  test("keeps one canonical full-plan link + venue-context hotel/rental labels", async ({ page }) => {
    await logout(page);

    const slug = await getAnyTournamentSlugForSmoke();
    await page.goto(`/tournaments/${encodeURIComponent(slug)}`, { waitUntil: "domcontentloaded" });

    // 1) Keep at least one hotel CTA near the top: use map teaser secondary links.
    await expect(page.getByRole("link", { name: /Find hotels near/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Search rentals near/i }).first()).toBeVisible();

    // 2) Planning grid should not have a duplicate "Where to stay" tile anymore.
    await expect(page.getByText("Where to stay", { exact: true })).toHaveCount(0);

    // 3) Keep one canonical planning navigation CTA.
    await expect(page.getByRole("link", { name: "View full tournament plan" })).toHaveCount(1);

    // 4) Sticky map CTA remains (but should not show a Hotels shortcut in this pass).
    const stickyRegion = page.getByRole("region", { name: "Quick actions" });
    // On desktop this region is intentionally not rendered; if it exists, assert Hotels button is absent.
    if (await stickyRegion.isVisible().catch(() => false)) {
      await expect(stickyRegion.getByRole("link", { name: "Hotels" })).toHaveCount(0);
    }
  });
});

