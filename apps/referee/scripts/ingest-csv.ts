/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { TournamentRow, TournamentSource, TournamentStatus } from "@/lib/types/tournament";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";

type CliOptions = {
  filePath: string;
  dryRun: boolean;
  defaultSource?: TournamentSource;
  defaultStatus: TournamentStatus;
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
];

const KNOWN_STATUSES: TournamentStatus[] = ["draft", "published", "stale", "archived"];

function usage(exitCode: number) {
  console.log(
    [
      "Usage: tsx scripts/ingest-csv.ts [options] <path-to-csv>",
      "",
      "Options:",
      "  --dry-run           Parse and show the rows without writing to Supabase",
      "  --source=<source>   Default TournamentSource (us_club_soccer|cal_south|gotsoccer|soccerwire)",
      "  --status=<status>   Default status (draft|published|stale|archived)",
      "  --help              Show this help message",
      "",
      "CSV Requirements:",
      '  Must include columns for "name", "state", "source_url", and either "source" column or --source flag.',
      "  Optional columns: city, level, venue, address, start_date, end_date, summary, confidence, source_domain, source_event_id.",
    ].join("\n")
  );
  process.exit(exitCode);
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help")) {
    usage(args.includes("--help") ? 0 : 1);
  }

  let fileArg: string | undefined;
  let dryRun = false;
  let defaultSource: TournamentSource | undefined;
  let defaultStatus: TournamentStatus = "published";

  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--source=")) {
      const value = arg.split("=")[1]?.trim().toLowerCase();
      if (value && isValidSource(value)) {
        defaultSource = value;
      } else {
        console.error(`Unknown source "${value}". Expected one of: ${KNOWN_SOURCES.join(", ")}.`);
        process.exit(1);
      }
    } else if (arg.startsWith("--status=")) {
      const value = arg.split("=")[1]?.trim().toLowerCase();
      if (value && isValidStatus(value)) {
        defaultStatus = value;
      } else {
        console.error(
          `Unknown status "${value}". Expected one of: ${KNOWN_STATUSES.join(", ")}.`
        );
        process.exit(1);
      }
    } else if (arg === "--help") {
      usage(0);
    } else if (arg.startsWith("--")) {
      console.error(`Unknown flag "${arg}".`);
      usage(1);
    } else if (!fileArg) {
      fileArg = path.resolve(arg);
    } else {
      console.error(`Unexpected positional argument "${arg}".`);
      usage(1);
    }
  }

  if (!fileArg) {
    console.error("Missing CSV path.");
    usage(1);
  }

  return { filePath: fileArg, dryRun, defaultSource, defaultStatus };
}

function isValidSource(value: string): value is TournamentSource {
  return KNOWN_SOURCES.includes(value as TournamentSource);
}

function isValidStatus(value: string): value is TournamentStatus {
  return KNOWN_STATUSES.includes(value as TournamentStatus);
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

function normalizeTournamentRow(
  record: CsvRecord,
  defaults: Pick<CliOptions, "defaultSource" | "defaultStatus">
): NormalizeResult {
  const { data, line } = record;

  const name = pick(data, "name", "tournament_name");
  if (!name) {
    return { ok: false, error: `Row ${line}: missing "name" column`, line };
  }

  const state = pick(data, "state")?.toUpperCase();
  if (!state) {
    return { ok: false, error: `Row ${line}: missing "state" column`, line };
  }

  const sourceUrl = pick(data, "source_url", "url", "link");
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
      error: `Row ${line}: missing "source" column and no --source default provided`,
      line,
    };
  }

  const city = pick(data, "city", "location_city");
  const startDate = normalizeDate(pick(data, "start_date", "start"));
  const endDate = normalizeDate(pick(data, "end_date", "end"));
  const statusRaw = pick(data, "status");
  const normalizedStatus = statusRaw?.toLowerCase();
  const status =
    (normalizedStatus && isValidStatus(normalizedStatus) ? normalizedStatus : undefined) ??
    defaults.defaultStatus;

  const level = pick(data, "level") || null;
  const venue = pick(data, "venue") || null;
  const address = pick(data, "address") || null;
  const summary = pick(data, "summary") || null;
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

  let sourceEventId = pick(data, "source_event_id", "event_id", "external_id");
  if (!sourceEventId) {
    sourceEventId = slug;
    warnings.push(`Row ${line}: missing source_event_id (fallback to slug)`);
  }

  const sourceDomain = pick(data, "source_domain") || getDomain(sourceUrl) || "unknown";

  const tournament: TournamentRow = {
    name,
    slug,
    sport: "soccer",
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

async function ingestRows(rows: NormalizeResult[], dryRun: boolean) {
  const successes = rows.filter(
    (r): r is Extract<NormalizeResult, { ok: true }> => r.ok
  );
  const failures = rows.filter(
    (r): r is Extract<NormalizeResult, { ok: false }> => !r.ok
  );

  if (failures.length) {
    console.warn("Skipped rows:");
    failures.forEach((failure) => console.warn(`  - ${failure.error}`));
    console.warn("");
  }

  if (!successes.length) {
    console.error("Nothing to ingest.");
    process.exit(1);
  }

  if (dryRun) {
    console.log(`Dry run: ${successes.length} valid rows parsed.`);
    console.log("Sample payload:", successes.slice(0, 3).map((row) => row.value));
    successes.forEach((row) => {
      row.warnings.forEach((warning) => console.warn(warning));
    });
    return;
  }

  let inserted = 0;
  for (const row of successes) {
    try {
      await upsertTournamentFromSource(row.value);
      inserted += 1;
      row.warnings.forEach((warning) => console.warn(warning));
      console.log(`Upserted ${row.value.slug}`);
    } catch (err: any) {
      console.error(`Failed to upsert row from line ${row.line}: ${err?.message ?? err}`);
    }
  }

  console.log(`Done. ${inserted}/${successes.length} rows ingested.`);
}

async function main() {
  const options = parseArgs();

  if (!fs.existsSync(options.filePath)) {
    console.error(`File not found: ${options.filePath}`);
    process.exit(1);
  }

  const csv = fs.readFileSync(options.filePath, "utf8");
  const table = parseCsv(csv);
  const records = rowsToRecords(table);

  if (!records.length) {
    console.error("No CSV rows detected.");
    process.exit(1);
  }

  const normalized = records.map((record) => normalizeTournamentRow(record, options));

  await ingestRows(normalized, options.dryRun);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
