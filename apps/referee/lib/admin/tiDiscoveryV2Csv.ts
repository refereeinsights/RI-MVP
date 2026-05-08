import {
  hostFromUrl,
  isHttpUrl,
  normalizeNameForDedupe,
  normalizeSport,
  normalizeStateUsps,
  todayUtcDateIso,
  tryNormalizeHttpUrl,
} from "@/lib/admin/tiDiscovery";
import type { TournamentRow } from "@/lib/types/tournament";

export type DiscoveryV2CsvRow = {
  tournament_name: string;
  sport: TournamentRow["sport"];
  city: string | null;
  state: string;
  start_date: string;
  end_date: string;
  official_website_url: string | null;
  source_url: string;
  host_org: string | null;
  tournament_director: string | null;
  tournament_director_email: string | null;
  referee_contact: string | null;
  referee_contact_email: string | null;
  // Optional: we can ingest/link venues by address-only.
  venue_name: string;
  venue_address: string | null;
  venue_city: string;
  venue_state: string;
  venue_zip: string | null;
  venue_url: string | null;
  venue_latitude: number | null;
  venue_longitude: number | null;
  confidence: string | null;
  notes: string | null;
};

export type DiscoveryV2ParseResult =
  | { ok: true; rows: DiscoveryV2CsvRow[]; warnings: string[]; detected: number }
  | { ok: false; error: string; detected: number };

export const DISCOVERY_V25_CANONICAL_HEADER = [
  "tournament_name",
  "sport",
  "city",
  "state",
  "start_date",
  "end_date",
  "official_website_url",
  "source_url",
  "host_org",
  "tournament_director",
  "tournament_director_email",
  "referee_contact",
  "referee_contact_email",
  "venue_name",
  "venue_address",
  "venue_city",
  "venue_state",
  "venue_zip",
  "venue_url",
  "venue_latitude",
  "venue_longitude",
  "confidence",
  "notes",
] as const;

const REQUIRED_HEADERS = [
  "tournament_name",
  "sport",
  "city",
  "state",
  "start_date",
  "end_date",
  "official_website_url",
  "source_url",
  "venue_address",
  "venue_city",
  "venue_state",
  "venue_zip",
] as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  const input = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      continue;
    }

    currentField += char;
  }

  if (currentField.length || currentRow.length) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((value) => value.trim().length > 0));
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function parseIsoDate(value: string) {
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) ? v : null;
}

const PLACEHOLDER_HOSTS = new Set(["localhost", "127.0.0.1", "example.com", "example.org", "example.net"]);

function isPlaceholderUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    return PLACEHOLDER_HOSTS.has(host);
  } catch {
    return true;
  }
}

function extractFirstHttpUrl(value: string) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  // Handles markdown links like: [label](https://example.com)
  const md = v.match(/\((https?:\/\/[^)\s]+)\)/i);
  if (md?.[1]) return md[1];
  // Handles bracketed lists or multiple URLs: take first http(s) token.
  const raw = v.match(/https?:\/\/[^\s,\]]+/i);
  return raw?.[0] ?? v;
}

const BAD_VENUE_TOKENS = [
  "tbd",
  "tba",
  "multiple locations",
  "multiple location",
  "various venues",
  "various locations",
  "surrounding area locations",
  "portland area gyms",
] as const;

function isBadVenueValue(value: string) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return true;
  const compact = v.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!compact) return true;
  return BAD_VENUE_TOKENS.some((token) => compact === token || compact.includes(token));
}

function isValidZip5(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  return /^\d{5}$/.test(v);
}

function looksLikeStreetAddress(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (v.length < 8) return false;
  // basic "street-ish" guardrail: require at least one digit (e.g., house number)
  return /\d/.test(v);
}

