import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeIdentityStreet, normalizeIdentityText } from "@/lib/identity/fingerprints";

type CsvRow = {
  tournament_uuid: string;
  tournament_name?: string;
  organizer_kind?: string;
  organizer_value?: string;
  venue_id?: string;
  venue_name: string;
  venue_address?: string;
  venue_address_text?: string;
  venue_city?: string;
  venue_state?: string;
  venue_zip?: string;
  confidence?: string;
  notes?: string;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  address1: string | null;
  normalized_address?: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport?: string | null;
};

type ResultRow = {
  tournament_uuid: string;
  venue_name: string;
  venue_id?: string | null;
  action: "linked_existing_venue" | "created_venue" | "already_linked" | "skipped" | "error";
  message?: string | null;
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

function normalizeName(value: string | null | undefined) {
  return normalizeIdentityText(value).toLowerCase();
}

function normalizeCity(value: string | null | undefined) {
  return normalizeIdentityText(value).toLowerCase();
}

function normalizeState(value: string | null | undefined) {
  const raw = normalizeIdentityText(value).toUpperCase();
  if (!raw) return "";
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return raw.slice(0, 2);
}

function normalizeAddress(value: string | null | undefined) {
  return normalizeIdentityStreet(value).toLowerCase();
}

function parseAddressBlob(rawAddress: string) {
  const raw = rawAddress
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*(usa|united states)\.?$/i, "")
    .trim();
  if (!raw) return null;

  // "street, city, ST, zip" or "street, city, ST zip"
  const commaPattern = /^(.*?),\s*([^,]+),\s*([A-Za-z]{2}|[A-Za-z .]+)\s*,?\s*(\d{5}(?:-\d{4})?)$/;
  const commaMatch = raw.match(commaPattern);
  if (commaMatch) {
    const street = commaMatch[1]?.trim() ?? "";
    const city = commaMatch[2]?.trim() ?? "";
    const state = commaMatch[3]?.trim() ?? "";
    const zip = (commaMatch[4] ?? "").trim();
    if (street && city && state && zip) return { street, city, state, zip };
  }

  return null;
}

function venueCandidateAddress(v: VenueRow) {
  return v.address1 || v.address || v.normalized_address || null;
}

