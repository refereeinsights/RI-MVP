import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geocodeAddress } from "@/lib/google/geocodeAddress";
import { timezoneFromCoordinates } from "@/lib/google/timezoneFromCoordinates";
import { runVenueScan } from "@/server/owlseye/jobs/runVenueScan";
import { getLatestOwlReport } from "@/server/owlseye/pipeline/getLatestReport";
import { getAdminSupabase } from "@/server/owlseye/supabase/admin";
import { upsertNearbyForRun } from "@/owlseye/nearby/upsertNearbyForRun";

type Sport =
  | "soccer"
  | "basketball"
  | "baseball"
  | "softball"
  | "football"
  | "lacrosse"
  | "hockey"
  | "volleyball"
  | "futsal";
const SUPPORTED_SPORTS = new Set<Sport>([
  "soccer",
  "basketball",
  "baseball",
  "softball",
  "football",
  "lacrosse",
  "hockey",
  "volleyball",
  "futsal",
]);
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
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
};

type ExistingRunRow = {
  id?: string | null;
  run_id?: string | null;
  status?: string | null;
  sport?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type DuplicateCandidate = {
  venue_id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  score: number;
  has_owl_runs: boolean;
  owl_run_count: number;
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

function normalizeText(input: string | null | undefined) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStreet(input: string | null | undefined) {
  return normalizeText(input)
    .replace(/\b(street|st)\b/g, "st")
    .replace(/\b(avenue|ave)\b/g, "ave")
    .replace(/\b(road|rd)\b/g, "rd")
    .replace(/\b(boulevard|blvd)\b/g, "blvd")
    .replace(/\b(drive|dr)\b/g, "dr")
    .replace(/\b(lane|ln)\b/g, "ln")
    .replace(/\b(court|ct)\b/g, "ct")
    .replace(/\b(place|pl)\b/g, "pl")
    .trim();
}

function extractStreetNumber(input: string | null | undefined) {
  const match = normalizeText(input).match(/\b\d{2,6}\b/);
  return match ? match[0] : "";
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function findDuplicateVenueCandidates(args: {
  venueId: string;
  venue: VenueRow;
  venueLat: number | null;
  venueLng: number | null;
}) {
  const venueName = normalizeText(args.venue.name);
  const venueStreet = normalizeStreet(args.venue.address1 ?? args.venue.street ?? null);
  const venueCity = normalizeText(args.venue.city);
  const venueState = normalizeText(args.venue.state);
  const venueStreetNumber = extractStreetNumber(args.venue.address1 ?? args.venue.street ?? null);

  const candidateMap = new Map<
    string,
    {
      id: string;
      name: string | null;
      address1?: string | null;
      street?: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      latitude?: number | null;
      longitude?: number | null;
    }
  >();

  const seedName = venueName.split(" ").filter(Boolean).slice(0, 2).join(" ");
  const seedStreet = venueStreet.split(" ").filter(Boolean).slice(0, 3).join(" ");

  if (venueState) {
    if (seedName.length >= 3) {
      const { data } = await supabaseAdmin
        .from("venues" as any)
        .select("id,name,address1,street,city,state,zip,latitude,longitude")
        .eq("state", args.venue.state)
        .ilike("name", `%${seedName}%`)
        .limit(80);
      for (const row of (data ?? []) as any[]) candidateMap.set(row.id, row);
    }
    if (seedStreet.length >= 3) {
      const { data } = await supabaseAdmin
        .from("venues" as any)
        .select("id,name,address1,street,city,state,zip,latitude,longitude")
        .eq("state", args.venue.state)
        .or(`address1.ilike.%${seedStreet}%,street.ilike.%${seedStreet}%`)
        .limit(80);
      for (const row of (data ?? []) as any[]) candidateMap.set(row.id, row);
    }
  }

  candidateMap.delete(args.venueId);

  const scored = Array.from(candidateMap.values())
    .map((row) => {
      const rowName = normalizeText(row.name);
      const rowStreet = normalizeStreet(row.address1 ?? row.street ?? null);
      const rowCity = normalizeText(row.city);
      const rowState = normalizeText(row.state);
      const rowStreetNumber = extractStreetNumber(row.address1 ?? row.street ?? null);

      let score = 0;
      if (venueName && rowName && venueName === rowName) score += 50;
      else if (venueName && rowName && (venueName.includes(rowName) || rowName.includes(venueName))) score += 30;

      if (venueStreet && rowStreet && venueStreet === rowStreet) score += 45;
      else if (venueStreet && rowStreet && (venueStreet.includes(rowStreet) || rowStreet.includes(venueStreet))) score += 25;

      if (venueStreetNumber && rowStreetNumber && venueStreetNumber === rowStreetNumber) score += 15;
      if (venueCity && rowCity && venueCity === rowCity) score += 10;
      if (venueState && rowState && venueState === rowState) score += 10;

      const rowLat = typeof row.latitude === "number" && Number.isFinite(row.latitude) ? row.latitude : null;
      const rowLng = typeof row.longitude === "number" && Number.isFinite(row.longitude) ? row.longitude : null;
      if (args.venueLat != null && args.venueLng != null && rowLat != null && rowLng != null) {
        const meters = haversineMeters({ lat: args.venueLat, lng: args.venueLng }, { lat: rowLat, lng: rowLng });
        if (meters <= 120) score += 40;
        else if (meters <= 300) score += 25;
      }

      return { row, score };
    })
    .filter((item) => item.score >= 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  if (!scored.length) return [];

  const candidateIds = scored.map((item) => item.row.id);
  const { data: runRows } = await supabaseAdmin
    .from("owls_eye_runs" as any)
    .select("venue_id")
    .in("venue_id", candidateIds);

  const runCounts = new Map<string, number>();
  for (const row of (runRows ?? []) as Array<{ venue_id?: string | null }>) {
    const id = row.venue_id;
    if (!id) continue;
    runCounts.set(id, (runCounts.get(id) ?? 0) + 1);
  }

  const candidates: DuplicateCandidate[] = scored.map(({ row, score }) => {
    const count = runCounts.get(row.id) ?? 0;
    return {
      venue_id: row.id,
      name: row.name ?? null,
      address: (row.address1 ?? row.street ?? null) || null,
      city: row.city ?? null,
      state: row.state ?? null,
      zip: row.zip ?? null,
      score,
      has_owl_runs: count > 0,
      owl_run_count: count,
    };
  });

  return candidates.sort((a, b) => {
    if (a.has_owl_runs !== b.has_owl_runs) return a.has_owl_runs ? -1 : 1;
    return b.score - a.score;
  });
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
  const allowDuplicate = body?.allow_duplicate === true || body?.allow_duplicate === "true";

  if (!venueId || !isUuid(venueId)) {
    return NextResponse.json({ error: "invalid_venue_id" }, { status: 400 });
  }
  if (!sport || !SUPPORTED_SPORTS.has(sport)) {
    return NextResponse.json({ error: "invalid_sport" }, { status: 400 });
  }

  try {
    let venue: VenueRow | null = null;
    let venueError: any = null;
    try {
        const resp = await supabaseAdmin
          .from("venues" as any)
          .select("id,name,address1,street,city,state,zip,latitude,longitude,timezone")
          .eq("id", venueId)
          .maybeSingle();
      venue = resp.data as VenueRow | null;
      venueError = resp.error;
      if (venueError && (venueError.code === "42703" || venueError.code === "42P01")) {
        // Retry with minimal fields if columns are missing
        const fallback = await supabaseAdmin
          .from("venues" as any)
          .select("id,name,city,state,zip,latitude,longitude,timezone")
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
    const geocodeKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
    let venueLat = typeof venue.latitude === "number" && Number.isFinite(venue.latitude) ? venue.latitude : null;
    let venueLng = typeof venue.longitude === "number" && Number.isFinite(venue.longitude) ? venue.longitude : null;
    let venueTimezone = typeof venue.timezone === "string" ? venue.timezone.trim() : "";

    if ((venueLat == null || venueLng == null) && geocodeKey && address) {
      try {
        const geo = await geocodeAddress(address, geocodeKey);
        if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) {
          venueLat = geo.lat;
          venueLng = geo.lng;
          const updates: Record<string, any> = {
            latitude: geo.lat,
            longitude: geo.lng,
            geocode_source: "owls_eye_run",
            updated_at: new Date().toISOString(),
          };
          if (!venueTimezone) {
            const tz = await timezoneFromCoordinates(geo.lat, geo.lng, geocodeKey);
            if (tz) {
              venueTimezone = tz;
              updates.timezone = tz;
            }
          }
          await supabaseAdmin.from("venues" as any).update(updates).eq("id", venueId);
        }
      } catch (err) {
        console.warn("[owlseye] auto-geocode failed", err);
      }
    }

    if (!force && !allowDuplicate) {
      const duplicateCandidates = await findDuplicateVenueCandidates({
        venueId,
        venue: venue as VenueRow,
        venueLat,
        venueLng,
      });

      if (duplicateCandidates.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            code: "DUPLICATE_VENUE_SUSPECT",
            message:
              "Possible duplicate venue(s) found. Use an existing venue ID or run anyway for this venue.",
            candidates: duplicateCandidates,
          },
          { status: 409 }
        );
      }
    }

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
      const lat = (venueResp.data as any)?.latitude ?? venueLat ?? null;
      const lng = (venueResp.data as any)?.longitude ?? venueLng ?? null;
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
