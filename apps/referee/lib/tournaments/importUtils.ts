import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

import type {
  TournamentRow,
  TournamentSource,
  TournamentStatus,
  TournamentSubmissionType,
} from "@/lib/types/tournament";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";
import { TOURNAMENT_SPORTS } from "@/lib/tournaments/sports";

export type CsvRow = Record<string, string>;

export type ParsedCsv = {
  headers: string[];
  rows: CsvRow[];
};

export const ALLOWED_SPORTS = new Set<string>(TOURNAMENT_SPORTS as unknown as string[]);

const OTHER_SPORT_KEYWORDS = [
  "volleyball",
  "lacrosse",
  "softball",
  "baseball",
  "wrestling",
  "swim",
  "swimming",
  "tennis",
  "golf",
  "track",
  "cross country",
  "rugby",
  "pickleball",
  "dance",
  "rowing",
  "crew",
  "cheer",
  "cricket",
  "field hockey",
  "martial arts",
  "karate",
  "taekwondo",
  "hockey",
];

export function inferSportFromCsvRow(
  row: CsvRow,
  opts?: { fallbackSport?: string | null }
): string | null {
  const normalizeSport = (value: unknown) => String(value ?? "").trim().toLowerCase();
  const pick = (keys: string[]) => {
    for (const key of keys) {
      const v = normalizeSport((row as any)[key]);
      if (v) return v;
    }
    return "";
  };

  const explicit = pick(["sport", "tournament_sport"]);
  if (explicit) return explicit;

  const fallback = normalizeSport(opts?.fallbackSport ?? "");
  if (fallback && fallback !== "other") return fallback;

  const name = String((row as any).name ?? (row as any).tournament_name ?? "").toLowerCase();
  const urlRaw = String(
    (row as any).source_url ??
      (row as any).official_website_url ??
      (row as any).tournament_url ??
      (row as any).url ??
      ""
  ).trim();

  const inferFromText = (text: string) => {
    const t = text.toLowerCase();
    if (!t) return null;
    if (/\bfutsal\b/.test(t)) return "futsal";
    if (/\bsoccer\b/.test(t)) return "soccer";
    if (/\bvolleyball\b/.test(t) || /\bvball\b/.test(t)) return "volleyball";
    if (/\blacrosse\b/.test(t)) return "lacrosse";
    if (/\bwrestling\b/.test(t)) return "wrestling";
    if (/\bfield hockey\b/.test(t) || /\bhockey\b/.test(t)) return "hockey";
    if (/\bfootball\b/.test(t)) return "football";
    if (/\bsoftball\b/.test(t) || /\bfastpitch\b/.test(t)) return "softball";
    if (/\bbaseball\b/.test(t)) return "baseball";
    if (/\bbasketball\b/.test(t) || /\bhoop\b/.test(t)) return "basketball";
    return null;
  };

  const fromName = inferFromText(name);
  if (fromName) return fromName;

  if (urlRaw) {
    try {
      const url = new URL(urlRaw);
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();
      const full = `${host}${path}${url.search.toLowerCase()}`;

      // Domain-based hints.
      if (host.includes("perfectgame.")) return "baseball";
      if (host.includes("gotsoccer") || host.includes("gotsport")) return "soccer";
      if (host.includes("usclubsoccer")) return "soccer";
      if (host.includes("ayso")) return "soccer";
      if (host.includes("exposureevents") && host.includes("basketball")) return "basketball";

      // Path-based hints.
      if (full.includes("/baseball")) return "baseball";
      if (full.includes("/fastpitch") || full.includes("/softball")) return "softball";
      if (full.includes("/soccer")) return "soccer";
      if (full.includes("/futsal")) return "futsal";
      if (full.includes("/volleyball")) return "volleyball";
      if (full.includes("/lacrosse")) return "lacrosse";
      if (full.includes("/wrestling")) return "wrestling";
      if (full.includes("/hockey")) return "hockey";
      if (full.includes("/football")) return "football";
      if (full.includes("/basketball")) return "basketball";
    } catch {
      // ignore invalid URLs
    }
  }

  return fallback || null;
}

