import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/venues/isUuid";

export const runtime = "nodejs";

const TIMEZONEDB_URL = "https://api.timezonedb.com/v2.1/get-time-zone";

type TimeZoneDbResponse = { status?: string; zoneName?: string; message?: string };

function safeTimeZone(value: string | null) {
  const v = String(value ?? "").trim();
  if (!v || v.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v }).format(new Date());
    return v;
  } catch {
    return null;
  }
}

function asFiniteNumber(value: string | null) {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function roundCoord(n: number) {
  // 4 decimals ~ 11m precision; good enough for tz boundaries and caching.
  return Math.round(n * 10_000) / 10_000;
}

const cache = new Map<string, string | null>();

async function timeZoneFromCoordinates(lat: number, lng: number): Promise<string | null> {
  const key = String(process.env.TIMEZONEDB_API_KEY ?? "").trim();
  if (!key) return null;

  const cacheKey = `${roundCoord(lat)},${roundCoord(lng)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const url = `${TIMEZONEDB_URL}?key=${encodeURIComponent(key)}&format=json&by=position&lat=${encodeURIComponent(
    String(lat)
  )}&lng=${encodeURIComponent(String(lng))}`;
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) {
    cache.set(cacheKey, null);
    return null;
  }
  const json = (await resp.json().catch(() => null)) as TimeZoneDbResponse | null;
  const zone = safeTimeZone(json?.status === "OK" ? String(json?.zoneName ?? "").trim() : null);
  cache.set(cacheKey, zone);
  return zone;
}

async function coordsForVenueId(venueId: string): Promise<{ lat: number; lng: number } | null> {
  const { data, error } = await (supabaseAdmin.from("venues" as any) as any)
    .select("latitude,longitude")
    .eq("id", venueId)
    .maybeSingle();
  if (error || !data) return null;
  const lat = typeof data.latitude === "number" ? data.latitude : Number(data.latitude);
  const lng = typeof data.longitude === "number" ? data.longitude : Number(data.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function coordsForTournamentId(tournamentId: string): Promise<{ lat: number; lng: number } | null> {
  const { data, error } = await (supabaseAdmin.from("tournaments" as any) as any)
    .select("latitude,longitude")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error || !data) return null;
  const lat = typeof data.latitude === "number" ? data.latitude : Number(data.latitude);
  const lng = typeof data.longitude === "number" ? data.longitude : Number(data.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function GET(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;

  const venueIdRaw = sp.get("venue_id");
  const tournamentIdRaw = sp.get("tournament_id");
  const latRaw = sp.get("lat");
  const lngRaw = sp.get("lng");

  const venueId = venueIdRaw && isUuid(venueIdRaw) ? venueIdRaw : null;
  const tournamentId = tournamentIdRaw && isUuid(tournamentIdRaw) ? tournamentIdRaw : null;
  const lat = asFiniteNumber(latRaw);
  const lng = asFiniteNumber(lngRaw);

  if ((venueIdRaw && !venueId) || (tournamentIdRaw && !tournamentId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  if ((latRaw && lat === null) || (lngRaw && lng === null)) {
    return NextResponse.json({ ok: false, error: "invalid_coords" }, { status: 400 });
  }

  // Prefer venue/tournament IDs so the client doesn't need coordinates.
  let coords: { lat: number; lng: number } | null = null;
  if (venueId) coords = await coordsForVenueId(venueId);
  else if (tournamentId) coords = await coordsForTournamentId(tournamentId);
  else if (lat !== null && lng !== null) coords = { lat, lng };

  if (!coords) return NextResponse.json({ ok: true, timezone: null });

  const timezone = await timeZoneFromCoordinates(coords.lat, coords.lng);
  return NextResponse.json({ ok: true, timezone });
}

