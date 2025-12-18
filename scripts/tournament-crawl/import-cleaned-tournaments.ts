import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";
import type { TournamentRow, TournamentSource } from "@/lib/types/tournament";

type CsvRow = Record<string, string>;

type ParsedCsv = {
  headers: string[];
  rows: CsvRow[];
};

const ALLOWED_SPORTS = new Set(["soccer", "basketball", "football"]);
const DEFAULT_SOURCE: TournamentSource = "external_crawl";

type CliOptions = {
  input: string;
  source: TournamentSource;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let input = "";
  let source: TournamentSource = DEFAULT_SOURCE;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" && args[i + 1]) {
      input = args[++i];
    } else if (arg === "--source" && args[i + 1]) {
      const candidate = args[++i] as TournamentSource;
      source = candidate;
    }
  }

  if (!input) {
    console.error("Usage: npm run import-cleaned-tournaments -- --input <clean_csv> [--source external_crawl]");
    process.exit(1);
  }

  return { input: path.resolve(input), source };
}

function parseCsv(text: string): ParsedCsv {
  const headers: string[] = [];
  const rows: CsvRow[] = [];
  const currentField: string[] = [];
  const currentRow: string[] = [];
  let insideQuotes = false;

  const pushField = () => {
    currentRow.push(currentField.join(""));
    currentField.length = 0;
  };

  const pushRow = () => {
    if (!currentRow.length) return;
    if (!headers.length) {
      headers.push(...currentRow);
    } else {
      const row: CsvRow = {};
      headers.forEach((header, index) => {
        row[header] = currentRow[index] ?? "";
      });
      rows.push(row);
    }
    currentRow.length = 0;
  };

  const chars = text.split("");
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
}

function normalize(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

async function main() {
  const options = parseArgs();
  const csvText = await fs.readFile(options.input, "utf8");
  const { headers, rows } = parseCsv(csvText);

  if (!headers.length) {
    console.error("Input file has no headers.");
    process.exit(1);
  }

  let success = 0;
  let skipped = 0;
  for (const row of rows) {
    const name = normalize(row.name);
    const slug = normalize(row.slug);
    const sportRaw = normalize(row.sport).toLowerCase();
    const state = normalize(row.state) || null;
    const city = normalize(row.city) || null;
    const summary = normalize(row.summary) || null;
    const sourceUrl = normalize(row.source_url);

    if (!name || !slug || !sourceUrl) {
      skipped++;
      continue;
    }

    if (!ALLOWED_SPORTS.has(sportRaw)) {
      skipped++;
      continue;
    }

    let sourceDomain = "";
    try {
      sourceDomain = new URL(sourceUrl).hostname;
    } catch {
      skipped++;
      continue;
    }

    const record: TournamentRow = {
      name,
      slug,
      sport: sportRaw as TournamentRow["sport"],
      level: normalize(row.level) || null,
      state,
      city,
      venue: normalize(row.venue) || null,
      address: normalize(row.address) || null,
      start_date: normalize(row.start_date) || null,
      end_date: normalize(row.end_date) || null,
      summary,
      status: "draft",
      source: options.source,
      source_event_id: slug,
      source_url: sourceUrl,
      source_domain: sourceDomain,
      raw: row,
    };

    try {
      await upsertTournamentFromSource(record);
      success++;
    } catch (error) {
      skipped++;
      console.error(`Failed to import ${name}:`, (error as Error).message);
    }
  }

  console.log(`Processed ${rows.length} rows. Imported: ${success}. Skipped: ${skipped}.`);
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