export function parseCsv(text: string): ParsedCsv {
  const parseInternal = (input: string): ParsedCsv => {
    const headers: string[] = [];
    const rows: CsvRow[] = [];
    const currentField: string[] = [];
    const currentRow: string[] = [];
    let insideQuotes = false;

    const looksLikeAddress = (value: string) => {
      const v = String(value || "").trim();
      if (!v) return false;
      if (!/\d/.test(v)) return false;
      if (/\b\d{5}(-\d{4})?\b/.test(v)) return true;
      if (/\b[A-Z]{2}\b/.test(v)) return true;
      return v.length >= 12;
    };

    const repairFieldCount = (fields: string[]) => {
      if (!headers.length) return fields;

      // Common export bug: header has N columns, rows have N+1 (usually an extra empty column).
      // Prefer to keep venue name + address when the overflow looks like an address.
      if (fields.length === headers.length + 1) {
        const venueNameIdx = headers.indexOf("venue_name");
        const venueAddressIdx = headers.indexOf("venue_address");
        if (venueNameIdx !== -1 && venueAddressIdx !== -1) {
          const maybeVenueName = String(fields[venueAddressIdx] ?? "").trim();
          const overflow = String(fields[headers.length] ?? "").trim();
          if (!String(fields[venueNameIdx] ?? "").trim() && maybeVenueName && overflow && looksLikeAddress(overflow)) {
            const repaired = fields.slice(0, headers.length);
            repaired[venueNameIdx] = fields[venueAddressIdx] ?? "";
            repaired[venueAddressIdx] = fields[headers.length] ?? "";
            return repaired;
          }
        }
      }

      // Fallback: if the row has more columns than the header, merge overflow into the last column.
      if (fields.length > headers.length && headers.length > 0) {
        const repaired = fields.slice(0, headers.length);
        const overflow = fields.slice(headers.length).filter((v) => String(v || "").trim());
        if (overflow.length) {
          repaired[headers.length - 1] = [repaired[headers.length - 1], ...overflow]
            .filter((v) => String(v || "").trim())
            .join(", ");
        }
        return repaired;
      }

      return fields;
    };

    const pushField = () => {
      currentRow.push(currentField.join(""));
      currentField.length = 0;
    };

    const pushRow = () => {
      if (!currentRow.length) return;
      if (!headers.length) {
        headers.push(...currentRow);
      } else {
        const repairedRow = repairFieldCount(currentRow);
        const row: CsvRow = {};
        headers.forEach((header, index) => {
          row[header] = repairedRow[index] ?? "";
        });
        rows.push(row);
      }
      currentRow.length = 0;
    };

    const chars = input.split("");
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const nextChar = chars[i + 1];
      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentField.push('"');
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
        continue;
      }
      if (char === "," && !insideQuotes) {
        pushField();
        continue;
      }
      if ((char === "\n" || char === "\r") && !insideQuotes) {
        pushField();
        pushRow();
        if (char === "\r" && nextChar === "\n") {
          i++;
        }
        continue;
      }
      currentField.push(char);
    }

    if (currentField.length || currentRow.length) {
      pushField();
      pushRow();
    }

    return { headers, rows };
  };

  const parsed = parseInternal(text);

  // Common bad export: each CSV line is wrapped in quotes, making the whole line a single cell.
  // Example header: `"tournament_name,tournament_url,...,notes"`
  // Repair by stripping outer quotes per line and un-escaping doubled quotes.
  if (parsed.headers.length === 1 && parsed.headers[0]?.includes(",") && parsed.rows.length > 0) {
    const repaired = text
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return trimmed.slice(1, -1).replace(/""/g, '"');
        }
        return line;
      })
      .join("\n");
    return parseInternal(repaired);
  }

  return parsed;
}

function normalize(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function isTbdToken(value: string) {
  const v = normalize(value).toLowerCase();
  if (!v) return false;
  const compact = v.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!compact) return false;
  if (compact === "tbd" || compact === "tba") return true;
  if (compact === "to be determined" || compact === "to be announced") return true;
  // Common variants we see in uploads.
  if (compact === "tbd tba" || compact === "tbd tba venues" || compact === "tbd venues") return true;
  if (compact === "tbd - tba" || compact === "tba - tbd") return true;
  return false;
}

