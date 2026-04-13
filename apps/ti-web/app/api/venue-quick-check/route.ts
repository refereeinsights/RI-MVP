import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const PARKING_MAP: Record<string, number> = { Close: 5, Medium: 3, Far: 1 };
const RESTROOM_TYPES = new Set(["Portable", "Building", "Both"]);
const PARKING_VALUES = new Set(["Close", "Medium", "Far"]);

function validateScore(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new Error("Score must be integer 1-5");
  }
  return n;
}

function validateOptionalBoolean(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "boolean") {
    throw new Error("Invalid boolean");
  }
  return value;
}

function validateOptionalText(value: unknown, max = 255) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, any> | null;
    if (!body) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const honeypot = (body as any)?.website || "";
    if (honeypot) return NextResponse.json({ ok: false, error: "Rejected" }, { status: 400 });

    const venueId = typeof body.venue_id === "string" ? body.venue_id.trim() : "";
    if (!venueId) return NextResponse.json({ ok: false, error: "venue_id required" }, { status: 400 });

    let venueSportProfileId: string | null =
      typeof body.venue_sport_profile_id === "string" && isUuid(body.venue_sport_profile_id)
        ? body.venue_sport_profile_id
        : null;
    const sport = typeof body.sport === "string" ? body.sport.trim().toLowerCase() : "";

    const browserHash = typeof body.browser_hash === "string" ? body.browser_hash.slice(0, 128) : "";
    const sourcePageType = typeof body.source_page_type === "string" ? body.source_page_type.slice(0, 40) : null;
    const sourceTournamentId =
      typeof body.source_tournament_id === "string" && body.source_tournament_id && isUuid(body.source_tournament_id)
        ? body.source_tournament_id
        : null;

    const restroomCleanliness = validateScore(body.restroom_cleanliness);
    const shadeScore = validateScore(body.shade_score);
    const foodVendors = validateOptionalBoolean(body.food_vendors);
    const coffeeVendors = validateOptionalBoolean(body.coffee_vendors);
    const rawVendorScore = validateScore(body.vendor_score);
    const venueNotes = validateOptionalText(body.venue_notes, 255);

    const vendorScore = foodVendors === true || coffeeVendors === true ? rawVendorScore : null;

    let parkingDistance: string | null = null;
    let parkingConvenienceScore: number | null = null;
    if (body.parking_distance) {
      const distance = String(body.parking_distance);
      if (!PARKING_VALUES.has(distance)) {
        return NextResponse.json({ ok: false, error: "Invalid parking_distance" }, { status: 400 });
      }
      parkingDistance = distance;
      parkingConvenienceScore = PARKING_MAP[distance];
    }

    const bringFieldChairs = validateOptionalBoolean(body.bring_field_chairs);

    let restroomType: string | null = null;
    if (body.restroom_type) {
      if (!RESTROOM_TYPES.has(body.restroom_type)) {
        return NextResponse.json({ ok: false, error: "Invalid restroom_type" }, { status: 400 });
      }
      restroomType = body.restroom_type;
    }

    // Require at least one field (all fields optional, but not empty submissions)
    const filled = [
      restroomCleanliness,
      shadeScore,
      parkingDistance,
      bringFieldChairs,
      restroomType,
      foodVendors,
      coffeeVendors,
      vendorScore,
      venueNotes,
    ].filter((v) => v !== null).length;
    if (filled < 1) {
      return NextResponse.json({ ok: false, error: "Select at least one item" }, { status: 400 });
    }

    if (!venueSportProfileId && sport && SPORT_PROFILE_SPORTS.has(sport)) {
      const { data } = await supabaseAdmin
        .from("venue_sport_profiles" as any)
        .select("id")
        .eq("venue_id", venueId)
        .eq("sport", sport)
        .maybeSingle();
      const id = typeof (data as any)?.id === "string" ? String((data as any).id) : "";
      venueSportProfileId = id && isUuid(id) ? id : null;
    }

    // Rate limit: one per venue/browser per 30 days
    if (browserHash) {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("venue_quick_checks" as any)
        .select("id", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .eq("browser_hash", browserHash)
        .gte("created_at", cutoff);
      if ((count ?? 0) > 0) {
        return NextResponse.json({ ok: false, error: "Already submitted recently" }, { status: 429 });
      }
    }

    const insertPayload: Record<string, any> = {
      venue_id: venueId,
      restroom_cleanliness: restroomCleanliness,
      parking_distance: parkingDistance,
      parking_convenience_score: parkingConvenienceScore,
      shade_score: shadeScore,
      bring_field_chairs: bringFieldChairs,
      restroom_type: restroomType,
      food_vendors: foodVendors,
      coffee_vendors: coffeeVendors,
      vendor_score: vendorScore,
      venue_notes: venueNotes,
      source_page_type: sourcePageType,
      source_tournament_id: sourceTournamentId,
      browser_hash: browserHash || null,
      venue_sport_profile_id: venueSportProfileId,
    };

    let insert = await supabaseAdmin
      .from("venue_quick_checks" as any)
      .insert(insertPayload)
      .select("id,created_at")
      .maybeSingle();
    if (insert.error && /venue_sport_profile_id|column .* does not exist/i.test(insert.error.message || "")) {
      // Backward-compat for older DBs missing the new profile column.
      delete insertPayload.venue_sport_profile_id;
      venueSportProfileId = null;
      insert = await supabaseAdmin
        .from("venue_quick_checks" as any)
        .insert(insertPayload)
        .select("id,created_at")
        .maybeSingle();
    }

    if (insert.error && /food_vendors|coffee_vendors|vendor_score|venue_notes|column .* does not exist/i.test(insert.error.message || "")) {
      // Backward-compat for older DBs missing the new quick-check columns.
      delete insertPayload.food_vendors;
      delete insertPayload.coffee_vendors;
      delete insertPayload.vendor_score;
      delete insertPayload.venue_notes;
      insert = await supabaseAdmin
        .from("venue_quick_checks" as any)
        .insert(insertPayload)
        .select("id,created_at")
        .maybeSingle();
    }

    const { error, data } = insert as any;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Recompute aggregates
    await supabaseAdmin.rpc("recompute_venue_review_aggregates", { p_venue_id: venueId });
    if (venueSportProfileId) {
      try {
        await supabaseAdmin.rpc("recompute_venue_sport_profile_review_aggregates", {
          p_venue_sport_profile_id: venueSportProfileId,
        });
      } catch {
        // ignore missing RPC
      }
    }

    return NextResponse.json({ ok: true, quick_check_id: data?.id ?? null, created_at: data?.created_at ?? null });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Server error" }, { status: 500 });
  }
}
