import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseDotenv(contents) {
  const out = {};
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const parsed = parseDotenv(fs.readFileSync(envPath, "utf8"));
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k] && typeof v === "string") process.env[k] = v;
  }
}

function argHas(name) {
  return process.argv.includes(`--${name}`);
}

function buildSlug(name, state, startDate) {
  const raw = `${name}-${state}-${startDate}`
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140);
  return raw || `tournament-${Date.now()}`;
}

async function createTournament(supabase, row) {
  const slug = buildSlug(row.name, row.state, row.start_date);
  const patch = {
    name: row.name,
    slug,
    sport: row.sport,
    state: row.state,
    start_date: row.start_date,
    end_date: row.end_date,
    source_url: row.source_url,
    source_domain: row.source_domain,
    official_website_url: row.official_website_url,
    tournament_director_email: row.tournament_director_email ?? null,
    status: "published",
    is_canonical: true,
    sub_type: "website",
    source: "external_crawl",
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    source_event_id: slug,
  };
  const ins = await supabase.from("tournaments").insert(patch).select("id,slug").single();
  if (ins.error) throw ins.error;
  return ins.data;
}

async function ensureLink(supabase, tournamentId, venueId) {
  const res = await supabase
    .from("tournament_venues")
    .upsert([{ tournament_id: tournamentId, venue_id: venueId, is_inferred: false }], { onConflict: "tournament_id,venue_id" });
  if (res.error) throw res.error;
}

async function deleteLinksExcept(supabase, tournamentId, keepVenueIds) {
  const { data, error } = await supabase.from("tournament_venues").select("venue_id").eq("tournament_id", tournamentId);
  if (error) throw error;
  const toDelete = (data ?? [])
    .map((r) => r.venue_id)
    .filter((v) => v && !keepVenueIds.includes(v));
  if (toDelete.length === 0) return 0;
  const del = await supabase.from("tournament_venues").delete().eq("tournament_id", tournamentId).in("venue_id", toDelete);
  if (del.error) throw del.error;
  return toDelete.length;
}

async function updateTournament(supabase, id, patch) {
  const upd = await supabase.from("tournaments").update(patch).eq("id", id);
  if (upd.error) throw upd.error;
}