function cleanMaybeVenueOrAddress(value: string | null | undefined): string | null {
  const raw = normalize(value);
  if (!raw) return null;
  const lower = raw.toLowerCase();
  // Common organizer HQ address that is frequently misclassified as a venue/address.
  // Example: "1529 Third St. S., Jacksonville Beach, FL 32250"
  if (lower.includes("1529") && (lower.includes(" third st") || lower.includes(" 3rd st")) && lower.includes("jacksonville") && lower.includes("beach")) {
    return null;
  }
  // If the whole value is TBD/TBA-ish, treat it as missing.
  if (isTbdToken(raw)) return null;
  // If it starts with TBD/TBA, strip the prefix and keep whatever is after (if anything).
  if (/^(tbd|tba)\b/.test(lower)) {
    const rest = raw.replace(/^(tbd|tba)\b[\s:–—-]*/i, "").trim();
    if (!rest || isTbdToken(rest)) return null;
    return rest;
  }

  // If it looks like a semicolon-separated list, drop TBD entries but keep real venues.
  const parts = raw
    .split(";")
    .map((p) => normalize(p))
    .filter(Boolean)
    .filter((p) => !isTbdToken(p));
  if (parts.length === 0) return null;
  return parts.join("; ");
}

function referencesOtherSports(text: string) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return OTHER_SPORT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function makeUniqueSlug(base: string, seen: Set<string>) {
  let candidate = base;
  let counter = 2;
  while (seen.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}`;
    counter++;
  }
  return candidate;
}

export function cleanCsvRows(rows: CsvRow[]) {
  const kept: CsvRow[] = [];
  const dropped: { row: CsvRow; reason: string }[] = [];
  const seenSlugs = new Set<string>();

  const pick = (row: CsvRow, keys: string[]) => {
    for (const key of keys) {
      const val = row[key];
      const normalized = normalize(val);
      if (normalized) return normalized;
    }
    return "";
  };

  for (const row of rows) {
    const name = pick(row, ["name", "tournament_name", "tournament"]);
    if (!name) {
      dropped.push({ row, reason: "missing name" });
      continue;
    }
    if (name.length > 180) {
      dropped.push({ row, reason: "name too long" });
      continue;
    }

    const sportRaw = pick(row, ["sport", "tournament_sport"]).toLowerCase();
    if (!sportRaw) {
      dropped.push({ row, reason: "missing sport" });
      continue;
    }
    if (!ALLOWED_SPORTS.has(sportRaw)) {
      dropped.push({ row, reason: `unsupported sport "${row.sport ?? ""}"` });
      continue;
    }

    const state = pick(row, ["state", "tournament_state", "venue_state"]).toUpperCase();
    const city = pick(row, ["city", "tournament_city", "venue_city"]);
    if (!state && !city) {
      dropped.push({ row, reason: "missing city/state" });
      continue;
    }

    const zip = pick(row, ["zip", "tournament_zip", "venue_zip"]);
    const sourceUrl = pick(row, ["source_url", "official_website_url", "tournament_url", "url", "website"]);
    if (!sourceUrl) {
      dropped.push({ row, reason: "missing source URL" });
      continue;
    }

    const summary = pick(row, ["summary", "notes"]);
    const combined = `${name} ${summary}`.toLowerCase();
    if (sportRaw === "soccer" || sportRaw === "futsal") {
      if (referencesOtherSports(combined)) {
        dropped.push({ row, reason: "references other sport" });
        continue;
      }
    }

    const baseSlug = pick(row, ["slug", "tournament_slug"]) || generateSlug(name, city || null, state || null);
    const uniqueSlug = makeUniqueSlug(baseSlug, seenSlugs);
    const slugKey = uniqueSlug.toLowerCase();
    seenSlugs.add(slugKey);

    const venue = pick(row, ["venue", "venue_name"]);
    const address = pick(row, ["address", "venue_address", "venue_address_text", "address_with_zip"]);

    kept.push({
      ...row,
      name,
      slug: uniqueSlug,
      sport: sportRaw,
      state,
      city,
      zip,
      summary,
      venue,
      address,
      source_url: sourceUrl,
    });
  }

  return { kept, dropped };
}

export function csvRowsToTournamentRows(
  rows: CsvRow[],
  opts: { status: TournamentStatus; source: TournamentSource; subType?: TournamentSubmissionType }
): TournamentRow[] {
  const records: TournamentRow[] = [];
  for (const row of rows) {
    const sport = row.sport as TournamentRow["sport"];
    if (!ALLOWED_SPORTS.has(sport)) continue;

    let sourceDomain = "";
    try {
      sourceDomain = new URL(row.source_url).hostname;
    } catch {
      continue;
    }

    const cashFlag = (row.ref_cash_tournament ?? row.cash ?? "").toLowerCase();
    const venue = cleanMaybeVenueOrAddress(row.venue ?? (row as any).venue_name);
    const address = cleanMaybeVenueOrAddress(row.address ?? (row as any).venue_address ?? (row as any).venue_address_text);
    const association = normalize(
      row.tournament_association ??
        (row as any).organization ??
        (row as any).organizer ??
        (row as any).association
    ) || null;
    const record: TournamentRow = {
      name: row.name,
      slug: row.slug,
      sport,
      level: normalize(row.level) || null,
      sub_type: opts.subType ?? "internet",
      ref_cash_tournament: cashFlag === "true" || cashFlag === "1" || cashFlag === "yes",
      state: row.state || null,
      city: row.city || null,
      tournament_association: association,
      venue,
      address,
      zip: normalize(row.zip) || null,
      start_date: normalize(row.start_date) || null,
      end_date: normalize(row.end_date) || null,
      summary: row.summary || null,
      status: opts.status,
      source: opts.source,
      source_event_id: row.slug,
      source_url: row.source_url,
      source_domain: sourceDomain,
      raw: row,
    };
    records.push(record);
  }
  return records;
}

export function extractHtmlFromMhtml(content: string) {
  const lower = content.toLowerCase();
  const htmlIndex = lower.indexOf("<html");
  if (htmlIndex === -1) return content;
  return content.slice(htmlIndex);
}

export function extractUSClubTournamentsFromHtml(
  html: string,
  opts: {
    sport: TournamentRow["sport"];
    level?: string | null;
    status: TournamentStatus;
    source?: TournamentSource;
    subType?: TournamentSubmissionType;
  }
): TournamentRow[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const records: TournamentRow[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    let absolute: string;
    try {
      absolute = new URL(href, "https://usclubsoccer.org/").toString();
    } catch {
      return;
    }
    if (absolute.endsWith("/list-of-sanctioned-tournaments/")) return;
    if (seen.has(absolute)) return;
    seen.add(absolute);

    const title = normalize($(element).text()) || "US Club Soccer Tournament";
    const summary = normalize($(element).closest("article,div").text());
    const { city, state } = extractCityState(summary);
    const slug = generateSlug(title, city, state);

    let sourceDomain = "";
    try {
      sourceDomain = new URL(absolute).hostname;
    } catch {
      sourceDomain = "usclubsoccer.org";
    }

    records.push({
      name: title,
      slug,
      sport: opts.sport,
      sub_type: opts.subType ?? "internet",
      ref_cash_tournament: false,
      level: opts.level ?? null,
      state,
      city,
      venue: null,
      address: null,
      start_date: null,
      end_date: null,
      summary: summary || null,
      status: opts.status,
      source: opts.source ?? "us_club_soccer",
      source_event_id: slug,
      source_url: absolute,
      source_domain: sourceDomain,
      raw: summary,
    });
  });

  return records;
}

function extractCityState(text: string) {
  const match = text.match(/([A-Za-z\s]+),\s*([A-Z]{2})/);
  if (match) {
    return { city: match[1].trim(), state: match[2].trim() };
  }
  return { city: null, state: null };
}

export function generateSlug(name: string, city: string | null, state: string | null) {
  const parts = [name];
  if (city) parts.push(city);
  if (state) parts.push(state);
  return parts
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function supabaseAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase env vars");
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * For multi-venue CSVs where multiple rows share the same tournament (same name + start_date)
 * but carry different venue city/state, normalise all rows to the most common city and state
 * within the group and regenerate their slugs so they deduplicate as one tournament.
 */
function rationalizeCityState(records: TournamentRow[]): TournamentRow[] {
  const groups = new Map<string, TournamentRow[]>();
  for (const r of records) {
    const key = `${(r.name || "").toLowerCase().trim()}|${r.start_date || ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  return records.map((r) => {
    const key = `${(r.name || "").toLowerCase().trim()}|${r.start_date || ""}`;
    const group = groups.get(key)!;
    if (group.length === 1) return r;

    const cityCount = new Map<string, number>();
    const stateCount = new Map<string, number>();
    for (const row of group) {
      if (row.city) cityCount.set(row.city, (cityCount.get(row.city) || 0) + 1);
      if (row.state) stateCount.set(row.state, (stateCount.get(row.state) || 0) + 1);
    }
    const bestCity = [...cityCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? r.city ?? null;
    const bestState = [...stateCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? r.state ?? null;

    if (bestCity === r.city && bestState === r.state) return r;
    return { ...r, city: bestCity, state: bestState, slug: generateSlug(r.name, bestCity, bestState) };
  });
}

function triKey(record: TournamentRow) {
  const name = (record.name || "").toLowerCase().trim();
  const city = (record.city || "").toLowerCase().trim();
  const state = (record.state || "").toLowerCase().trim();
  const start = record.start_date || "";
  return `${name}|${city}|${state}|${start}`;
}

type VenueCandidate = {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport: string | null;
};

function normalizeVenueField(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function normalizeStateCode(value: unknown): string | null {
  const v = normalizeVenueField(value);
  return v ? v.toUpperCase() : null;
}

function venueKey(v: VenueCandidate) {
  const name = (v.name ?? "").trim().toLowerCase();
  const address = (v.address ?? "").trim().toLowerCase();
  const city = (v.city ?? "").trim().toLowerCase();
  const state = (v.state ?? "").trim().toLowerCase();
  const zip = (v.zip ?? "").trim();
  return `${name}|${address}|${city}|${state}|${zip}`;
}

function extractVenueCandidate(record: TournamentRow): VenueCandidate | null {
  const raw = (record.raw ?? null) as Record<string, unknown> | null;

  const name =
    normalizeVenueField(raw?.venue ?? raw?.venue_name ?? raw?.venueName) ??
    normalizeVenueField(record.venue);
  const address =
    normalizeVenueField(
      raw?.address ??
        raw?.venue_address ??
        raw?.venue_address_text ??
        raw?.address_with_zip ??
        raw?.venueAddress ??
        raw?.venueAddressText
    ) ?? normalizeVenueField(record.address);

  const city =
    normalizeVenueField(raw?.venue_city ?? raw?.venueCity) ??
    normalizeVenueField(raw?.city ?? raw?.tournament_city) ??
    normalizeVenueField(record.city);
  const state =
    normalizeStateCode(raw?.venue_state ?? raw?.venueState) ??
    normalizeStateCode(raw?.state ?? raw?.tournament_state) ??
    normalizeStateCode(record.state);
  const zip =
    normalizeVenueField(raw?.venue_zip ?? raw?.venueZip) ??
    normalizeVenueField(raw?.zip ?? raw?.tournament_zip) ??
    normalizeVenueField(record.zip);

  const hasVenueInfo = Boolean(name || address);
  const hasLocation = Boolean(city || state);
  if (!hasVenueInfo || !hasLocation) return null;

  return {
    name,
    address,
    city,
    state,
    zip,
    sport: normalizeVenueField(record.sport),
  };
}

async function upsertVenueAndLinkTournament(params: {
  supabase: ReturnType<typeof supabaseAdmin>;
  tournamentId: string;
  venue: VenueCandidate;
  setPrimary: boolean;
}): Promise<{ attempted: boolean; linked: boolean; error?: string }> {
  const { supabase, tournamentId, venue, setPrimary } = params;

  try {
    const applyNullableFilter = (query: any, field: string, value: string | null) => {
      if (value === null) return query.is(field, null);
      return query.eq(field, value);
    };

    const existingVenueQuery = supabase.from("venues").select("id").limit(1);
    const existingVenueRes = await applyNullableFilter(
      applyNullableFilter(
        applyNullableFilter(
          applyNullableFilter(existingVenueQuery as any, "name", venue.name),
          "address",
          venue.address
        ),
        "city",
        venue.city
      ),
      "state",
      venue.state
    ).maybeSingle();

    if (existingVenueRes.error) {
      return { attempted: true, linked: false, error: existingVenueRes.error.message || "failed_lookup_venue" };
    }

    let venueId = (existingVenueRes.data as any)?.id as string | undefined;
    if (!venueId) {
      const insertPayload: Record<string, unknown> = {
        name: venue.name,
        address: venue.address,
        city: venue.city,
        state: venue.state,
        zip: venue.zip,
        sport: venue.sport,
      };
      const insertRes = await (supabase.from("venues") as any).insert(insertPayload).select("id").single();
      if (insertRes.error) {
        if ((insertRes.error as any).code === "23505") {
          const retryRes = await applyNullableFilter(
            applyNullableFilter(
              applyNullableFilter(
                applyNullableFilter((supabase.from("venues") as any).select("id").limit(1), "name", venue.name),
                "address",
                venue.address
              ),
              "city",
              venue.city
            ),
            "state",
            venue.state
          ).maybeSingle();
          venueId = (retryRes.data as any)?.id as string | undefined;
          if (!venueId) {
            return { attempted: true, linked: false, error: retryRes.error?.message || "failed_create_venue" };
          }
        } else {
          return { attempted: true, linked: false, error: insertRes.error.message || "failed_create_venue" };
        }
      } else {
        venueId = (insertRes.data as any)?.id as string | undefined;
      }
    }

    if (!venueId) return { attempted: true, linked: false, error: "missing_venue_id" };

    const linkRes = await (supabase.from("tournament_venues") as any).upsert(
      { tournament_id: tournamentId, venue_id: venueId, is_inferred: false },
      { onConflict: "tournament_id,venue_id" }
    );
    if (linkRes.error && (linkRes.error as any).code !== "23505") {
      return { attempted: true, linked: false, error: linkRes.error.message || "failed_link_venue" };
    }

    if (setPrimary) {
      const primaryRes = await (supabase.from("tournament_venues") as any)
        .update({ is_primary: true })
        .eq("tournament_id", tournamentId)
        .eq("venue_id", venueId);
      if (primaryRes.error) {
        return { attempted: true, linked: true, error: primaryRes.error.message || "failed_set_primary" };
      }
    }

    return { attempted: true, linked: true };
  } catch (error) {
    return { attempted: true, linked: false, error: error instanceof Error ? error.message : "failed_link_venue" };
  }
}

export async function importTournamentRecords(records: TournamentRow[]) {
  records = rationalizeCityState(records);
  let success = 0;
  const failures: { record: TournamentRow; error: string }[] = [];
  const tournamentIds: string[] = [];
  let venue_links_attempted = 0;
  let venue_links_created = 0;
  let venue_link_errors = 0;

  const supabase = supabaseAdmin();

  const groups = new Map<
    string,
    {
      base: TournamentRow;
      rows: TournamentRow[];
    }
  >();

  const mergeTournamentFields = (base: TournamentRow, next: TournamentRow): TournamentRow => {
    const pick = <T>(a: T | null | undefined, b: T | null | undefined) => (a ?? b ?? null);
    return {
      ...base,
      // Keep base slug stable for dedupe; only fill missing tournament fields.
      level: pick(base.level ?? null, next.level ?? null),
      tournament_association: pick(base.tournament_association ?? null, next.tournament_association ?? null),
      venue: pick(base.venue ?? null, next.venue ?? null),
      address: pick(base.address ?? null, next.address ?? null),
      zip: pick(base.zip ?? null, next.zip ?? null),
      end_date: pick(base.end_date ?? null, next.end_date ?? null),
      summary: pick(base.summary ?? null, next.summary ?? null),
      source_url: pick(base.source_url ?? null, next.source_url ?? null) as any,
      raw: base.raw ?? next.raw,
    };
  };

  for (const record of records) {
    const key = triKey(record);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { base: record, rows: [record] });
      continue;
    }
    group.base = mergeTournamentFields(group.base, record);
    group.rows.push(record);
    groups.set(key, group);
  }

  for (const { base, rows } of groups.values()) {
    const record = base;

    if (record.name && record.start_date) {
      const { data: existing, error: dupErr } = await supabase
        .from("tournaments")
        .select("id")
        .eq("status", "pending")
        .eq("name", record.name)
        .eq("city", record.city ?? null)
        .eq("state", record.state ?? null)
        .eq("start_date", record.start_date)
        .limit(1)
        .maybeSingle();
      if (dupErr) {
        failures.push({ record, error: dupErr.message });
        continue;
      }
      if (existing) {
        failures.push({
          record,
          error: "Skipped: pending tournament with same name/city/state/start_date exists",
        });
        continue;
      }
    }

    try {
      const id = await upsertTournamentFromSource(record);
      if (id) tournamentIds.push(id);
      success++;

      if (id) {
        const candidates = rows
          .map(extractVenueCandidate)
          .filter(Boolean) as VenueCandidate[];
        const unique = new Map<string, VenueCandidate>();
        for (const v of candidates) {
          unique.set(venueKey(v), v);
        }
        const venues = Array.from(unique.values());

        if (venues.length) {
          const { data: existingPrimaries } = await (supabase.from("tournament_venues") as any)
            .select("venue_id")
            .eq("tournament_id", id)
            .eq("is_primary", true)
            .limit(1);
          let hasPrimary = Boolean((existingPrimaries ?? []).length);

          for (let idx = 0; idx < venues.length; idx += 1) {
            const venue = venues[idx];
            venue_links_attempted += 1;
            const setPrimary = !hasPrimary && idx === 0;
            const res = await upsertVenueAndLinkTournament({ supabase, tournamentId: id, venue, setPrimary });
            if (!res.linked) {
              venue_link_errors += 1;
              continue;
            }
            venue_links_created += 1;
            if (setPrimary) hasPrimary = true;
          }
        }
      }
    } catch (error) {
      failures.push({ record, error: (error as Error).message });
    }
  }

  return { success, failures, tournamentIds, venue_links_attempted, venue_links_created, venue_link_errors };
}

// Extract events from JSON-LD scripts (schema.org Event)
export function extractEventsFromJsonLd(
  html: string,
  opts: { sport: TournamentRow["sport"]; status: TournamentStatus; source: TournamentSource; fallbackUrl?: string | null }
): TournamentRow[] {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');
  const events: TournamentRow[] = [];

  scripts.each((_, el) => {
    const text = $(el).contents().text();
    if (!text) return;
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    const maybeArray = Array.isArray(data) ? data : [data];
    for (const item of maybeArray) {
      if (!item) continue;
      if (item["@type"] !== "Event") continue;
      const name = (item.name || "").trim();
      if (!name) continue;
      const start = item.startDate ? String(item.startDate).slice(0, 10) : null;
      const loc = item.location || {};
      const addressText =
        (loc.address && typeof loc.address === "string" ? loc.address : loc.address?.streetAddress || "") || "";
      let city: string | null = null;
      let state: string | null = null;
      const addrMatch = addressText.match(/([A-Za-z .'-]+),\s*([A-Z]{2})\b/);
      if (addrMatch) {
        city = addrMatch[1].trim();
        state = addrMatch[2].trim();
      }
      const slug = generateSlug(name, city, state);
      const url = (item.url as string) || opts.fallbackUrl || "";
      let sourceDomain = "";
      try {
        if (url) sourceDomain = new URL(url).hostname;
      } catch {
        sourceDomain = "";
      }

      events.push({
        name,
        slug,
        sport: opts.sport,
        level: loc.name ?? null,
        sub_type: "admin",
        ref_cash_tournament: false,
        state: state ?? null,
        city: city ?? null,
        venue: loc.name ?? null,
        address: addressText || null,
        start_date: start,
        end_date: start,
        summary: item.description ?? null,
        status: opts.status,
        source: opts.source,
        source_event_id: url || slug,
        source_url: url || opts.fallbackUrl || "",
        source_domain: sourceDomain,
        raw: item,
      });
    }
  });

  return events;
}

function parseDateRange(text: string): { start: string | null; end: string | null } {
  const rangeRegex = /([A-Za-z]+)\s+(\d{1,2})(?:[-–](\d{1,2}))?,\s*(\d{4})/;
  const singleRegex = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/;
  const months = [
    "january","february","march","april","may","june","july","august","september","october","november","december"
  ];
  const toIso = (m: string, d: string, y: string) => {
    const idx = months.indexOf(m.toLowerCase());
    if (idx === -1) return null;
    const mm = String(idx + 1).padStart(2, "0");
    const dd = String(Number(d)).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  };
  const rangeMatch = text.match(rangeRegex);
  if (rangeMatch) {
    const [, m, d1, d2, y] = rangeMatch;
    const start = toIso(m, d1, y);
    const end = d2 ? toIso(m, d2, y) : start;
    return { start: start ?? null, end: end ?? start ?? null };
  }
  const singleMatch = text.match(singleRegex);
  if (singleMatch) {
    const [, m, d, y] = singleMatch;
    const iso = toIso(m, d, y);
    return { start: iso, end: iso };
  }
  return { start: null, end: null };
}

// Domain-specific extractor for grassroots365.com calendar tables.
export function extractGrassrootsCalendar(
  html: string,
  opts: { sport: TournamentRow["sport"]; status: TournamentStatus; source: TournamentSource; fallbackUrl?: string | null }
): TournamentRow[] {
  const $ = cheerio.load(html);
  const rows: TournamentRow[] = [];

  // 1) Try to parse the embedded console.log JSON that contains all events by month.
  const consoleMatch = html.match(/console\.log\((\{[\s\S]*?\})\);/);
  if (consoleMatch) {
    try {
      const data = JSON.parse(consoleMatch[1]);
      for (const monthKey of Object.keys(data)) {
        const events = Array.isArray(data[monthKey]) ? data[monthKey] : [];
        for (const ev of events) {
          const datesStr = typeof ev.dates === "string" ? ev.dates : "";
          const dateParts = datesStr.split("|").map((d: string) => d.trim()).filter(Boolean);
          const firstDate = dateParts[0] || "";
          const lastDate = dateParts[dateParts.length - 1] || firstDate;
          const startParsed = parseDateRange(firstDate);
          const endParsed = parseDateRange(lastDate);
          const locText = (ev.locations as string | undefined) || "";
          let city: string | null = null;
          let state: string | null = null;
          const cityStateMatch = locText.match(/\(([A-Za-z .'-]+),\s*([A-Z]{2})\)/);
          if (cityStateMatch) {
            city = cityStateMatch[1].trim();
            state = cityStateMatch[2].trim();
          }
          const name: string = ev.name || ev.short_name || "Unnamed event";
          const slug = generateSlug(name, city, state);
          const url = (ev.link as string | undefined) || opts.fallbackUrl || "";
          let sourceDomain = "";
          try {
            if (url) sourceDomain = new URL(url).hostname;
          } catch {
            sourceDomain = "";
          }
          rows.push({
            name,
            slug,
            sport: opts.sport,
            level: null,
            sub_type: "admin",
            ref_cash_tournament: false,
            state: state ?? "NA",
            city: city ?? "Unknown",
            venue: locText ? locText.replace(/\s*\([^)]+\)\s*$/, "").trim() || locText : null,
            address: locText || null,
            start_date: startParsed.start,
            end_date: endParsed.end ?? startParsed.start,
            summary: ev.description ?? datesStr,
            status: opts.status,
            source: opts.source,
            source_event_id: ev.id ? String(ev.id) : `${slug}-${startParsed.start ?? datesStr}`,
            source_url: url,
            source_domain: sourceDomain,
            raw: ev,
          });
        }
      }
    } catch (err) {
      // ignore JSON parse errors; fall back to table parsing
    }
  }

  // 2) Parse visible tables as fallback.
  const tables = $(".calendarMonthContainer table");
  tables.each((_, table) => {
    $(table)
      .find("tr")
      .each((idx, tr) => {
        if (idx === 0) return; // skip header
        const cells = $(tr).find("td");
        if (cells.length < 3) return;
        const dateText = $(cells[0]).text().replace(/\s+/g, " ").trim();
        const name = $(cells[1]).text().replace(/\s+/g, " ").trim();
        const locText = $(cells[2]).text().replace(/\s+/g, " ").trim();
        if (!name) return;
        const { start, end } = parseDateRange(dateText);
        let city: string | null = null;
        let state: string | null = null;
        const cityStateMatch = locText.match(/\(([A-Za-z .'-]+),\s*([A-Z]{2})\)/);
        if (cityStateMatch) {
          city = cityStateMatch[1].trim();
          state = cityStateMatch[2].trim();
        }
        const venue = locText.replace(/\s*\([^)]+\)\s*$/, "").trim() || locText;
        const slug = generateSlug(name, city, state);
        const url = opts.fallbackUrl || "";
        let sourceDomain = "";
        try {
          if (url) sourceDomain = new URL(url).hostname;
        } catch {
          sourceDomain = "";
        }

        rows.push({
          name,
          slug,
          sport: opts.sport,
          level: null,
          sub_type: "admin",
          ref_cash_tournament: false,
          state: state ?? "NA",
          city: city ?? "Unknown",
          venue: venue || null,
          address: locText || null,
          start_date: start,
          end_date: end ?? start,
          summary: dateText,
          status: opts.status,
          source: opts.source,
          source_event_id: `${slug}-${start ?? dateText}`,
          source_url: url,
          source_domain: sourceDomain,
          raw: { date: dateText, venue: locText },
        });
      });
  });
  return rows;
}
