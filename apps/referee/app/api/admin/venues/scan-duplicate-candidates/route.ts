import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildVenueAddressFingerprint,
  buildVenueNameCityStateFingerprint,
  normalizeIdentityUrlHost,
} from "@/lib/identity/fingerprints";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function ensureAdminRequest() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("user_id", data.user.id).maybeSingle();
  if (!profile || profile.role !== "admin") return null;
  return data.user;
}

type VenueRow = {
  id: string;
  name: string | null;
  address?: string | null;
  address1?: string | null;
  normalized_address?: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue_url?: string | null;
  venue_url_host?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address_fingerprint?: string | null;
  name_city_state_fingerprint?: string | null;
};

function pickStreetAddress(row: { address?: string | null; address1?: string | null }) {
  const address = String(row.address ?? "").trim();
  const address1 = String(row.address1 ?? "").trim();
  if (address) return address;
  return address1 || "";
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function canonicalPair(a: string, b: string) {
  return a < b ? { source: a, candidate: b } : { source: b, candidate: a };
}

function scoreForMatch(args: { exactAddress: boolean; exactNameCityState: boolean; sameHost: boolean }) {
  if (args.exactAddress && args.exactNameCityState) return 99;
  if (args.exactAddress) return args.sameHost ? 97 : 95;
  if (args.exactNameCityState) return args.sameHost ? 90 : 85;
  return args.sameHost ? 75 : 60;
}

export async function POST(request: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const limit = Math.max(1, Math.min(500, Number(payload?.limit ?? 120) || 120));
  const maxPerVenue = Math.max(1, Math.min(12, Number(payload?.max_per_venue ?? 6) || 6));
  const state = typeof payload?.state === "string" ? payload.state.trim().toUpperCase().slice(0, 2) : "";
  const sport = typeof payload?.sport === "string" ? payload.sport.trim().toLowerCase() : "";
  const runId = typeof payload?.run_id === "string" ? payload.run_id.trim() : "";

  if (runId && !isUuid(runId)) {
    return NextResponse.json({ error: "invalid_run_id" }, { status: 400 });
  }

  const keepBothPairs = new Set<string>();
  try {
    const overridesResp = await supabaseAdmin
      .from("venue_duplicate_overrides" as any)
      .select("venue_a_id,venue_b_id,status")
      .eq("status", "keep_both")
      .limit(50000);
    for (const row of (overridesResp.data ?? []) as any[]) {
      const a = String(row?.venue_a_id ?? "");
      const b = String(row?.venue_b_id ?? "");
      if (!a || !b) continue;
      keepBothPairs.add(pairKey(a, b));
    }
  } catch {
    // ignore
  }

  let venueRows: VenueRow[] = [];

  if (runId) {
    const { data, error } = await supabaseAdmin
      .from("venue_import_run_rows" as any)
      .select("matched_venue_id,action")
      .eq("run_id", runId)
      .not("matched_venue_id", "is", null)
      .limit(5000);

    if (error) return NextResponse.json({ error: error.message || "run_rows_lookup_failed" }, { status: 500 });

    const venueIds = Array.from(
      new Set(
        (data ?? [])
          .filter((r: any) => String(r?.action ?? "") === "inserted")
          .map((r: any) => String(r?.matched_venue_id ?? "").trim())
          .filter(Boolean)
      )
    ).slice(0, limit);

    if (venueIds.length === 0) {
      return NextResponse.json({ ok: true, scanned: 0, inserted: 0, skipped_overrides: 0, pairs_considered: 0 });
    }

    const venuesResp = await supabaseAdmin
      .from("venues" as any)
      .select(
        "id,name,address,address1,normalized_address,city,state,zip,venue_url,venue_url_host,latitude,longitude,address_fingerprint,name_city_state_fingerprint"
      )
      .in("id", venueIds)
      .limit(5000);

    if (venuesResp.error) return NextResponse.json({ error: venuesResp.error.message || "venues_lookup_failed" }, { status: 500 });
    venueRows = (venuesResp.data ?? []) as VenueRow[];
  } else {
    let query = supabaseAdmin
      .from("venues" as any)
      .select(
        "id,name,address,address1,normalized_address,city,state,zip,venue_url,venue_url_host,latitude,longitude,address_fingerprint,name_city_state_fingerprint"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (state) query = query.eq("state", state);
    if (sport) query = query.eq("sport", sport);
    const venuesResp = await query;
    if (venuesResp.error) return NextResponse.json({ error: venuesResp.error.message || "venues_lookup_failed" }, { status: 500 });
    venueRows = (venuesResp.data ?? []) as VenueRow[];
  }

  const now = new Date().toISOString();
  const createdBy = adminUser.id;
  const inserts: Array<Record<string, any>> = [];
  const seenPairs = new Set<string>();

  let skippedOverrides = 0;
  let pairsConsidered = 0;

  for (const venue of venueRows) {
    const venueId = String(venue?.id ?? "").trim();
    if (!venueId) continue;

    const addressFingerprint =
      (typeof venue.address_fingerprint === "string" && venue.address_fingerprint.trim()) ||
      buildVenueAddressFingerprint({
        address: venue.address ?? null,
        address1: venue.address1 ?? null,
        normalizedAddress: venue.normalized_address ?? null,
        city: venue.city ?? null,
        state: venue.state ?? null,
      });

    const nameCityStateFingerprint =
      (typeof venue.name_city_state_fingerprint === "string" && venue.name_city_state_fingerprint.trim()) ||
      buildVenueNameCityStateFingerprint({
        name: venue.name ?? null,
        city: venue.city ?? null,
        state: venue.state ?? null,
      });

    const venueHost = String(venue.venue_url_host ?? "").trim() || normalizeIdentityUrlHost(venue.venue_url);

    const candidateRows: VenueRow[] = [];
    try {
      if (addressFingerprint) {
        const resp = await supabaseAdmin
          .from("venues" as any)
          .select("id,name,address,address1,normalized_address,city,state,zip,venue_url,venue_url_host,address_fingerprint,name_city_state_fingerprint")
          .eq("address_fingerprint", addressFingerprint)
          .neq("id", venueId)
          .limit(60);
        if (!resp.error && Array.isArray(resp.data)) candidateRows.push(...((resp.data ?? []) as VenueRow[]));
      }
      if (nameCityStateFingerprint) {
        const resp = await supabaseAdmin
          .from("venues" as any)
          .select("id,name,address,address1,normalized_address,city,state,zip,venue_url,venue_url_host,address_fingerprint,name_city_state_fingerprint")
          .eq("name_city_state_fingerprint", nameCityStateFingerprint)
          .neq("id", venueId)
          .limit(60);
        if (!resp.error && Array.isArray(resp.data)) candidateRows.push(...((resp.data ?? []) as VenueRow[]));
      }
    } catch {
      // ignore schema mismatch; scan will simply do nothing for this venue.
    }

    const uniqueCandidates = new Map<string, VenueRow>();
    for (const row of candidateRows) {
      const id = String(row?.id ?? "").trim();
      if (!id || id === venueId) continue;
      uniqueCandidates.set(id, row);
    }

    const scored = Array.from(uniqueCandidates.values())
      .map((row) => {
        const rowId = String(row.id ?? "").trim();
        const exactAddress = Boolean(addressFingerprint && String(row.address_fingerprint ?? "").trim() === addressFingerprint);
        const exactNameCityState = Boolean(
          nameCityStateFingerprint && String(row.name_city_state_fingerprint ?? "").trim() === nameCityStateFingerprint
        );
        const rowHost = String(row.venue_url_host ?? "").trim() || normalizeIdentityUrlHost(row.venue_url);
        const sameHost = Boolean(venueHost && rowHost && venueHost === rowHost);
        const score = scoreForMatch({ exactAddress, exactNameCityState, sameHost });
        return { rowId, exactAddress, exactNameCityState, sameHost, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPerVenue);

    for (const item of scored) {
      pairsConsidered += 1;
      const { source, candidate } = canonicalPair(venueId, item.rowId);
      const key = pairKey(source, candidate);
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);

      if (keepBothPairs.has(key)) {
        skippedOverrides += 1;
        continue;
      }

      inserts.push({
        source_venue_id: source,
        candidate_venue_id: candidate,
        score: Math.round(Number(item.score ?? 0) || 0),
        status: "open",
        note: item.exactAddress
          ? "auto_scan:exact_address_fingerprint"
          : item.exactNameCityState
            ? "auto_scan:exact_name_city_state"
            : "auto_scan:heuristic",
        created_by: createdBy,
        first_seen_at: now,
        last_seen_at: now,
      });
    }
  }

  let inserted = 0;
  if (inserts.length > 0) {
    // Only insert new candidates. Do not mutate existing rows (avoid reopening ignored/resolved pairs).
    const resp = await supabaseAdmin
      .from("owls_eye_venue_duplicate_suspects" as any)
      .upsert(inserts, { onConflict: "source_venue_id,candidate_venue_id", ignoreDuplicates: true });

    if (resp.error) {
      return NextResponse.json(
        {
          error: resp.error.message || "suspects_insert_failed",
          details: resp.error,
          scanned: venueRows.length,
          pairs_considered: pairsConsidered,
          skipped_overrides: skippedOverrides,
        },
        { status: 500 }
      );
    }

    inserted = inserts.length;
  }

  return NextResponse.json({
    ok: true,
    scanned: venueRows.length,
    inserted,
    skipped_overrides: skippedOverrides,
    pairs_considered: pairsConsidered,
  });
}

