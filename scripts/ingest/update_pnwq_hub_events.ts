import { createClient } from "@supabase/supabase-js";

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  start_date: string | null;
  city: string | null;
  state: string | null;
  official_website_url: string | null;
  tournament_director_email: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue_url: string | null;
};

const APPLY = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, key, { auth: { persistSession: false } });

const TARGET_SPORT = "volleyball";
const TARGET_DIRECTOR_EMAIL = "april@pacificnwqualifier.org";
const TARGET_OFFICIAL_URL = "https://www.pacificnwqualifier.org/";

function clean(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function norm(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

async function findHubVenue(): Promise<VenueRow> {
  // Pull all venues at the shared Hub address and pick the best "canonical" one.
  // (Avoid complex `.or(...)` filters because venue names often contain commas/parens that break PostgREST parsing.)
  const { data, error } = await supabase
    .from("venues")
    .select("id,name,address1,city,state,zip,venue_url")
    .ilike("address1", "%19619%")
    .limit(50);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as VenueRow[];
  if (rows.length === 0) throw new Error("Unable to find Hub Sports Center venue by name/address.");

  const scored = rows
    .map((row) => {
      const name = norm(clean(row.name));
      const venueUrl = norm(clean(row.venue_url));
      const address = norm(clean(row.address1));
      let score = 0;
      if (venueUrl.includes("hubsportscenter.org")) score += 10;
      if (name.includes("volleyball")) score += 6;
      if (name === "hub sports center") score += 4;
      if (name.startsWith("the hub")) score += 3;
      if (address.includes("19619")) score += 2;
      return { row, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]!.row;
}

async function findPnwqTournaments(): Promise<TournamentRow[]> {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id,name,sport,start_date,city,state,official_website_url,tournament_director_email")
    .eq("sport", TARGET_SPORT)
    .or("name.ilike.%Pacific Northwest Qualifier%,official_website_url.ilike.%pacificnwqualifier.org%")
    .order("start_date", { ascending: true, nullsFirst: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return (data ?? []) as TournamentRow[];
}

async function main() {
  const hubVenue = await findHubVenue();
  const tournaments = await findPnwqTournaments();

  console.log(`${APPLY ? "[APPLY]" : "[DRY-RUN]"} Pacific Northwest Qualifier updates`);
  console.log(`- hub venue: ${hubVenue.id} | ${clean(hubVenue.name)} | ${clean(hubVenue.address1)} | ${clean(hubVenue.city)} ${clean(hubVenue.state)} ${clean(hubVenue.zip)}`);
  console.log(`- director email -> ${TARGET_DIRECTOR_EMAIL}`);
  console.log(`- official url   -> ${TARGET_OFFICIAL_URL}`);
  console.log(`- tournaments matched: ${tournaments.length}`);

  for (const t of tournaments) {
    console.log(
      `  - ${t.id} | ${clean(t.start_date)} | ${clean(t.city)} ${clean(t.state)} | ${clean(t.name)} | url=${clean(
        t.official_website_url
      )} | email=${clean(t.tournament_director_email)}`
    );
  }

  if (!APPLY) return;
  if (tournaments.length === 0) return;

  // Update tournament contact + official URL.
  const tournamentIds = tournaments.map((t) => t.id);
  const { error: updateError } = await supabase
    .from("tournaments")
    .update({
      tournament_director_email: TARGET_DIRECTOR_EMAIL,
      official_website_url: TARGET_OFFICIAL_URL,
    })
    .in("id", tournamentIds);

  if (updateError) throw new Error(updateError.message);

  // Add Hub venue link (additive only, never removes existing venue links).
  const links = tournamentIds.map((tournamentId) => ({ tournament_id: tournamentId, venue_id: hubVenue.id }));
  const { error: linkError } = await supabase
    .from("tournament_venues" as any)
    .upsert(links, { onConflict: "tournament_id,venue_id" });

  if (linkError) throw new Error(linkError.message);

  console.log(`Applied updates for ${tournaments.length} tournament(s) and linked Hub venue.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