export function parseDiscoveryV2CsvChunk(params: { csvText: string; futureOnly?: boolean }): DiscoveryV2ParseResult {
  const text = String(params.csvText ?? "");
  const futureOnly = params.futureOnly !== false;
  const todayUtc = todayUtcDateIso();

  const table = parseCsv(text);
  if (!table.length) return { ok: false, error: "No CSV rows detected.", detected: 0 };

  const header = table[0].map(normalizeHeader);
  const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) {
    return { ok: false, error: `Missing required header(s): ${missing.join(", ")}`, detected: Math.max(0, table.length - 1) };
  }

  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const warnings: string[] = [];
  const rows: DiscoveryV2CsvRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < table.length; i += 1) {
    const line = i + 1;
    const row = table[i] ?? [];
    const pick = (key: string) => String(row[idx[key] as any] ?? "").trim();

    const tournamentName = pick("tournament_name");
    const sportRaw = pick("sport");
    const cityRaw = pick("city");
    const stateRaw = pick("state");
    const startRaw = pick("start_date");
    const endRaw = pick("end_date");
    const officialRaw = pick("official_website_url");
    const sourceRaw = pick("source_url");
    const hostOrgRaw = pick("host_org");
    const tournamentDirector = pick("tournament_director");
    const tournamentDirectorEmail = pick("tournament_director_email");
    const refereeContact = pick("referee_contact");
    const refereeContactEmail = pick("referee_contact_email");
    const venueNameRaw = pick("venue_name");
    const venueAddress = pick("venue_address");
    const venueCityRaw = pick("venue_city");
    const venueStateRaw = pick("venue_state");
    const venueZip = pick("venue_zip");
    const venueUrlRaw = pick("venue_url");
    const venueLatRaw = pick("venue_latitude");
    const venueLngRaw = pick("venue_longitude");
    const confidence = pick("confidence");
    const notes = pick("notes");

    if (!tournamentName) continue;
    const sport = normalizeSport(sportRaw) as TournamentRow["sport"] | null;
    const state = normalizeStateUsps(stateRaw);
    const startDate = parseIsoDate(startRaw);
    const endDate = parseIsoDate(endRaw);
    const sourceUrl = tryNormalizeHttpUrl(extractFirstHttpUrl(sourceRaw));
    if (!sport || !state || !startDate || !endDate || !sourceUrl || !isHttpUrl(sourceUrl) || isPlaceholderUrl(sourceUrl)) continue;
    if (startDate > endDate) continue;
    if (futureOnly && startDate < todayUtc) continue;

    // Venue requirement (v2.5 relaxed): venue_name is optional, but we REQUIRE address + city + state + zip.
    // Per user requirement: reject only this row when missing/bad venue.
    if (!looksLikeStreetAddress(venueAddress)) continue;
    // ZIP: allow blank (can be backfilled later), but reject non-blank invalid ZIPs.
    const venueZipTrimmed = String(venueZip ?? "").trim();
    if (venueZipTrimmed && !isValidZip5(venueZipTrimmed)) continue;
    const venueCity = String(venueCityRaw || "").trim();
    const venueState = normalizeStateUsps(venueStateRaw);
    if (!venueCity || !venueState) continue;
    const venueName = !venueNameRaw || isBadVenueValue(venueNameRaw) ? "" : venueNameRaw;

    const official = officialRaw ? tryNormalizeHttpUrl(extractFirstHttpUrl(officialRaw)) : null;
    if (official && (!isHttpUrl(official) || isPlaceholderUrl(official))) {
      warnings.push(`Row ${line}: official_website_url rejected (invalid/placeholder)`);
    }

    const normalizedName = normalizeNameForDedupe(tournamentName);
    const venueSigKey = venueName ? venueName.toLowerCase().trim() : String(venueAddress ?? "").toLowerCase().trim();
    const sig = `${normalizedName}|${state}|${startDate}|${venueSigKey}|${venueCity.toLowerCase().trim()}|${venueState}|${String(venueZip ?? "").trim()}`;
    if (seen.has(sig)) continue;
    seen.add(sig);

    rows.push({
      tournament_name: tournamentName,
      sport,
      city: cityRaw || null,
      state,
      start_date: startDate,
      end_date: endDate,
      official_website_url: official && isHttpUrl(official) && !isPlaceholderUrl(official) ? official : null,
      source_url: sourceUrl,
      host_org: hostOrgRaw || null,
      tournament_director: tournamentDirector || null,
      tournament_director_email: tournamentDirectorEmail || null,
      referee_contact: refereeContact || null,
      referee_contact_email: refereeContactEmail || null,
      venue_name: venueName,
      venue_address: venueAddress || null,
      venue_city: venueCity,
      venue_state: venueState,
      venue_zip: venueZipTrimmed || null,
      venue_url: venueUrlRaw ? tryNormalizeHttpUrl(extractFirstHttpUrl(venueUrlRaw)) : null,
      venue_latitude: Number.isFinite(Number(venueLatRaw)) && Number(venueLatRaw) !== 0 ? Number(venueLatRaw) : null,
      venue_longitude: Number.isFinite(Number(venueLngRaw)) && Number(venueLngRaw) !== 0 ? Number(venueLngRaw) : null,
      confidence: confidence || null,
      notes: notes || null,
    });
  }

  if (!rows.length) return { ok: false, error: "No valid rows found in CSV chunk.", detected: Math.max(0, table.length - 1) };
  return { ok: true, rows, warnings, detected: Math.max(0, table.length - 1) };
}

