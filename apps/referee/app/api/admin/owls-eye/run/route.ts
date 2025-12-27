import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runVenueScan } from "@/server/owlseye/jobs/runVenueScan";
import { getLatestOwlReport } from "@/server/owlseye/pipeline/getLatestReport";

type Sport = "soccer" | "basketball";
type RunResponse =
  | { ok: true; report: Awaited<ReturnType<typeof runVenueScan>> }
  | { ok: false; error: string; report?: Awaited<ReturnType<typeof runVenueScan>> };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type VenueRow = {
  id: string;
  name: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport: Sport | null;
};

async function ensureAdminRequest() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return data.user;
}

function buildAddress(venue: VenueRow) {
  const parts = [venue.street, venue.city, venue.state, venue.zip].filter(Boolean);
  return parts.join(", ");
}

export async function POST(request: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const venueId = typeof body?.venue_id === "string" ? body.venue_id.trim() : "";
  const sport = body?.sport as Sport | undefined;
  const publishedMapUrl = typeof body?.published_map_url === "string" ? body.published_map_url.trim() : "";
  const force = body?.force === true || body?.force === "true";

  if (!venueId || !isUuid(venueId)) {
    return NextResponse.json({ error: "invalid_venue_id" }, { status: 400 });
  }
  if (sport !== "soccer" && sport !== "basketball") {
    return NextResponse.json({ error: "invalid_sport" }, { status: 400 });
  }

  try {
    const { data: venue, error: venueError } = await supabaseAdmin
      .from("venues" as any)
      .select("id,name,street,city,state,zip,sport")
      .eq("id", venueId)
      .maybeSingle();

    if (venueError) {
      console.error("Owl's Eye venue lookup failed", venueError);
      return NextResponse.json({ error: "venue_lookup_failed" }, { status: 500 });
    }

    if (!venue) {
      return NextResponse.json({ error: "venue_not_found" }, { status: 404 });
    }

    const latestReport = await getLatestOwlReport({ venue_id: venueId, sport });
    if (latestReport && latestReport.expires_at) {
      const expires = new Date(latestReport.expires_at);
      if (!isNaN(expires.valueOf()) && expires > new Date() && !force) {
        return NextResponse.json(
          {
            ok: false,
            code: "REPORT_EXISTS",
            message: "Owl's Eye report already exists and is not expired. Use force=true to refresh.",
            existing: {
              computed_at: latestReport.computed_at,
              expires_at: latestReport.expires_at,
            },
          },
          { status: 409 }
        );
      }
    }

    const address = buildAddress(venue as VenueRow);

    const result = await runVenueScan({
      venueId,
      sport,
      publishedMapUrl: publishedMapUrl || null,
      address: address || null,
    });

    if (result.status === "failed") {
      return NextResponse.json<RunResponse>(
        { ok: false, error: result.message ?? "run_failed", report: result },
        { status: 500 }
      );
    }

    return NextResponse.json<RunResponse>({ ok: true, report: result });
  } catch (err) {
    return NextResponse.json<RunResponse>(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
