import { createClient } from "@supabase/supabase-js";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function buildSlug(name: string, city: string, state: string) {
  const raw = `${name}-${city}-${state}`
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return raw || `tournament-${Date.now()}`;
}

async function main() {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const officialUrl = "https://play.nirsa.net/basketball/national-championship/";
  const tournament = {
    name: "NIRSA National Basketball Tournament",
    sport: "basketball",
    city: "Madison",
    state: "WI",
    start_date: "2026-04-17",
    end_date: "2026-04-19",
    official_website_url: officialUrl,
    source_url: officialUrl,
    source_domain: "play.nirsa.net",
    // Keep legacy single-venue fields populated for existing UI/queries.
    venue: "University of Wisconsin-Madison",
    address: "University of Wisconsin-Madison",
    sub_type: "website",
    source: "manual",
    status: "published",
    is_canonical: true,
    updated_at: new Date().toISOString(),
  };

  const slug = buildSlug(tournament.name, tournament.city, tournament.state);

  // Idempotent: reuse existing tournament if slug already exists.
  const { data: existing, error: existingError } = await (supabase.from("tournaments" as any) as any)
    .select("id,slug")
    .eq("slug", slug)
    .maybeSingle();
  if (existingError) throw existingError;

  let tournamentId: string;

  if (existing?.id) {
    tournamentId = String(existing.id);
    const { error: updateError } = await (supabase.from("tournaments" as any) as any).update(tournament).eq("id", tournamentId);
    if (updateError) throw updateError;
    console.log(`[nirsa] updated tournament`, { id: tournamentId, slug });
  } else {
    const { data: inserted, error: insertError } = await (supabase.from("tournaments" as any) as any)
      .insert({ ...tournament, slug, created_at: new Date().toISOString() })
      .select("id,slug")
      .single();
    if (insertError) throw insertError;
    tournamentId = String(inserted.id);
    console.log(`[nirsa] created tournament`, { id: tournamentId, slug });
  }

  const venues = [
    "Bakke Recreation & Wellbeing Center",
    "Nicholas Recreation Center",
  ].map((name) => ({
    name,
    address: "University of Wisconsin-Madison",
    city: "Madison",
    state: "WI",
    sport: "basketball",
  }));

  const venueIds: string[] = [];
  for (const venue of venues) {
    const { data: existingVenue, error: venueLookupError } = await (supabase.from("venues" as any) as any)
      .select("id")
      .eq("name", venue.name)
      .eq("address", venue.address)
      .eq("city", venue.city)
      .eq("state", venue.state)
      .maybeSingle();
    if (venueLookupError) throw venueLookupError;

    if (existingVenue?.id) {
      venueIds.push(String(existingVenue.id));
      continue;
    }

    const { data: insertedVenue, error: venueInsertError } = await (supabase.from("venues" as any) as any)
      .insert(venue)
      .select("id")
      .single();
    if (venueInsertError) throw venueInsertError;
    venueIds.push(String(insertedVenue.id));
  }

  const links = venueIds.map((venueId) => ({ tournament_id: tournamentId, venue_id: venueId }));
  const { error: linkError } = await (supabase.from("tournament_venues" as any) as any).upsert(links, {
    onConflict: "tournament_id,venue_id",
  });
  if (linkError) throw linkError;

  console.log(`[nirsa] linked venues`, { tournament_id: tournamentId, venue_ids: venueIds });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