async function main() {
  loadEnvLocal();
  const APPLY = argHas("apply");

  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (supabaseUrl === "" || serviceRoleKey === "") {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // These two tournament rows were incorrectly merged because `source_event_id` was set to a generic URL.
  const SHADOW_MERGED_ID = "45c9eed9-3217-436b-b2fd-6de817d7296c";
  const USSSA_MERGED_ID = "5b09f5f0-39a0-4ae4-9e8c-88582f9d6cb6";

  // Venue IDs from the ingest report.
  const VENUE_POLO_FIELDS = "deb91ae5-596f-4bee-970e-4924afc85de3";
  const VENUE_PLANTES_FERRY = "ecd43a1e-d24a-4f0d-807b-2084ac24131e";
  const VENUE_SFCC_FIELDS = "8a40d2ef-41e9-4eba-a8ae-fcd6e20afd66";

  const VENUE_AVISTA = "6edc48fa-eb15-4eca-8354-c0ddf4d21364";
  const VENUE_FRANKLIN_PARK_FIELDS = "618269a3-e285-4dbe-b819-53e0182e4c59";
  const VENUE_GATEWAY = "92c19628-7358-42cf-8e89-b794b484deb0";

  const shadowSpring = {
    name: "Spokane Shadow Spring Classic",
    sport: "soccer",
    state: "WA",
    start_date: "2026-04-24",
    end_date: "2026-04-26",
    source_url: "https://www.spokaneshadow.com/tournaments",
    source_domain: "spokaneshadow.com",
    official_website_url: null,
    tournament_director_email: null,
  };
  const shadowSummer = {
    name: "Spokane Summer Classic",
    sport: "soccer",
    state: "WA",
    start_date: "2026-07-10",
    end_date: "2026-07-12",
    source_url: "https://www.spokaneshadow.com/tournaments",
    source_domain: "spokaneshadow.com",
    official_website_url: null,
    tournament_director_email: null,
  };
  const shadowFall = {
    name: "Spokane Shadow Fall Classic",
    sport: "soccer",
    state: "WA",
    start_date: "2026-10-02",
    end_date: "2026-10-04",
    source_url: "https://www.spokaneshadow.com/tournaments",
    source_domain: "spokaneshadow.com",
    official_website_url: null,
    tournament_director_email: null,
  };

  const usssaAAA = {
    name: "Spokane AAA Slugfest",
    sport: "baseball",
    state: "WA",
    start_date: "2026-05-01",
    end_date: "2026-05-03",
    source_url: "https://www.usssa.com",
    source_domain: "usssa.com",
    official_website_url: null,
    tournament_director_email: null,
  };
  const usssaSummerSlam = {
    name: "Spokane Summer Slam",
    sport: "baseball",
    state: "WA",
    start_date: "2026-06-12",
    end_date: "2026-06-14",
    source_url: "https://www.usssa.com",
    source_domain: "usssa.com",
    official_website_url: null,
    tournament_director_email: null,
  };
  const usssaValleyClassic = {
    name: "Spokane Valley Classic",
    sport: "softball",
    state: "WA",
    start_date: "2026-06-19",
    end_date: "2026-06-21",
    source_url: "https://www.usssa.com",
    source_domain: "usssa.com",
    official_website_url: null,
    tournament_director_email: null,
  };
  const usssaFastpitch = {
    name: "Spokane Fastpitch Invitational",
    sport: "softball",
    state: "WA",
    start_date: "2026-07-17",
    end_date: "2026-07-19",
    source_url: "https://www.usssa.com",
    source_domain: "usssa.com",
    official_website_url: null,
    tournament_director_email: null,
  };

  console.log(`[repair_spokane] apply=${APPLY}`);

  if (!APPLY) {
    console.log("[repair_spokane] Dry run only. Re-run with --apply to write changes.");
    return;
  }

  // 1) Fix merged Spokane Shadow record to represent Spring Classic and use a unique source_event_id.
  const springSlug = buildSlug(shadowSpring.name, shadowSpring.state, shadowSpring.start_date);
  await updateTournament(supabase, SHADOW_MERGED_ID, {
    name: shadowSpring.name,
    sport: shadowSpring.sport,
    state: shadowSpring.state,
    start_date: shadowSpring.start_date,
    end_date: shadowSpring.end_date,
    source_url: shadowSpring.source_url,
    source_domain: shadowSpring.source_domain,
    official_website_url: null,
    status: "published",
    is_canonical: true,
    sub_type: "website",
    source: "external_crawl",
    source_event_id: springSlug,
    updated_at: new Date().toISOString(),
  });

  // 2) Create Fall + Summer tournaments (new rows) and link venues.
  const createdShadowSummer = await createTournament(supabase, shadowSummer);
  const createdShadowFall = await createTournament(supabase, shadowFall);
  await ensureLink(supabase, createdShadowSummer.id, VENUE_POLO_FIELDS);
  await ensureLink(supabase, createdShadowSummer.id, VENUE_SFCC_FIELDS);
  await ensureLink(supabase, createdShadowFall.id, VENUE_POLO_FIELDS);
  await ensureLink(supabase, createdShadowFall.id, VENUE_PLANTES_FERRY);

  // 3) Fix merged USSSA record to represent AAA Slugfest and prune non-AAA venues.
  const aaaSlug = buildSlug(usssaAAA.name, usssaAAA.state, usssaAAA.start_date);
  await updateTournament(supabase, USSSA_MERGED_ID, {
    name: usssaAAA.name,
    sport: usssaAAA.sport,
    state: usssaAAA.state,
    start_date: usssaAAA.start_date,
    end_date: usssaAAA.end_date,
    source_url: usssaAAA.source_url,
    source_domain: usssaAAA.source_domain,
    official_website_url: null,
    status: "published",
    is_canonical: true,
    sub_type: "website",
    source: "external_crawl",
    source_event_id: aaaSlug,
    updated_at: new Date().toISOString(),
  });
  const deleted = await deleteLinksExcept(supabase, USSSA_MERGED_ID, [VENUE_FRANKLIN_PARK_FIELDS, VENUE_AVISTA]);

  // 4) Create the other USSSA tournaments and link venues.
  const createdSummerSlam = await createTournament(supabase, usssaSummerSlam);
  const createdValleyClassic = await createTournament(supabase, usssaValleyClassic);
  const createdFastpitch = await createTournament(supabase, usssaFastpitch);

  await ensureLink(supabase, createdSummerSlam.id, VENUE_FRANKLIN_PARK_FIELDS);
  await ensureLink(supabase, createdSummerSlam.id, VENUE_PLANTES_FERRY);

  await ensureLink(supabase, createdValleyClassic.id, VENUE_PLANTES_FERRY);

  await ensureLink(supabase, createdFastpitch.id, VENUE_GATEWAY);

  console.log("[repair_spokane] Shadow summer id:", createdShadowSummer.id, "slug:", createdShadowSummer.slug);
  console.log("[repair_spokane] Shadow fall id:", createdShadowFall.id, "slug:", createdShadowFall.slug);
  console.log("[repair_spokane] USSSA summer slam id:", createdSummerSlam.id, "slug:", createdSummerSlam.slug);
  console.log("[repair_spokane] USSSA valley classic id:", createdValleyClassic.id, "slug:", createdValleyClassic.slug);
  console.log("[repair_spokane] USSSA fastpitch id:", createdFastpitch.id, "slug:", createdFastpitch.slug);
  console.log("[repair_spokane] USSSA pruned links deleted:", deleted);
  console.log("[repair_spokane] Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

