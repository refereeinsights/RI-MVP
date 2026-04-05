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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, any> | null;
    if (!body) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

    const honeypot = (body as any)?.website || "";
    if (honeypot) return NextResponse.json({ ok: false, error: "Rejected" }, { status: 400 });

    const venueId = typeof body.venue_id === "string" ? body.venue_id.trim() : "";
    if (!venueId) return NextResponse.json({ ok: false, error: "venue_id required" }, { status: 400 });

    const browserHash = typeof body.browser_hash === "string" ? body.browser_hash.slice(0, 128) : "";
    const sourcePageType = typeof body.source_page_type === "string" ? body.source_page_type.slice(0, 40) : null;
    const sourceTournamentId =
      typeof body.source_tournament_id === "string" && body.source_tournament_id && isUuid(body.source_tournament_id)
        ? body.source_tournament_id
        : null;

    const restroomCleanliness = validateScore(body.restroom_cleanliness);
    const shadeScore = validateScore(body.shade_score);

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

    let bringFieldChairs: boolean | null = null;
    if (body.bring_field_chairs !== undefined) {
      if (typeof body.bring_field_chairs !== "boolean") {
        return NextResponse.json({ ok: false, error: "Invalid bring_field_chairs" }, { status: 400 });
      }
      bringFieldChairs = body.bring_field_chairs;
    }

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
    ].filter((v) => v !== null).length;
    if (filled < 1) {
      return NextResponse.json({ ok: false, error: "Select at least one item" }, { status: 400 });
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

    const { error } = await supabaseAdmin.from("venue_quick_checks" as any).insert({
      venue_id: venueId,
      restroom_cleanliness: restroomCleanliness,
      parking_distance: parkingDistance,
      parking_convenience_score: parkingConvenienceScore,
      shade_score: shadeScore,
      bring_field_chairs: bringFieldChairs,
      restroom_type: restroomType,
      source_page_type: sourcePageType,
      source_tournament_id: sourceTournamentId,
      browser_hash: browserHash || null,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Recompute aggregates
    await supabaseAdmin.rpc("recompute_venue_review_aggregates", { p_venue_id: venueId });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Server error" }, { status: 500 });
  }
}
