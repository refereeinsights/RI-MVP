import { createClient } from "@supabase/supabase-js";
import { TournamentRow } from "@/lib/types/tournament";

function supabaseAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase env vars");
  }

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

export async function upsertTournamentFromSource(row: TournamentRow) {
  const supabase = supabaseAdmin();
  const now = new Date().toISOString();

  // 1️⃣ Upsert canonical tournament
  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .upsert(
      {
        slug: row.slug,
        name: row.name,
        sport: row.sport,
        level: row.level ?? null,
        state: row.state ?? null,
        city: row.city ?? null,
        venue: row.venue ?? null,
        address: row.address ?? null,
        start_date: row.start_date ?? null,
        end_date: row.end_date ?? null,
        summary: row.summary ?? null,
        status: row.status,
        updated_at: now,
        source_url: row.source_url,
        source_domain: row.source_domain,
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (tErr) throw tErr;

  // 2️⃣ Upsert per-source listing
  const { error: lErr } = await supabase
    .from("tournament_listings")
    .upsert(
      {
        tournament_id: tournament.id,
        source: row.source,
        source_event_id: row.source_event_id,
        source_url: row.source_url,
        source_domain: row.source_domain,
        source_last_seen_at: now,
        raw: row.raw ?? null,
        updated_at: now,
      },
      { onConflict: "source,source_event_id" }
    );

  if (lErr) {
    // Ignore missing table in environments that have not created tournament_listings yet.
    if ((lErr as any)?.code === "42P01") {
      console.warn(
        "tournament_listings table missing; skipping listing upsert. Create the table to enable per-source tracking."
      );
    } else {
      throw lErr;
    }
  }

  return tournament.id;
}
