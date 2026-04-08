/**
 * NSA (National Softball Association) softball tournament sweeper.
 *
 * API base: https://nationalsoftballassociation.com/api/v1/
 *
 * Flow:
 *  1. GET /Event/display/weekend  → array of upcoming FP events
 *  2. For each event: GET /EP/info-v2.0/desktop/{key} → dates + facilities[]
 *  3. facilities[] contains { name, address, location ("City, ST"), zip }
 *  4. Upsert tournament via upsertTournamentFromSource (venue=first facility name)
 *  5. For each unique facility: find-or-create venue row, then upsert tournament_venues link
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";
import { queueEnrichmentJobs } from "@/server/enrichment/pipeline";
import type { TournamentRow, TournamentStatus } from "@/lib/types/tournament";

const NSA_API = "https://nationalsoftballassociation.com/api/v1";
const NSA_DOMAIN = "nationalsoftballassociation.com";
const FETCH_TIMEOUT_MS = 12_000;

// ─── types ───────────────────────────────────────────────────────────────────

type NsaEventListItem = {
  _key: string;
  name: string;
  location: string; // "Arnold, MO"
  dates: string; // "Apr 10 - 12, 2026"
  starts: string; // ISO
  entryFee: string | null;
  director: string | null;
  competitionClassesList: Array<{ name: string }> | null;
  sport: string;
  season: string;
};

type NsaFacilityRaw = {
  _key?: string;
  name: string;
  abr?: string;
  address: string;
  location?: string; // "City, ST"
  zip?: string;
};

type NsaEventDetail = {
  eventInfo?: {
    starts?: string;
    ends?: string;
  } | null;
  facilities?: NsaFacilityRaw[] | null;
};

type NsaFacility = {
  name: string;
  abr?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

export type NsaSweepResult = {
  imported_ids: string[];
  counts: {
    found: number;
    imported: number;
    venues_created: number;
    venue_links: number;
  };
  sample: Array<{
    name: string;
    state: string | null;
    city: string | null;
    date: string | null;
    url: string;
    venues: string[];
  }>;
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function clean(v: string | null | undefined): string | null {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length ? s : null;
}

function normalize(v: string | null | undefined) {
  return String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseLocation(location: string | null): { city: string | null; state: string | null } {
  if (!location) return { city: null, state: null };
  const m = location.replace(/\s+/g, " ").trim().match(/^(.+?),\s*([A-Z]{2})$/i);
  if (!m) return { city: clean(location), state: null };
  return { city: clean(m[1]), state: m[2].toUpperCase() };
}

/** Convert raw facility objects from info-v2.0 response into NsaFacility. */
function facilitiesFromDetail(raw: NsaFacilityRaw[]): NsaFacility[] {
  const seen = new Set<string>();
  const out: NsaFacility[] = [];
  for (const f of raw) {
    const name = clean(f.name);
    const address = clean(f.address);
    const loc = parseLocation(clean(f.location) ?? null);
    if (!name || !address || !loc.city || !loc.state) continue;
    const key = [normalize(name), normalize(address), normalize(loc.city), normalize(loc.state)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, address, city: loc.city, state: loc.state, zip: clean(f.zip) ?? "" });
  }
  return out;
}

