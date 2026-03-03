const { createClient } = require("@supabase/supabase-js");

const DEMO_SLUG = "refereeinsights-demo-tournament";

function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeCategory(value) {
  const category = String(value ?? "").toLowerCase();
  if (category === "coffee") return "coffee";
  if (category === "hotel" || category === "hotels") return "hotel";
  return "food";
}

async function ensureTableExists() {
  const { error } = await supabase.from("tournament_partner_nearby").select("id").limit(1);
  if (!error) return;
  if (error.code === "42P01" || /does not exist/i.test(error.message || "")) {
    throw new Error("tournament_partner_nearby table does not exist yet. Run the migration first.");
  }
  throw error;
}

async function fetchDemoTournament() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id,slug,name,tournament_venues(venue_id,venues(id,name))")
    .eq("slug", DEMO_SLUG)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Demo tournament not found for slug ${DEMO_SLUG}`);
  return data;
}

async function fetchLatestRunId(venueId) {
  const primary = await supabase
    .from("owls_eye_runs")
    .select("id,run_id,updated_at,created_at")
    .eq("venue_id", venueId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!primary.error && primary.data) return primary.data.run_id ?? primary.data.id;
  if (primary.error && primary.error.code !== "42703" && primary.error.code !== "PGRST204") throw primary.error;

  const fallback = await supabase
    .from("owls_eye_runs")
    .select("id,created_at")
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return fallback.data?.id ?? null;
}

async function fetchTopRowsForVenue(venueId) {
  const runId = await fetchLatestRunId(venueId);
  if (!runId) return [];
  const { data, error } = await supabase
    .from("owls_eye_nearby_food")
    .select("category,name,address,maps_url,distance_meters,is_sponsor,sponsor_click_url")
    .eq("run_id", runId)
    .order("is_sponsor", { ascending: false })
    .order("distance_meters", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;

  const picked = new Map();
  for (const row of data ?? []) {
    const category = normalizeCategory(row.category);
    if (!picked.has(category)) picked.set(category, row);
  }
  return ["coffee", "food", "hotel"]
    .map((category) => {
      const row = picked.get(category);
      if (!row?.name) return null;
      return {
        venue_id: venueId,
        category,
        name: row.name,
        address: row.address ?? "",
        maps_url: row.maps_url ?? null,
        distance_meters: row.distance_meters ?? null,
        sponsor_click_url: row.sponsor_click_url ?? row.maps_url ?? null,
      };
    })
    .filter(Boolean);
}

async function main() {
  await ensureTableExists();
  const tournament = await fetchDemoTournament();
  const venueRows = (tournament.tournament_venues ?? [])
    .map((row) => row?.venues ?? row)
    .filter((row) => row?.id);

  if (!venueRows.length) throw new Error("Demo tournament has no linked venues.");

  const inserts = [];
  for (const venue of venueRows) {
    const topRows = await fetchTopRowsForVenue(venue.id);
    topRows.forEach((row, index) => {
      inserts.push({
        tournament_id: tournament.id,
        venue_id: row.venue_id,
        category: row.category,
        name: row.name,
        address: row.address,
        maps_url: row.maps_url,
        distance_meters: row.distance_meters,
        sponsor_click_url: row.sponsor_click_url,
        sort_order: index,
        is_active: true,
      });
    });
  }

  await supabase.from("tournament_partner_nearby").delete().eq("tournament_id", tournament.id);

  if (!inserts.length) throw new Error("No Owl's Eye rows found to seed.");

  const { data, error } = await supabase
    .from("tournament_partner_nearby")
    .insert(inserts)
    .select("id,venue_id,category,name,sort_order");
  if (error) throw error;

  const summary = data.reduce((acc, row) => {
    const key = row.venue_id;
    acc[key] = acc[key] ?? [];
    acc[key].push(`${row.category}:${row.name}`);
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        ok: true,
        tournament_id: tournament.id,
        row_count: data.length,
        by_venue: summary,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
