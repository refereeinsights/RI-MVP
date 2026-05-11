import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildVenueAddressFingerprint, buildVenueNameCityStateFingerprint } from "@/lib/identity/fingerprints";

export const runtime = "nodejs";

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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function cleanText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeAddressForBlocklist(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlockedOrganizerAddress(value: unknown) {
  const normalized = normalizeAddressForBlocklist(value);
  if (!normalized) return false;
  return normalized.includes("1529") && (normalized.includes("3rd") || normalized.includes("third")) && normalized.includes("32250");
}

function looksLikeStreetAddress(addressText: string) {
  const addr = String(addressText ?? "").trim();
  if (!addr) return false;
  if (/^[a-z .'-]{2,60},\s*[a-z]{2}$/i.test(addr)) return false;
  return /\b\d{1,6}\s+/.test(addr);
}

type Candidate = {
  venue_name?: string | null;
  venue_address?: string | null;
  venue_city?: string | null;
  venue_state?: string | null;
  venue_zip?: string | null;
  venue_url?: string | null;
};

async function getOrCreateVenueFromCandidate(args: {
  venue_name: string | null;
  venue_address: string;
  venue_city: string;
  venue_state: string;
  venue_zip: string | null;
  venue_url: string | null;
}) {
  const address = cleanText(args.venue_address);
  const city = cleanText(args.venue_city);
  const state = cleanText(args.venue_state)?.toUpperCase();
  if (!address || !city || !state) throw new Error("venue_missing_address_city_or_state");

  const addressFingerprint = buildVenueAddressFingerprint({ address, city, state });
  const nameFingerprint = buildVenueNameCityStateFingerprint({ name: cleanText(args.venue_name), city, state });

  if (addressFingerprint) {
    const { data: hits, error } = await supabaseAdmin
      .from("venues" as any)
      .select("id,venue_url,name")
      .eq("address_fingerprint", addressFingerprint)
      .limit(10);
    if (error) throw error;
    const rows = (hits ?? []) as any[];
    if (rows.length) {
      let pick = rows[0] as any;
      if (nameFingerprint) {
        const exact = rows.find((r) => String(r?.name_city_state_fingerprint ?? "") === nameFingerprint);
        if (exact) pick = exact;
      }
      const patch: Record<string, unknown> = {};
      if (args.venue_url && !cleanText(pick?.venue_url)) patch.venue_url = args.venue_url;
      if (args.venue_zip) patch.zip = args.venue_zip;
      if (cleanText(args.venue_name) && !cleanText(pick?.name)) patch.name = args.venue_name;
      if (Object.keys(patch).length) {
        const { error: updErr } = await supabaseAdmin.from("venues" as any).update(patch).eq("id", pick.id);
        if (updErr) throw updErr;
      }
      return { id: String(pick.id) };
    }
  }

  if (nameFingerprint) {
    const { data: hits, error } = await supabaseAdmin
      .from("venues" as any)
      .select("id,venue_url,name")
      .eq("name_city_state_fingerprint", nameFingerprint)
      .limit(5);
    if (error) throw error;
    const pick = (hits ?? [])[0] as any;
    if (pick?.id) {
      const patch: Record<string, unknown> = {};
      if (args.venue_url && !cleanText(pick?.venue_url)) patch.venue_url = args.venue_url;
      if (args.venue_zip) patch.zip = args.venue_zip;
      if (Object.keys(patch).length) {
        const { error: updErr } = await supabaseAdmin.from("venues" as any).update(patch).eq("id", pick.id);
        if (updErr) throw updErr;
      }
      return { id: String(pick.id) };
    }
  }

  const venueNameForInsert = cleanText(args.venue_name) ?? `Venue (${address.slice(0, 80)})`;
  const payload = {
    name: venueNameForInsert,
    address,
    city,
    state,
    zip: args.venue_zip,
    venue_url: args.venue_url,
  };

  const { data: upsertedRaw, error: upsertErr } = await supabaseAdmin
    .from("venues" as any)
    .upsert(payload, { onConflict: "name,address,city,state" })
    .select("id")
    .maybeSingle();
  if (upsertErr) throw upsertErr;
  const upserted = upsertedRaw as any;
  if (!upserted?.id) throw new Error("venue_upsert_failed");
  return { id: String(upserted.id) };
}

export async function POST(request: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const tournamentId = cleanText(body?.tournament_id);
  if (!tournamentId || !isUuid(tournamentId)) return NextResponse.json({ error: "invalid_tournament_id" }, { status: 400 });

  const candidate = (body?.candidate ?? {}) as Candidate;
  const venueAddress = cleanText(candidate.venue_address);
  const venueCity = cleanText(candidate.venue_city);
  const venueState = cleanText(candidate.venue_state)?.toUpperCase();
  const venueZip = cleanText(candidate.venue_zip);
  const venueName = cleanText(candidate.venue_name);
  const venueUrl = cleanText(candidate.venue_url);

  if (!venueAddress || !venueCity || !venueState) {
    return NextResponse.json({ error: "missing_venue_address_city_or_state" }, { status: 400 });
  }
  if (!looksLikeStreetAddress(venueAddress)) {
    return NextResponse.json({ error: "venue_address_not_street_like" }, { status: 400 });
  }
  const fullAddress = [venueAddress, venueCity, venueState, venueZip].filter(Boolean).join(", ");
  if (isBlockedOrganizerAddress(fullAddress)) {
    return NextResponse.json({ error: "blocked_organizer_address" }, { status: 400 });
  }

  // Ensure tournament exists (and ensure state/city are populated for fallback debugging).
  const { data: tRow, error: tErr } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!tRow) return NextResponse.json({ error: "tournament_not_found" }, { status: 404 });

  const venue = await getOrCreateVenueFromCandidate({
    venue_name: venueName,
    venue_address: venueAddress,
    venue_city: venueCity,
    venue_state: venueState,
    venue_zip: venueZip,
    venue_url: venueUrl,
  });

  const { error: linkErr } = await supabaseAdmin
    .from("tournament_venues" as any)
    .upsert({ tournament_id: tournamentId, venue_id: venue.id, is_inferred: false, is_primary: false }, { onConflict: "tournament_id,venue_id" });
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, tournament_id: tournamentId, venue_id: venue.id });
}

