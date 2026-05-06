import { buildTournamentSlug } from "./slug";
import { importTournamentRecords } from "./importUtils";
import { TournamentRow, TournamentSource, TournamentStatus } from "../types/tournament";

export type CsvIngestDefaults = {
  defaultSource?: TournamentSource;
  defaultSport: TournamentRow["sport"];
  defaultStatus: TournamentStatus;
};

export type CsvIngestWarning = {
  line: number;
  message: string;
};

export type CsvIngestFailure = {
  line: number;
  error: string;
};

export type CsvIngestSuccess = {
  line: number;
  tournament: TournamentRow;
  warnings: string[];
};

export type CsvIngestResult = {
  ok: boolean;
  dryRun: boolean;
  parsed: number;
  valid: number;
  invalid: number;
  warnings: CsvIngestWarning[];
  failures: CsvIngestFailure[];
  successes?: CsvIngestSuccess[];
  upserted?: number;
};

type CsvRecord = {
  line: number;
  data: Record<string, string>;
};

type NormalizeResult =
  | { ok: true; value: TournamentRow; warnings: string[]; line: number }
  | { ok: false; error: string; line: number };

const KNOWN_SOURCES: TournamentSource[] = [
  "us_club_soccer",
  "cal_south",
  "gotsoccer",
  "soccerwire",
  "public_submission",
  "external_crawl",
];

const KNOWN_STATUSES: TournamentStatus[] = ["draft", "published", "stale", "archived"];

const KNOWN_SPORTS: TournamentRow["sport"][] = [
  "soccer",
  "futsal",
  "basketball",
  "baseball",
  "softball",
  "lacrosse",
  "volleyball",
  "football",
  "wrestling",
  "hockey",
  "other",
];

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function isValidSource(value: string): value is TournamentSource {
  return KNOWN_SOURCES.includes(value as TournamentSource);
}

function isValidStatus(value: string): value is TournamentStatus {
  return KNOWN_STATUSES.includes(value as TournamentStatus);
}

function isValidSport(value: string): value is TournamentRow["sport"] {
  return KNOWN_SPORTS.includes(value as TournamentRow["sport"]);
}

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
      if (char === "\r" && next === "\n") {
        i += 1;
      }
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

function rowsToRecords(rows: string[][]): CsvRecord[] {
  if (!rows.length) return [];

  const header = rows[0].map(normalizeHeader);
  const records: CsvRecord[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || !row.some((value) => value && value.trim().length > 0)) continue;

    const data: Record<string, string> = {};
    header.forEach((key, idx) => {
      data[key] = row[idx]?.trim() ?? "";
    });

    records.push({ line: i + 1, data });
  }

  return records;
}

function pick(data: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (data[key]) return data[key];
  }
  return undefined;
}

function normalizeDate(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseDateRange(value?: string): { start: string | null; end: string | null } {
  if (!value) return { start: null, end: null };
  let text = value.trim();
  if (!text) return { start: null, end: null };

  text = text
    .replace(/^"+|"+$/g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1")
    .replace(/,\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  const monthOnly = text.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s*,?\s*(20\d{2})?$/i
  );
  if (monthOnly) {
    const monthName = monthOnly[1].toLowerCase();
    const year = monthOnly[2] ? Number(monthOnly[2]) : 2026;
    const monthNum = MONTHS[monthName];
    if (!monthNum || !year) return { start: null, end: null };
    const start = new Date(Date.UTC(year, monthNum - 1, 1)).toISOString().slice(0, 10);
    const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
    const end = new Date(Date.UTC(year, monthNum - 1, lastDay)).toISOString().slice(0, 10);
    return { start, end };
  }

  const re =
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s*[-–—]\s*(\d{1,2}))?(?:,?\s*(20\d{2}))?/i;
  const match = text.match(re);
  if (!match) return { start: null, end: null };

  const monthName = match[1].toLowerCase();
  const startDay = Number(match[2]);
  const endDay = match[3] ? Number(match[3]) : startDay;
  const yearFromText = match[4] ? Number(match[4]) : null;
  const fallbackYearMatch = text.match(/(20\d{2})/);
  const fallbackYear = fallbackYearMatch ? Number(fallbackYearMatch[1]) : null;
  const year = yearFromText ?? fallbackYear ?? 2026;

  const monthNum = MONTHS[monthName];
  if (!monthNum || !startDay || !year) return { start: null, end: null };

  const toIso = (day: number) => {
    const d = new Date(Date.UTC(year, monthNum - 1, day));
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  };

  const start = toIso(startDay);
  const end = toIso(endDay);
  return { start, end };
}

function normalizeBoolean(value?: string): boolean | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return ["1", "true", "yes", "cash"].includes(trimmed);
}

function getDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeTournamentRow(record: CsvRecord, defaults: CsvIngestDefaults): NormalizeResult {
  const { data, line } = record;

  const name = pick(data, "name", "tournament_name");
  if (!name) {
    return { ok: false, error: `Row ${line}: missing "name" column`, line };
  }

  const state = pick(data, "state")?.toUpperCase();
  if (!state) {
    return { ok: false, error: `Row ${line}: missing "state" column`, line };
  }

  const sourceUrl = pick(
    data,
    "source_url",
    "url",
    "link",
    "tournament_url",
    "website",
    "registration_url",
    "website_registration_url"
  );
  if (!sourceUrl) {
    return { ok: false, error: `Row ${line}: missing "source_url" column`, line };
  }

  const sourceRaw = pick(data, "source");
  const normalizedSource = sourceRaw?.toLowerCase();
  const source =
    (normalizedSource && isValidSource(normalizedSource) ? normalizedSource : undefined) ??
    defaults.defaultSource;
  if (!source) {
    return {
      ok: false,
      error: `Row ${line}: missing "source" column and no default source provided`,
      line,
    };
  }

  const sportRaw = pick(data, "sport");
  const normalizedSport = sportRaw?.toLowerCase();
  const sport =
    (normalizedSport && isValidSport(normalizedSport)
      ? (normalizedSport as TournamentRow["sport"])
      : undefined) ?? defaults.defaultSport;

  const city = pick(data, "city", "location_city");
  let startDate = normalizeDate(pick(data, "start_date", "start"));
  let endDate = normalizeDate(pick(data, "end_date", "end"));

  if (!startDate) {
    const dateRange = parseDateRange(pick(data, "dates", "date"));
    startDate = dateRange.start;
    endDate = endDate ?? dateRange.end;
  }

  const statusRaw = pick(data, "status");
  const normalizedStatus = statusRaw?.toLowerCase();
  const status =
    (normalizedStatus && isValidStatus(normalizedStatus) ? normalizedStatus : undefined) ??
    defaults.defaultStatus;

  const level = pick(data, "level") || null;
  const venue = pick(data, "venue", "venue_name") || null;
  const address = pick(data, "address", "venue_address") || null;
  const summary = pick(data, "summary", "notes", "notes_summary") || null;
  const cashTournament = normalizeBoolean(pick(data, "ref_cash_tournament", "cash")) ?? false;

  const confidenceRaw = pick(data, "confidence");
  let confidence: number | undefined;
  const warnings: string[] = [];

  if (confidenceRaw) {
    const parsed = Number(confidenceRaw);
    if (Number.isFinite(parsed)) {
      confidence = parsed;
    } else {
      warnings.push(`Row ${line}: invalid confidence "${confidenceRaw}" (ignored)`);
    }
  }

  if (!startDate) {
    warnings.push(`Row ${line}: missing start_date`);
  }

  const slug = buildTournamentSlug({
    name,
    city: city ?? null,
    state,
  });

  let sourceEventId = pick(data, "source_event_id", "event_id", "external_id", "stable_source_event_id");
  if (!sourceEventId) {
    sourceEventId = slug;
    warnings.push(`Row ${line}: missing source_event_id (fallback to slug)`);
  }

  const sourceDomain = pick(data, "source_domain") || getDomain(sourceUrl) || "unknown";

  const tournament: TournamentRow = {
    name,
    slug,
    sport,
    level,
    sub_type: "internet",
    ref_cash_tournament: cashTournament,
    state,
    city: city ?? null,
    venue,
    address,
    start_date: startDate ?? null,
    end_date: endDate ?? startDate ?? null,
    summary,
    status,
    confidence,
    source,
    source_event_id: sourceEventId,
    source_url: sourceUrl,
    source_domain: sourceDomain,
    raw: data,
  };

  return { ok: true, value: tournament, warnings, line };
}

export function parseTournamentCsvText(csvText: string, defaults: CsvIngestDefaults): CsvIngestResult {
  const table = parseCsv(csvText);
  const records = rowsToRecords(table);

  if (!records.length) {
    return {
      ok: false,
      dryRun: true,
      parsed: 0,
      valid: 0,
      invalid: 0,
      warnings: [],
      failures: [{ line: 0, error: "No CSV rows detected." }],
    };
  }

  const normalized = records.map((record) => normalizeTournamentRow(record, defaults));
  const successes = normalized.filter(
    (r): r is Extract<NormalizeResult, { ok: true }> => r.ok
  );
  const failures = normalized
    .filter((r): r is Extract<NormalizeResult, { ok: false }> => !r.ok)
    .map((f) => ({ line: f.line, error: f.error }));

  const warnings: CsvIngestWarning[] = [];
  successes.forEach((s) => s.warnings.forEach((w) => warnings.push({ line: s.line, message: w })));

  return {
    ok: successes.length > 0,
    dryRun: true,
    parsed: records.length,
    valid: successes.length,
    invalid: failures.length,
    warnings,
    failures,
    successes: successes.map((s) => ({ line: s.line, tournament: s.value, warnings: s.warnings })),
  };
}

export async function ingestTournamentCsvText(params: {
  csvText: string;
  defaults: CsvIngestDefaults;
  dryRun?: boolean;
  includeSuccesses?: boolean;
}): Promise<CsvIngestResult> {
  const { csvText, defaults } = params;
  const dryRun = Boolean(params.dryRun);
  const includeSuccesses = Boolean(params.includeSuccesses);

  const parsed = parseTournamentCsvText(csvText, defaults);
  if (!parsed.ok) {
    return { ...parsed, dryRun };
  }

  const successes = parsed.successes ?? [];
  if (dryRun) {
    return {
      ...parsed,
      dryRun: true,
      successes: includeSuccesses ? successes : undefined,
    };
  }

  // Use the existing import path so we get the same behavior as the Admin "Tournament uploads" flow,
  // including multi-venue parsing and venue link upserts.
  const importRes = await importTournamentRecords(successes.map((row) => row.tournament));
  const upserted = importRes.success ?? 0;

  importRes.failures.forEach((failure) => {
    parsed.failures.push({
      line: 0,
      error: failure.error,
    });
  });

  return {
    ok: upserted > 0,
    dryRun: false,
    parsed: parsed.parsed,
    valid: parsed.valid,
    invalid: parsed.invalid,
    warnings: parsed.warnings,
    failures: parsed.failures,
    successes: includeSuccesses ? successes : undefined,
    upserted,
  };
}
