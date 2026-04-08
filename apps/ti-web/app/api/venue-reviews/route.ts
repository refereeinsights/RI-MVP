import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/venues/isUuid";

export const runtime = "nodejs";

type TournamentRow = {
  id: string;
  slug: string | null;
  name: string | null;
  start_date: string | null;
  sport?: string | null;
};

type VenueJoinRow = {
  venue_id: string;
  venues:
    | {
        id: string;
        seo_slug?: string | null;
        name: string | null;
        address: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
      }
    | null;
};

type VenueSearchRow = {
  id: string;
  seo_slug?: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

function tournamentOut(row: TournamentRow) {
  return {
    id: row.id,
    slug: row.slug ?? "",
    name: row.name ?? "Unnamed tournament",
    start_date: row.start_date ?? null,
    sport: row.sport ?? null,
  };
}

const SPORT_PROFILE_SPORTS = new Set([
  "soccer",
  "baseball",
  "softball",
  "lacrosse",
  "basketball",
  "hockey",
  "volleyball",
  "futsal",
]);

function parseUsdToNumber(raw: unknown) {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw * 100) / 100;
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (!cleaned || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

async function requireInsider() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 }),
    };
  }

  const { tier } = await getTiTierServer(user);
  if (tier === "explorer") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Insider required to submit venue reviews." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, supabase, user };
}

async function findTournamentByCode(codeRaw: string) {
  const code = codeRaw.trim();
  if (!code) return null;

  const normalizedSlug = code.toLowerCase();
  const slugMatch = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,slug,name,start_date,sport")
    .eq("slug", normalizedSlug)
    .maybeSingle<TournamentRow>();
  if (!slugMatch.error && slugMatch.data?.id) return slugMatch.data;

  if (isUuid(code)) {
    const idMatch = await supabaseAdmin
      .from("tournaments_public" as any)
      .select("id,slug,name,start_date,sport")
      .eq("id", code)
      .maybeSingle<TournamentRow>();
    if (!idMatch.error && idMatch.data?.id) return idMatch.data;
  }

  for (const table of ["event_codes", "ti_event_codes"]) {
    const eventRes = await (supabaseAdmin.from(table as any) as any)
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (eventRes.error || !eventRes.data) continue;

    const row = eventRes.data as Record<string, unknown>;
    const tournamentId = typeof row.tournament_id === "string" ? row.tournament_id : null;
    const tournamentSlug = typeof row.tournament_slug === "string" ? row.tournament_slug : null;

    if (tournamentId) {
      const idLookup = await supabaseAdmin
        .from("tournaments_public" as any)
        .select("id,slug,name,start_date,sport")
        .eq("id", tournamentId)
        .maybeSingle<TournamentRow>();
      if (!idLookup.error && idLookup.data?.id) return idLookup.data;
    }

    if (tournamentSlug) {
      const slugLookup = await supabaseAdmin
        .from("tournaments_public" as any)
        .select("id,slug,name,start_date,sport")
        .eq("slug", tournamentSlug)
        .maybeSingle<TournamentRow>();
      if (!slugLookup.error && slugLookup.data?.id) return slugLookup.data;
    }
  }

  return null;
}

