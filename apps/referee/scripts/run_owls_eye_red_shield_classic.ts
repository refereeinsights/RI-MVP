import { runVenueScan } from "@/server/owlseye/jobs/runVenueScan";
import { getAdminSupabase } from "@/server/owlseye/supabase/admin";
import { geocodeAddress } from "@/lib/google/geocodeAddress";
import { timezoneFromCoordinates } from "@/lib/google/timezoneFromCoordinates";
import { upsertNearbyForRun } from "@/owlseye/nearby/upsertNearbyForRun";
import { findNearestAirports } from "@/server/owlseye/airports/findNearestAirports";

const TOURNAMENT_ID = "0365c9b6-7f28-4103-8d21-5b05f676e426"; // Red Shield Classic
const SPORT = "soccer" as const;

type VenueRow = {
  id: string;
  name: string | null;
  address?: string | null;
  address1?: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
};

function isFiniteNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function buildAddress(venue: VenueRow) {
  const street = venue.address1 ?? venue.address ?? null;
  const parts = [street, venue.city, venue.state, venue.zip].filter(Boolean);
  return parts.join(", ");
}

function hasCompleteAddress(venue: VenueRow) {
  const street = String(venue.address1 ?? venue.address ?? "").trim();
  const city = String(venue.city ?? "").trim();
  const state = String(venue.state ?? "").trim();
  return Boolean(street) && Boolean(city) && Boolean(state);
}

async function ensureLatLngAndTimezone(venue: VenueRow) {
  const supabase = getAdminSupabase();
  const geocodeKey =
    process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";

  let lat = isFiniteNumber(venue.latitude) ? venue.latitude : null;
  let lng = isFiniteNumber(venue.longitude) ? venue.longitude : null;
  let tz = String(venue.timezone ?? "").trim();

  if ((lat == null || lng == null) && geocodeKey && hasCompleteAddress(venue)) {
    const address = buildAddress(venue);
    try {
      const geo = await geocodeAddress(address, geocodeKey);
      if (geo && isFiniteNumber(geo.lat) && isFiniteNumber(geo.lng)) {
        lat = geo.lat;
        lng = geo.lng;

        const updates: Record<string, any> = {
          latitude: geo.lat,
          longitude: geo.lng,
          geocode_source: "owls_eye_bulk",
          updated_at: new Date().toISOString(),
        };

        if (!tz) {
          const inferred = await timezoneFromCoordinates(geo.lat, geo.lng, geocodeKey);
          if (inferred) {
            tz = inferred;
            updates.timezone = inferred;
          }
        }

        await supabase.from("venues" as any).update(updates).eq("id", venue.id);
      }
    } catch (err) {
      console.warn("[owls-eye-bulk] geocode failed", venue.id, err);
    }
  }

  return { lat, lng, timezone: tz || null };
}

async function updateRunOutputs(runId: string, outputs: any) {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  // Try to persist outputs; older schema might not have outputs/updated_at.
  let resp = await supabase
    .from("owls_eye_runs" as any)
    .update({ outputs, updated_at: now })
    .eq("id", runId);

  if (resp.error && (resp.error.code === "42703" || resp.error.code === "PGRST204")) {
    resp = await supabase.from("owls_eye_runs" as any).update({ outputs }).eq("id", runId);
  }

  if (resp.error && resp.error.code !== "42703" && resp.error.code !== "PGRST204") {
    console.warn("[owls-eye-bulk] could not persist outputs", runId, resp.error);
  }
}

async function main() {
  const supabase = getAdminSupabase();

  const tv = await supabase
    .from("tournament_venues" as any)
    .select("venue_id")
    .eq("tournament_id", TOURNAMENT_ID);
  if (tv.error) throw tv.error;

  const venueIds = (tv.data ?? []).map((r: any) => String(r.venue_id)).filter(Boolean);
  console.log(`[owls-eye-bulk] Red Shield Classic venues: ${venueIds.length}`);
  if (!venueIds.length) return;

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < venueIds.length; i++) {
    const venueId = venueIds[i];
    const prefix = `[owls-eye-bulk] (${i + 1}/${venueIds.length}) ${venueId}`;

    const vResp = await supabase
      .from("venues" as any)
      // Keep the select list conservative; some deployments may not have newer columns.
      .select("id,name,address,address1,city,state,zip,latitude,longitude,timezone")
      .eq("id", venueId)
      .maybeSingle();
    if (vResp.error) {
      failed++;
      console.error(prefix, "venue lookup failed", vResp.error);
      continue;
    }
    const venue = vResp.data as VenueRow | null;
    if (!venue) {
      failed++;
      console.error(prefix, "venue not found");
      continue;
    }

    if (!hasCompleteAddress(venue)) {
      skipped++;
      console.warn(prefix, `skipping (incomplete address): ${buildAddress(venue)}`);
      continue;
    }

    const { lat, lng } = await ensureLatLngAndTimezone(venue);
    if (lat == null || lng == null) {
      skipped++;
      console.warn(prefix, "skipping (no lat/lng after geocode)");
      continue;
    }

    const result = await runVenueScan({ venueId, sport: SPORT, publishedMapUrl: null, address: buildAddress(venue) });
    if (result.status !== "complete") {
      failed++;
      console.error(prefix, "run failed", result.message);
      continue;
    }

    // Always force refresh nearby for bulk runs so the UI immediately has data.
    let nearbyMeta: any = null;
    try {
      nearbyMeta = await upsertNearbyForRun({
        supabaseAdmin: supabase,
        runId: result.runId,
        venueId,
        sport: SPORT,
        venueLat: lat,
        venueLng: lng,
        force: true,
      });
    } catch (err) {
      console.warn(prefix, "nearby failed", err);
    }

    let airports: any = null;
    try {
      airports = await findNearestAirports({ lat, lng });
    } catch (err) {
      console.warn(prefix, "airports failed", err);
    }

    await updateRunOutputs(result.runId, {
      airports: airports ?? undefined,
      nearby_meta: nearbyMeta ?? undefined,
    });

    ok++;
    const name = venue.name || "(no name)";
    const address = buildAddress(venue);
    console.log(prefix, `ok :: ${name} :: ${address}`);
  }

  console.log(`[owls-eye-bulk] done`, { ok, failed, skipped, total: venueIds.length });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