function pickExistingVenue(params: { row: CsvRow; candidates: VenueRow[] }) {
  const targetName = normalizeName(params.row.venue_name);
  const targetCity = normalizeCity(params.row.venue_city);
  const targetState = normalizeState(params.row.venue_state);
  const targetAddr = normalizeAddress(params.row.venue_address);

  const scored = params.candidates
    .filter((v) => normalizeState(v.state) === targetState && normalizeCity(v.city) === targetCity)
    .map((v) => {
      const name = normalizeName(v.name);
      const addr = normalizeAddress(venueCandidateAddress(v));
      const score =
        (name === targetName ? 10 : 0) +
        (targetAddr && addr && addr === targetAddr ? 100 : 0) +
        (!targetAddr && addr ? 1 : 0);
      return { v, name, addr, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.v ?? null;
  if (!best) return null;

  // Require name match unless the address is an exact match.
  const bestName = normalizeName(best.name);
  const bestAddr = normalizeAddress(venueCandidateAddress(best));
  if (bestName !== targetName && !(targetAddr && bestAddr && targetAddr === bestAddr)) return null;
  return best;
}

export async function POST(request: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const dryRun = payload?.dryRun !== false;
  const rowsRaw = Array.isArray(payload?.rows) ? (payload.rows as CsvRow[]) : [];
  const rowsInFile = rowsRaw.length;

  const MAX_ROWS = 2000;
  if (rowsRaw.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (${rowsRaw.length}). Max is ${MAX_ROWS}.` }, { status: 400 });
  }

  const rows: CsvRow[] = rowsRaw
    .map((r) => ({
      tournament_uuid: String((r as any)?.tournament_uuid ?? (r as any)?.tournament_id ?? "").trim(),
      tournament_name: typeof r?.tournament_name === "string" ? r.tournament_name.trim() : undefined,
      organizer_kind: typeof (r as any)?.organizer_kind === "string" ? String((r as any).organizer_kind).trim() : undefined,
      organizer_value:
        typeof (r as any)?.organizer_value === "string" ? String((r as any).organizer_value).trim() : undefined,
      venue_id: typeof (r as any)?.venue_id === "string" ? String((r as any).venue_id).trim() : undefined,
      venue_name: String(r?.venue_name ?? "").trim(),
      venue_address:
        typeof r?.venue_address === "string"
          ? r.venue_address.trim()
          : typeof (r as any)?.venue_address_text === "string"
            ? String((r as any).venue_address_text).trim()
            : undefined,
      venue_address_text: typeof (r as any)?.venue_address_text === "string" ? String((r as any).venue_address_text).trim() : undefined,
      venue_city: typeof r?.venue_city === "string" ? r.venue_city.trim() : undefined,
      venue_state: typeof r?.venue_state === "string" ? r.venue_state.trim() : undefined,
      venue_zip: typeof r?.venue_zip === "string" ? r.venue_zip.trim() : undefined,
      confidence: typeof r?.confidence === "string" ? r.confidence.trim() : undefined,
      notes: typeof r?.notes === "string" ? r.notes.trim() : undefined,
    }))
    .filter((r) => r.tournament_uuid && r.venue_name);

  const uniqueTournamentIds = Array.from(new Set(rows.map((r) => r.tournament_uuid)));
  const { data: tournamentsData, error: tournamentsError } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,sport")
    .in("id", uniqueTournamentIds)
    .limit(2000);

  if (tournamentsError) {
    console.error("[venue-enrichment-csv] tournaments fetch failed", tournamentsError);
    return NextResponse.json({ error: "tournaments_fetch_failed" }, { status: 500 });
  }

  const tournamentById = new Map<string, { id: string; sport: string | null }>();
  for (const row of (tournamentsData ?? []) as Array<{ id: string; sport?: string | null }>) {
    if (!row?.id) continue;
    tournamentById.set(String(row.id), { id: String(row.id), sport: (row as any)?.sport ?? null });
  }

  const linkRowsTournamentIds = Array.from(new Set(rows.map((r) => r.tournament_uuid).filter((id) => tournamentById.has(id))));
  const { data: linkRows, error: linkError } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select("tournament_id,venue_id")
    .in("tournament_id", linkRowsTournamentIds)
    .limit(20000);

  if (linkError) {
    console.error("[venue-enrichment-csv] tournament_venues fetch failed", linkError);
    return NextResponse.json({ error: "tournament_venues_fetch_failed" }, { status: 500 });
  }

  const existingLinks = new Set<string>();
  for (const row of (linkRows ?? []) as Array<{ tournament_id: string | null; venue_id: string | null }>) {
    if (!row?.tournament_id || !row?.venue_id) continue;
    existingLinks.add(`${row.tournament_id}|${row.venue_id}`);
  }

  const cityKeys = Array.from(
    new Set(
      rows
        .map((r) => `${normalizeState(r.venue_state)}|${normalizeCity(r.venue_city)}`)
        .filter((k) => !k.startsWith("|") && !k.endsWith("|"))
    )
  );

  const venuesByCityKey = new Map<string, VenueRow[]>();
  for (const key of cityKeys) {
    const [state, city] = key.split("|");
    const resp = await supabaseAdmin
      .from("venues" as any)
      .select("id,name,address,address1,normalized_address,city,state,zip,sport")
      .eq("state", state)
      .ilike("city", city)
      .limit(2000);
    if (resp.error) {
      console.error("[venue-enrichment-csv] venues fetch failed", { key, error: resp.error });
      return NextResponse.json({ error: "venues_fetch_failed" }, { status: 500 });
    }
    venuesByCityKey.set(key, (resp.data ?? []) as VenueRow[]);
  }

  const venueInfoByNormalizedKey = new Map<string, { id: string; created: boolean }>();
  const nowIso = new Date().toISOString();

  let venuesCreated = 0;
  let venuesMatched = 0;
  let linksCreated = 0;
  let linksAlreadyPresent = 0;
  let skipped = 0;
  let errors = 0;

  const resultRows: ResultRow[] = [];

  for (const row of rows) {
    const tournamentId = row.tournament_uuid;
    if (!tournamentById.has(tournamentId)) {
      skipped += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        action: "skipped",
        message: "tournament_not_found",
      });
      continue;
    }

    // If the CSV already includes a venue_id, we can link directly (no matching required).
    const explicitVenueId = String(row.venue_id ?? "").trim();
    if (explicitVenueId) {
      if (dryRun) {
        linksCreated += 1;
        resultRows.push({
          tournament_uuid: tournamentId,
          venue_name: row.venue_name,
          venue_id: explicitVenueId,
          action: "linked_existing_venue",
          message: "would_link_by_venue_id",
        });
        continue;
      }

      const { data: venueExists, error: venueExistsErr } = await supabaseAdmin
        .from("venues" as any)
        .select("id")
        .eq("id", explicitVenueId)
        .maybeSingle();
      const venueExistsId = (venueExists as any)?.id ? String((venueExists as any).id) : null;
      if (venueExistsErr || !venueExistsId) {
        errors += 1;
        resultRows.push({
          tournament_uuid: tournamentId,
          venue_name: row.venue_name,
          venue_id: explicitVenueId,
          action: "error",
          message: "venue_id_not_found",
        });
        continue;
      }

      const linkKey = `${tournamentId}|${explicitVenueId}`;
      if (existingLinks.has(linkKey)) {
        linksAlreadyPresent += 1;
        resultRows.push({
          tournament_uuid: tournamentId,
          venue_name: row.venue_name,
          venue_id: explicitVenueId,
          action: "already_linked",
          message: "already_linked_by_venue_id",
        });
        continue;
      }

      const upsertResp = await supabaseAdmin
        .from("tournament_venues" as any)
        .upsert({ tournament_id: tournamentId, venue_id: explicitVenueId }, { onConflict: "tournament_id,venue_id" });
      if (upsertResp.error) {
        console.error("[venue-enrichment-csv] link upsert failed", upsertResp.error);
        errors += 1;
        resultRows.push({
          tournament_uuid: tournamentId,
          venue_name: row.venue_name,
          venue_id: explicitVenueId,
          action: "error",
          message: "link_upsert_failed",
        });
        continue;
      }

      existingLinks.add(linkKey);
      linksCreated += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        venue_id: explicitVenueId,
        action: "linked_existing_venue",
        message: "linked_by_venue_id",
      });
      continue;
    }

    // For address-text-only CSVs (like organizer candidates export), try to parse city/state/zip out of venue_address.
    let venueCity = row.venue_city;
    let venueState = row.venue_state;
    let venueZip = row.venue_zip;
    let venueAddress = row.venue_address;
    if ((!venueCity || !venueState) && venueAddress) {
      const parsed = parseAddressBlob(venueAddress);
      if (parsed) {
        venueAddress = parsed.street;
        venueCity = parsed.city;
        venueState = parsed.state;
        venueZip = parsed.zip;
      }
    }

    const state = normalizeState(venueState);
    const city = normalizeCity(venueCity);
    if (!state || !city) {
      skipped += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        action: "skipped",
        message: "missing_city_or_state",
      });
      continue;
    }

    const venueKey = [
      normalizeName(row.venue_name),
      normalizeAddress(venueAddress),
      city,
      state,
    ].join("|");

    const cachedVenue = venueInfoByNormalizedKey.get(venueKey) ?? null;
    let venueId = cachedVenue?.id ?? null;
    let createdThisRow = cachedVenue?.created ?? false;
    let matchedThisRow = cachedVenue ? !cachedVenue.created : false;

    if (!venueId) {
      const candidates = venuesByCityKey.get(`${state}|${city}`) ?? [];
      const existing = pickExistingVenue({
        row: {
          ...row,
          venue_address: venueAddress,
          venue_city: venueCity,
          venue_state: venueState,
          venue_zip: venueZip,
        },
        candidates,
      });
      if (existing?.id) {
        venueId = existing.id;
        venuesMatched += 1;
        matchedThisRow = true;
        createdThisRow = false;
      } else if (!dryRun) {
        const tournament = tournamentById.get(tournamentId)!;
        const insertPayload: any = {
          name: row.venue_name,
          address: venueAddress ?? null,
          address1: venueAddress ?? null,
          city: venueCity ?? null,
          state: state || null,
          zip: venueZip ?? null,
          sport: tournament.sport ?? null,
          updated_at: nowIso,
        };

        const insertResp = await supabaseAdmin.from("venues" as any).insert(insertPayload).select("id").single();
        if (insertResp.error) {
          // If we hit a uniqueness conflict, retry matching from the DB.
          if ((insertResp.error as any)?.code === "23505") {
            const retryResp = await supabaseAdmin
              .from("venues" as any)
              .select("id,name,address,address1,normalized_address,city,state,zip,sport")
              .eq("state", state)
              .ilike("city", venueCity ?? city)
              .limit(2000);
            if (retryResp.error) {
              errors += 1;
              resultRows.push({
                tournament_uuid: tournamentId,
                venue_name: row.venue_name,
                action: "error",
                message: "venue_insert_conflict_and_retry_failed",
              });
              continue;
            }
            const retryExisting = pickExistingVenue({
              row: {
                ...row,
                venue_address: venueAddress,
                venue_city: venueCity,
                venue_state: venueState,
                venue_zip: venueZip,
              },
              candidates: (retryResp.data ?? []) as VenueRow[],
            });
            if (!retryExisting?.id) {
              errors += 1;
              resultRows.push({
                tournament_uuid: tournamentId,
                venue_name: row.venue_name,
                action: "error",
                message: "venue_insert_conflict_but_no_match_found",
              });
              continue;
            }
            venueId = retryExisting.id;
            venuesMatched += 1;
            matchedThisRow = true;
          } else {
            console.error("[venue-enrichment-csv] venue insert failed", insertResp.error);
            errors += 1;
            resultRows.push({
              tournament_uuid: tournamentId,
              venue_name: row.venue_name,
              action: "error",
              message: "venue_insert_failed",
            });
            continue;
          }
        } else {
          venueId = (insertResp.data as any)?.id ?? null;
          if (!venueId) {
            errors += 1;
            resultRows.push({
              tournament_uuid: tournamentId,
              venue_name: row.venue_name,
              action: "error",
              message: "venue_insert_missing_id",
            });
            continue;
          }
          venuesCreated += 1;
          createdThisRow = true;
          matchedThisRow = false;
        }
      }

      if (venueId) {
        venueInfoByNormalizedKey.set(venueKey, { id: venueId, created: createdThisRow ? true : false });
      }
    }

    if (!venueId) {
      if (dryRun) {
        venuesCreated += 1;
        resultRows.push({
          tournament_uuid: tournamentId,
          venue_name: row.venue_name,
          action: "created_venue",
          venue_id: null,
          message: "would_create_and_link",
        });
        continue;
      }
      errors += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        action: "error",
        message: "venue_unresolved",
      });
      continue;
    }

    const linkKey = `${tournamentId}|${venueId}`;
    if (existingLinks.has(linkKey)) {
      linksAlreadyPresent += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        venue_id: venueId,
        action: "already_linked",
      });
      continue;
    }

    if (dryRun) {
      linksCreated += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        venue_id: venueId,
        action: matchedThisRow ? "linked_existing_venue" : "created_venue",
        message: "would_link",
      });
      continue;
    }

    const upsertResp = await supabaseAdmin
      .from("tournament_venues" as any)
      .upsert({ tournament_id: tournamentId, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
    if (upsertResp.error) {
      console.error("[venue-enrichment-csv] link upsert failed", upsertResp.error);
      errors += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        venue_id: venueId,
        action: "error",
        message: "link_upsert_failed",
      });
      continue;
    }

    existingLinks.add(linkKey);
    linksCreated += 1;
    resultRows.push({
      tournament_uuid: tournamentId,
      venue_name: row.venue_name,
      venue_id: venueId,
      action: createdThisRow ? "created_venue" : "linked_existing_venue",
    });
  }

  const rowsProcessed = resultRows.length;

  return NextResponse.json({
    tool: "venue_enrichment_csv_ingest",
    dryRun,
    rows_in_file: rowsInFile,
    rows_processed: rowsProcessed,
    venues_created: venuesCreated,
    venues_matched: venuesMatched,
    links_created: linksCreated,
    links_already_present: linksAlreadyPresent,
    skipped,
    errors,
    rows: resultRows.slice(0, 250),
  });
}