export function buildMasterCsv(rows: DiscoveryV2CsvRow[]) {
  const header = DISCOVERY_V25_CANONICAL_HEADER.join(",");
  const seen = new Set<string>();
  const out: string[] = [header];

  const esc = (value: string | null) => {
    const v = value ?? "";
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };

  for (const r of rows) {
    const venueSig =
      r.venue_name && r.venue_name.trim()
        ? r.venue_name.toLowerCase().trim()
        : String(r.venue_address ?? "").toLowerCase().trim();
    const sig = `${normalizeNameForDedupe(r.tournament_name)}|${r.state}|${r.start_date}|${venueSig}|${r.venue_city.toLowerCase().trim()}|${r.venue_state}|${String(r.venue_zip ?? "").trim()}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(
      [
        esc(r.tournament_name),
        esc(r.sport),
        esc(r.city),
        esc(r.state),
        esc(r.start_date),
        esc(r.end_date),
        esc(r.official_website_url),
        esc(r.source_url),
        esc(r.host_org),
        esc(r.tournament_director),
        esc(r.tournament_director_email),
        esc(r.referee_contact),
        esc(r.referee_contact_email),
        esc(r.venue_name),
        esc(r.venue_address),
        esc(r.venue_city),
        esc(r.venue_state),
        esc(r.venue_zip),
        esc(r.venue_url),
        r.venue_latitude != null ? String(r.venue_latitude) : "",
        r.venue_longitude != null ? String(r.venue_longitude) : "",
        esc(r.confidence),
        esc(r.notes),
      ].join(",")
    );
  }

  return { csv: out.join("\n"), rowCount: out.length - 1 };
}

export function toCandidateInsert(params: { batchId: string; discoverySearchId?: string | null; row: DiscoveryV2CsvRow }) {
  const { row } = params;
  return {
    discovery_search_id: params.discoverySearchId ?? null,
    discovery_batch_id: params.batchId,
    name: row.tournament_name,
    sport: row.sport,
    start_date: row.start_date,
    end_date: row.end_date,
    city: row.city ?? "Unknown",
    state: row.state,
    venue_raw: row.venue_name,
    organizer: row.host_org,
    official_website_url: row.official_website_url,
    source_url: row.source_url,
    raw_row_json: row,
    source_domain: hostFromUrl(row.source_url),
    normalized_name: normalizeNameForDedupe(row.tournament_name),
    confidence_label: row.official_website_url ? "high" : "medium",
  };
}