async function apiFetch<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${NSA_API}/${path}`, {
      headers: {
        "User-Agent": "RI-NSA-Sweep/1.0",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── venue find-or-create ─────────────────────────────────────────────────────

async function findOrCreateVenue(f: NsaFacility): Promise<{ id: string; created: boolean }> {
  // 1. Try name + city + state
  const { data: byName } = await supabaseAdmin
    .from("venues" as any)
    .select("id")
    .ilike("name", f.name)
    .ilike("city", f.city)
    .eq("state", f.state.toUpperCase())
    .limit(1)
    .maybeSingle();
  if (byName) return { id: (byName as any).id, created: false };

  // 2. Try address + city + state
  const { data: byAddr } = await supabaseAdmin
    .from("venues" as any)
    .select("id")
    .ilike("address", `%${f.address}%`)
    .ilike("city", f.city)
    .eq("state", f.state.toUpperCase())
    .limit(1)
    .maybeSingle();
  if (byAddr) return { id: (byAddr as any).id, created: false };

  // 3. Create new
  const { data: inserted, error } = await supabaseAdmin
    .from("venues" as any)
    .insert({
      name: clean(f.name) ?? f.name,
      address: clean(f.address),
      address1: clean(f.address),
      city: clean(f.city),
      state: f.state.toUpperCase(),
      zip: clean(f.zip) ?? null,
      sport: "softball",
    })
    .select("id")
    .single();

  if (error) {
    // Race condition — try lookup again
    if ((error as any).code === "23505") {
      const { data: retry } = await supabaseAdmin
        .from("venues" as any)
        .select("id")
        .ilike("name", f.name)
        .ilike("city", f.city)
        .eq("state", f.state.toUpperCase())
        .limit(1)
        .maybeSingle();
      if (retry) return { id: (retry as any).id, created: false };
    }
    throw error;
  }

  return { id: (inserted as any).id, created: true };
}

async function linkVenues(tournamentId: string, facilities: NsaFacility[]): Promise<{ created: number; links: number }> {
  let venuesCreated = 0;
  let links = 0;

  for (let i = 0; i < facilities.length; i++) {
    const f = facilities[i];
    const { id: venueId, created } = await findOrCreateVenue(f);
    if (created) venuesCreated++;

    await supabaseAdmin
      .from("tournament_venues" as any)
      .upsert(
        {
          tournament_id: tournamentId,
          venue_id: venueId,
          is_primary: i === 0,
          is_inferred: false,
        },
        { onConflict: "tournament_id,venue_id" }
      );
    links++;
  }

  return { created: venuesCreated, links };
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

export function isNsaSoftballEventsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname.replace(/^www\./, "") === NSA_DOMAIN &&
      /^\/pages\/events\/?$/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

// ─── main sweep ──────────────────────────────────────────────────────────────

export async function sweepNsaSoftballTournaments(params: {
  status: TournamentStatus;
  writeDb?: boolean;
  limit?: number;
}): Promise<NsaSweepResult> {
  const { status, writeDb = true, limit = 500 } = params;

  // 1. Fetch event listing
  const events = await apiFetch<NsaEventListItem[]>("Event/display/weekend");
  if (!Array.isArray(events) || !events.length) {
    return { imported_ids: [], counts: { found: 0, imported: 0, venues_created: 0, venue_links: 0 }, sample: [] };
  }

  const target = events.filter((e) => e.sport === "FP").slice(0, limit);

  const importedSet = new Set<string>();
  const sample: NsaSweepResult["sample"] = [];
  let totalVenuesCreated = 0;
  let totalVenueLinks = 0;

  for (const event of target) {
    const loc = parseLocation(event.location);
    const eventUrl = `https://${NSA_DOMAIN}/pages/event/${event._key}`;

    // 2. Fetch detail for accurate dates + facility list
    const detail = await apiFetch<NsaEventDetail>(`EP/info-v2.0/desktop/${event._key}`);
    const startDate = clean(detail?.eventInfo?.starts?.slice(0, 10)) ??
      clean(event.starts?.slice(0, 10)) ?? null;
    const endDate = clean(detail?.eventInfo?.ends?.slice(0, 10)) ?? startDate;

    // 3. Extract facilities from detail response (facilities[] array in info-v2.0)
    const facilities = facilitiesFromDetail(detail?.facilities ?? []);

    // Build level string from competition classes
    const classes = (event.competitionClassesList ?? [])
      .map((c) => clean(c.name))
      .filter(Boolean)
      .join(", ");

    const summaryParts = [event.dates, classes, event.entryFee, event.director ? `Dir: ${event.director}` : null].filter(Boolean);

    const row: TournamentRow = {
      name: event.name,
      slug: buildTournamentSlug({
        name: event.name,
        city: loc.city ?? undefined,
        state: loc.state ?? undefined,
      }),
      sport: "softball",
      tournament_association: "National Softball Association",
      level: classes || null,
      sub_type: "admin",
      ref_cash_tournament: false,
      state: loc.state ?? "NA",
      city: loc.city ?? "Unknown",
      venue: facilities[0]?.name ?? null,
      address: facilities[0]?.address ?? null,
      zip: facilities[0]?.zip ?? null,
      start_date: startDate,
      end_date: endDate,
      summary: summaryParts.length ? summaryParts.join(" | ") : null,
      status,
      source: "external_crawl",
      source_event_id: event._key,
      source_url: eventUrl,
      source_domain: NSA_DOMAIN,
      raw: {
        nsa_key: event._key,
        location: event.location,
        dates: event.dates,
        entry_fee: event.entryFee,
        director: event.director,
        classes: event.competitionClassesList,
        facilities: facilities.map((f) => ({ name: f.name, address: f.address, city: f.city, state: f.state, zip: f.zip })),
      },
    };

    if (sample.length < 8) {
      sample.push({
        name: event.name,
        state: loc.state,
        city: loc.city,
        date: startDate,
        url: eventUrl,
        venues: facilities.map((f) => `${f.name} — ${f.city}, ${f.state}`),
      });
    }

    if (!writeDb) continue;

    const tournamentId = await upsertTournamentFromSource(row);
    importedSet.add(tournamentId);

    if (facilities.length) {
      const { created, links } = await linkVenues(tournamentId, facilities);
      totalVenuesCreated += created;
      totalVenueLinks += links;
    }
  }

  const imported_ids = Array.from(importedSet);
  if (writeDb && imported_ids.length) {
    await queueEnrichmentJobs(imported_ids);
  }

  return {
    imported_ids,
    counts: {
      found: target.length,
      imported: imported_ids.length,
      venues_created: totalVenuesCreated,
      venue_links: totalVenueLinks,
    },
    sample,
  };
}
