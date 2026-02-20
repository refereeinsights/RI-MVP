import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runVenueScan } from "@/server/owlseye/jobs/runVenueScan";
import { getLatestOwlReport } from "@/server/owlseye/pipeline/getLatestReport";
import { getAdminSupabase } from "@/server/owlseye/supabase/admin";
import { upsertNearbyForRun } from "@/owlseye/nearby/upsertNearbyForRun";

type Sport = "soccer" | "basketball";
type RunResponse =
  | { ok: true; report: Awaited<ReturnType<typeof runVenueScan>> & { nearby?: any } }
  | { ok: false; error: string; report?: Awaited<ReturnType<typeof runVenueScan>> };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type VenueRow = {
  id: string;
  name: string | null;
  address1?: string | null;
  street?: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type ExistingRunRow = {
  id?: string | null;
  run_id?: string | null;
  status?: string | null;
  sport?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

async function ensureAdminRequest() {
  const headerToken = headers().get("x-owls-eye-admin-token");
  const envToken = process.env.OWLS_EYE_ADMIN_TOKEN;
  if (headerToken && (!envToken || headerToken === envToken)) return true;

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
  const street = venue.address1 ?? venue.street ?? null;
  const parts = [street, venue.city, venue.state, venue.zip].filter(Boolean);
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
    let venue: VenueRow | null = null;
    let venueError: any = null;
    try {
      const resp = await supabaseAdmin
        .from("venues" as any)
        .select("id,name,address1,street,city,state,zip")
        .eq("id", venueId)
        .maybeSingle();
      venue = resp.data as VenueRow | null;
      venueError = resp.error;
      if (venueError && (venueError.code === "42703" || venueError.code === "42P01")) {
        // Retry with minimal fields if columns are missing
        const fallback = await supabaseAdmin
          .from("venues" as any)
          .select("id,name,city,state,zip")
          .eq("id", venueId)
          .maybeSingle();
        venue = fallback.data as VenueRow | null;
        venueError = fallback.error;
      }
    } catch (err) {
      venueError = err;
    }

    if (venueError) {
      console.error("Owl's Eye venue lookup failed", venueError);
      return NextResponse.json(
        { error: "venue_lookup_failed", code: (venueError as any)?.code, message: (venueError as any)?.message },
        { status: 500 }
      );
    }

    if (!venue) {
      return NextResponse.json({ error: "venue_not_found" }, { status: 404 });
    }

    let latestReport: Awaited<ReturnType<typeof getLatestOwlReport>> = null;
    try {
      latestReport = await getLatestOwlReport({ venue_id: venueId, sport });
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
    } catch (err) {
      const errCode = (err as any)?.code;
      if (errCode === "42P01" || errCode === "42703" || errCode === "PGRST205") {
        console.warn("[owlseye] owl_reports table missing or not cached; proceeding without dedupe");
      } else {
        console.error("[owlseye] getLatestOwlReport failed", err);
      }
    }

    const address = buildAddress(venue as VenueRow);

    if (!force) {
      const existingRun = await supabaseAdmin
        .from("owls_eye_runs" as any)
        .select("id,run_id,status,sport,updated_at,created_at")
        .eq("venue_id", venueId)
        .eq("sport", sport)
        .in("status", ["running", "complete"])
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<ExistingRunRow>();

      if (existingRun.data) {
        const row = existingRun.data;
        return NextResponse.json(
          {
            ok: false,
            code: "VENUE_ALREADY_SCANNED",
            message: "Owl's Eye has already been run for this venue/sport. Use force=true to refresh.",
            existing: {
              run_id: row.run_id ?? row.id ?? null,
              status: row.status ?? null,
              sport: row.sport ?? null,
              updated_at: row.updated_at ?? row.created_at ?? null,
            },
          },
          { status: 409 }
        );
      }
    }

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

    let nearby: any = null;
    let nearbyMeta: any = null;
    try {
      // ensure nearby exists (force refresh for immediate response)
      const supabase = getAdminSupabase();
      const venueResp = await supabase
        .from("venues" as any)
        .select("latitude,longitude")
        .eq("id", venueId)
        .maybeSingle();
      const lat = (venueResp.data as any)?.latitude ?? null;
      const lng = (venueResp.data as any)?.longitude ?? null;
      if (typeof lat === "number" && typeof lng === "number" && isFinite(lat) && isFinite(lng)) {
        const nearbyResult = (await upsertNearbyForRun({
          supabaseAdmin: supabase,
          runId: result.runId,
          venueId,
          sport,
          venueLat: lat,
          venueLng: lng,
          // Only force refresh when requested; otherwise reuse cached nearby rows to save Places calls.
          force,
        })) as any;
        nearbyMeta = nearbyResult;
        if (nearbyResult && nearbyResult.ok === false) {
          console.warn("[owlseye] Nearby upsert result", nearbyResult);
        }
      }

      const { data } = await supabase
        .from("owls_eye_nearby_food" as any)
        .select("*")
        .eq("run_id", result.runId)
        .order("is_sponsor", { ascending: false })
        .order("distance_meters", { ascending: true })
        .order("name", { ascending: true });
      if (data) {
        nearby = {
          food: data
            .filter((f: any) => (f.category ?? "food") === "food")
            .map((f: any) => ({
              name: f.name,
              distance_meters: f.distance_meters ?? null,
              address: f.address ?? "",
              is_sponsor: Boolean(f.is_sponsor),
              sponsor_click_url: f.sponsor_click_url ?? undefined,
              maps_url: f.maps_url ?? undefined,
            })),
          coffee: data
            .filter((f: any) => f.category === "coffee")
            .map((f: any) => ({
              name: f.name,
              distance_meters: f.distance_meters ?? null,
              address: f.address ?? "",
              is_sponsor: Boolean(f.is_sponsor),
              sponsor_click_url: f.sponsor_click_url ?? undefined,
              maps_url: f.maps_url ?? undefined,
            })),
          hotels: data
            .filter((f: any) => f.category === "hotel")
            .map((f: any) => ({
              name: f.name,
              distance_meters: f.distance_meters ?? null,
              address: f.address ?? "",
              is_sponsor: Boolean(f.is_sponsor),
              sponsor_click_url: f.sponsor_click_url ?? undefined,
              maps_url: f.maps_url ?? undefined,
            })),
        };
      }
    } catch (err) {
      console.error("[owlseye] Nearby fetch in run route failed", err);
    }

    return NextResponse.json({ ok: true, report: { ...result, nearby, nearby_meta: nearbyMeta } });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
        ? err
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return "unknown error";
            }
          })();
    console.error("[owlseye] run POST failed", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