export async function GET(request: Request) {
  const auth = await requireInsider();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const mode = (searchParams.get("mode") ?? "").trim().toLowerCase();

  if (mode === "search") {
    const q = (searchParams.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ ok: true, results: [] });

    const { data, error } = await supabaseAdmin
      .from("tournaments_public" as any)
      .select("id,slug,name,start_date,sport")
      .ilike("name", `%${q}%`)
      .order("start_date", { ascending: false })
      .limit(10);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = ((data ?? []) as TournamentRow[]).filter((row) => row.id && row.slug && row.name);
    return NextResponse.json({ ok: true, results: rows.map(tournamentOut) });
  }

  if (mode === "code") {
    const code = (searchParams.get("code") ?? "").trim();
    if (!code) return NextResponse.json({ ok: false, error: "Tournament code is required." }, { status: 400 });

    const tournament = await findTournamentByCode(code);
    if (!tournament?.id || !tournament.slug || !tournament.name) {
      return NextResponse.json({ ok: false, error: "Code not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, tournament: tournamentOut(tournament) });
  }

  if (mode === "venues") {
    const tournamentId = (searchParams.get("tournamentId") ?? "").trim();
    if (!tournamentId) {
      return NextResponse.json({ ok: false, error: "Tournament is required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("tournament_venues" as any)
      .select("venue_id,venues(id,seo_slug,name,address,city,state,zip)")
      .eq("tournament_id", tournamentId)
      .eq("is_inferred", false)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const venues = ((data ?? []) as VenueJoinRow[])
      .map((row) => row.venues)
      .filter(
        (venue): venue is NonNullable<VenueJoinRow["venues"]> =>
          Boolean(venue && typeof venue.id === "string")
      )
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    return NextResponse.json({ ok: true, venues });
  }

  if (mode === "venue-search") {
    const q = (searchParams.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ ok: true, venues: [] });

    const { data, error } = await supabaseAdmin
      .from("venues" as any)
      .select("id,seo_slug,name,address,city,state,zip")
      .or(
        [
          `name.ilike.%${q}%`,
          `city.ilike.%${q}%`,
          `state.ilike.%${q}%`,
          `address.ilike.%${q}%`,
        ].join(",")
      )
      .order("name", { ascending: true })
      .limit(12);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const venues = ((data ?? []) as VenueSearchRow[]).filter((venue) => venue.id);
    return NextResponse.json({ ok: true, venues });
  }

  if (mode === "venue") {
    const venueId = (searchParams.get("venueId") ?? "").trim();
    if (!venueId) return NextResponse.json({ ok: true, venue: null });

    const baseSelect = "id,seo_slug,name,address,city,state,zip";

    // Try slug first.
    const bySlug = await supabaseAdmin
      .from("venues" as any)
      .select(baseSelect)
      .eq("seo_slug", venueId)
      .maybeSingle<VenueSearchRow>();
    if (!bySlug.error && bySlug.data?.id) return NextResponse.json({ ok: true, venue: bySlug.data });

    // Fallback UUID lookup.
    if (isUuid(venueId)) {
      const byId = await supabaseAdmin
        .from("venues" as any)
        .select(baseSelect)
        .eq("id", venueId)
        .maybeSingle<VenueSearchRow>();
      if (byId.error) return NextResponse.json({ ok: false, error: byId.error.message }, { status: 500 });
      if (!byId.data?.id) return NextResponse.json({ ok: true, venue: null });
      return NextResponse.json({ ok: true, venue: byId.data });
    }

    return NextResponse.json({ ok: true, venue: null });
  }

  return NextResponse.json({ ok: false, error: "Unsupported mode." }, { status: 400 });
}

export async function POST(request: Request) {
  const auth = await requireInsider();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });

  const venueId = typeof body.venue_id === "string" ? body.venue_id.trim() : "";
  const tournamentId = typeof body.tournament_id === "string" ? body.tournament_id.trim() : null;
  const sport = typeof (body as any).sport === "string" ? String((body as any).sport).trim().toLowerCase() : "";
  const rawProfileId =
    typeof (body as any).venue_sport_profile_id === "string" ? String((body as any).venue_sport_profile_id).trim() : "";
  const venueSportProfileId = rawProfileId && isUuid(rawProfileId) ? rawProfileId : null;
  const restrooms = typeof body.restrooms === "string" ? body.restrooms.trim() : "";
  const restroomCleanliness = Number(body.restroom_cleanliness);
  const playerParkingFee = parseUsdToNumber(body.player_parking_fee);
  const parkingDistance =
    typeof body.parking_convenience_score === "string" ? body.parking_convenience_score.trim() : "";
  const parkingNotes =
    typeof body.parking_notes === "string" ? body.parking_notes.trim().slice(0, 60) : null;
  const bringFieldChairs = typeof body.bring_field_chairs === "boolean" ? body.bring_field_chairs : null;
  const seatingNotes =
    typeof body.seating_notes === "string" ? body.seating_notes.trim().slice(0, 60) : null;
  const shadeScore = Number(body.shade_score);
  const foodVendors = typeof body.food_vendors === "boolean" ? body.food_vendors : null;
  const coffeeVendors = typeof body.coffee_vendors === "boolean" ? body.coffee_vendors : null;
  const vendorScore = Number(body.vendor_score);
  const venueNotes = typeof body.venue_notes === "string" ? body.venue_notes.trim().slice(0, 255) : null;

  const restroomsAllowed = new Set(["Portable", "Building", "Both"]);
  const parkingAllowed = new Set(["Close", "Medium", "Far"]);
  const parkingScoreMap: Record<string, number> = {
    Close: 5,
    Medium: 3,
    Far: 1,
  };

  if (!venueId) return NextResponse.json({ ok: false, error: "Venue is required." }, { status: 400 });
  if (!restroomsAllowed.has(restrooms)) {
    return NextResponse.json({ ok: false, error: "Invalid restrooms value." }, { status: 400 });
  }
  if (!Number.isInteger(restroomCleanliness) || restroomCleanliness < 1 || restroomCleanliness > 5) {
    return NextResponse.json({ ok: false, error: "Restroom cleanliness must be 1 to 5." }, { status: 400 });
  }
  if (playerParkingFee === null) {
    return NextResponse.json({ ok: false, error: "Player parking fee must be a valid USD amount." }, { status: 400 });
  }
  if (!parkingAllowed.has(parkingDistance)) {
    return NextResponse.json({ ok: false, error: "Invalid parking convenience value." }, { status: 400 });
  }
  const parkingConvenienceScore = parkingScoreMap[parkingDistance];
  if (bringFieldChairs === null) {
    return NextResponse.json({ ok: false, error: "Bring field chairs must be Yes or No." }, { status: 400 });
  }
  if (!Number.isInteger(shadeScore) || shadeScore < 1 || shadeScore > 5) {
    return NextResponse.json({ ok: false, error: "Shade score must be 1 to 5." }, { status: 400 });
  }
  if (foodVendors === null) {
    return NextResponse.json({ ok: false, error: "Food vendors must be Yes or No." }, { status: 400 });
  }
  if (coffeeVendors === null) {
    return NextResponse.json({ ok: false, error: "Coffee vendors must be Yes or No." }, { status: 400 });
  }
  if (!Number.isInteger(vendorScore) || vendorScore < 1 || vendorScore > 5) {
    return NextResponse.json({ ok: false, error: "Vendor score must be 1 to 5." }, { status: 400 });
  }

  let resolvedProfileId: string | null = venueSportProfileId;
  if (!resolvedProfileId && sport && SPORT_PROFILE_SPORTS.has(sport) && venueId) {
    const { data } = await supabaseAdmin
      .from("venue_sport_profiles" as any)
      .select("id")
      .eq("venue_id", venueId)
      .eq("sport", sport)
      .maybeSingle();
    const id = typeof (data as any)?.id === "string" ? String((data as any).id) : "";
    resolvedProfileId = id && isUuid(id) ? id : null;
  }

  const payloadWithProfile = {
    p_venue_id: venueId,
    p_tournament_id: tournamentId || null,
    p_restrooms: restrooms,
    p_restroom_cleanliness: restroomCleanliness,
    p_player_parking_fee: playerParkingFee,
    p_parking_distance: parkingDistance,
    p_parking_convenience_score: parkingConvenienceScore,
    p_parking_notes: parkingNotes,
    p_bring_field_chairs: bringFieldChairs,
    p_seating_notes: seatingNotes,
    p_shade_score: shadeScore,
    p_food_vendors: foodVendors,
    p_coffee_vendors: coffeeVendors,
    p_vendor_score: vendorScore,
    p_venue_notes: venueNotes,
    p_venue_sport_profile_id: resolvedProfileId,
  };

  let rpc = await (auth.supabase as any).rpc("submit_venue_review", payloadWithProfile);
  if (rpc.error && /p_venue_sport_profile_id|function .*submit_venue_review/i.test(rpc.error.message || "")) {
    // Backward-compat for older DBs missing the new profile param.
    const { p_venue_sport_profile_id: _, ...legacyPayload } = payloadWithProfile as any;
    rpc = await (auth.supabase as any).rpc("submit_venue_review", legacyPayload);
  }

  const { error } = rpc;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, venue_id: venueId });
}
