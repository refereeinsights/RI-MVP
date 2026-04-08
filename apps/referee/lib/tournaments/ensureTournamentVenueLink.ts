"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function ensureTournamentVenueLink(
  tournamentId: string
): Promise<{
  linked: boolean;
  attempted: boolean;
  venue_created: boolean;
  venue_matched: boolean;
  error?: string;
}> {
  const clean = (value: unknown): string | null => {
    const v = String(value ?? "").trim();
    return v ? v : null;
  };
  const cleanState = (value: unknown): string | null => {
    const v = clean(value);
    return v ? v.toUpperCase() : null;
  };

  const { data: existingLinks, error: existingErr } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select("venue_id")
    .eq("tournament_id", tournamentId)
    .eq("is_inferred", false)
    .limit(1);
  if (existingErr) {
    return {
      linked: false,
      attempted: false,
      venue_created: false,
      venue_matched: false,
      error: existingErr.message || "failed_check_links",
    };
  }
  if ((existingLinks ?? []).length > 0) {
    return { linked: true, attempted: false, venue_created: false, venue_matched: false };
  }

  const { data: tournament, error: tournamentErr } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,venue,address,city,state,zip,sport")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tournamentErr) {
    return {
      linked: false,
      attempted: false,
      venue_created: false,
      venue_matched: false,
      error: tournamentErr.message || "failed_load_tournament",
    };
  }
  if (!tournament) {
    return { linked: false, attempted: false, venue_created: false, venue_matched: false, error: "tournament_not_found" };
  }

  const venueAddress = clean((tournament as any).address);
  const venueName = clean((tournament as any).venue) ?? (venueAddress ? venueAddress : null);
  const venueCity = clean((tournament as any).city);
  const venueState = cleanState((tournament as any).state);
  const venueZip = clean((tournament as any).zip);
  const venueSport = clean((tournament as any).sport);

  const hasVenueInfo = Boolean(venueName || venueAddress);
  const hasLocation = Boolean(venueCity || venueState);
  if (!hasVenueInfo || !hasLocation) {
    return { linked: false, attempted: false, venue_created: false, venue_matched: false };
  }

  const applyNullableFilter = (query: any, field: string, value: string | null) => {
    if (value === null) return query.is(field, null);
    return query.eq(field, value);
  };

  const existingVenueQuery = supabaseAdmin.from("venues" as any).select("id").limit(1);
  const existingVenueRes = await applyNullableFilter(
    applyNullableFilter(applyNullableFilter(applyNullableFilter(existingVenueQuery, "name", venueName), "address", venueAddress), "city", venueCity),
    "state",
    venueState
  ).maybeSingle();
  if (existingVenueRes.error) {
    return {
      linked: false,
      attempted: true,
      venue_created: false,
      venue_matched: false,
      error: existingVenueRes.error.message || "failed_lookup_venue",
    };
  }

  let venueId = (existingVenueRes.data as any)?.id as string | undefined;
  let venueMatched = Boolean(venueId);
  let venueCreated = false;
  if (!venueId) {
    const insertPayload: Record<string, unknown> = {
      name: venueName,
      address: venueAddress,
      city: venueCity,
      state: venueState,
      zip: venueZip,
      sport: venueSport,
    };
    const insertRes = await supabaseAdmin.from("venues" as any).insert(insertPayload).select("id").single();
    if (insertRes.error) {
      if ((insertRes.error as any).code === "23505") {
        const retryRes = await applyNullableFilter(
          applyNullableFilter(
            applyNullableFilter(applyNullableFilter(supabaseAdmin.from("venues" as any).select("id").limit(1), "name", venueName), "address", venueAddress),
            "city",
            venueCity
          ),
          "state",
          venueState
        ).maybeSingle();
        venueId = (retryRes.data as any)?.id as string | undefined;
        venueMatched = Boolean(venueId);
        if (!venueId) {
          return {
            linked: false,
            attempted: true,
            venue_created: false,
            venue_matched: false,
            error: retryRes.error?.message || "failed_create_venue",
          };
        }
      } else {
        return {
          linked: false,
          attempted: true,
          venue_created: false,
          venue_matched: false,
          error: insertRes.error.message || "failed_create_venue",
        };
      }
    } else {
      venueId = (insertRes.data as any)?.id as string | undefined;
      venueCreated = Boolean(venueId);
    }
  }

  if (!venueId) {
    return { linked: false, attempted: true, venue_created: false, venue_matched: false, error: "missing_venue_id" };
  }

  const linkRes = await supabaseAdmin
    .from("tournament_venues" as any)
    .upsert({ tournament_id: tournamentId, venue_id: venueId, is_inferred: false }, { onConflict: "tournament_id,venue_id" });
  if (linkRes.error && (linkRes.error as any).code !== "23505") {
    return {
      linked: false,
      attempted: true,
      venue_created: venueCreated,
      venue_matched: venueMatched,
      error: linkRes.error.message || "failed_link_venue",
    };
  }

  return { linked: true, attempted: true, venue_created: venueCreated, venue_matched: venueMatched };
}
