#!/usr/bin/env node
/**
 * Cleans mixed/quoted CSV dumps into the Discovery V2.5 canonical CSV format.
 *
 * Designed for admin-run, local use:
 *   node scripts/ops/clean_discovery_csv_v25.mjs --in /path/file.csv --out tmp/cleaned.csv
 *
 * Notes:
 * - Handles the common ChatGPT export pattern where each row is wrapped as a single quoted CSV field.
 * - Supports a few known schema shapes (11 / 15 / 20 columns) and normalizes into canonical columns.
 * - Drops rows with start_date in 2027+ by default (configurable).
 */

import fs from "node:fs";
import path from "node:path";

const CANONICAL_HEADER = [
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
];

function parseArgs(argv) {
  const out = { in: "", out: "", drop_year_gte: 2027 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--in") out.in = String(argv[++i] ?? "");
    else if (a === "--out") out.out = String(argv[++i] ?? "");
    else if (a === "--drop-year-gte") out.drop_year_gte = Number(argv[++i] ?? 2027);
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let currentField = "";
  let currentRow = [];
  let inQuotes = false;
  const input = String(text ?? "").replace(/^\uFEFF/, "");

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

  return rows.filter((row) => row.some((v) => String(v ?? "").trim().length));
}

function stripOuterQuotes(value) {
  const v = String(value ?? "");
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  return v;
}

function parseRowMaybeWrapped(row) {
  if (!Array.isArray(row) || row.length !== 1) return row;
  const cell = String(row[0] ?? "");
  if (!cell.includes(",")) return row;
  const inner = parseCsv(stripOuterQuotes(cell));
  return inner[0] ?? row;
}

function esc(value) {
  const v = value == null ? "" : String(value);
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "").trim());
}

function normalizeState2(value) {
  const v = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : "";
}

function normalizeUrl(value) {
  const v = String(value ?? "").trim();
  if (!/^https?:\/\//i.test(v)) return "";
  // Strip trailing punctuation that often sneaks in.
  return v.replace(/[),.;\]]+$/g, "");
}

function splitAddressLine(value) {
  // "7353 Eugene Ave, Las Vegas, NV 89128" -> { address, city, state, zip }
  const v = String(value ?? "").trim().replace(/\s+/g, " ");
  const m = v.match(/^(.+?),\s*([^,]+?),\s*([A-Z]{2})\s*(\d{5})(?:-\d{4})?$/);
  if (!m) return null;
  return { address: m[1].trim(), city: m[2].trim(), state: m[3].trim(), zip: m[4].trim() };
}

function mapRowToCanonical(row) {
  const cols = row.length;

  if (cols === 11) {
    const [tournament_name, sport, city, state, start_date, end_date, venue_name, venue_address_raw, official_website_url, source_url, confidence] =
      row.map((v) => String(v ?? "").trim());

    const split = splitAddressLine(venue_address_raw);
    const venue_address = split ? split.address : venue_address_raw;
    const venue_city = split ? split.city : city;
    const venue_state = split ? split.state : state;
    const venue_zip = split ? split.zip : "";

    return {
      tournament_name,
      sport,
      city,
      state,
      start_date,
      end_date,
      official_website_url,
      source_url,
      host_org: "",
      tournament_director: "",
      tournament_director_email: "",
      referee_contact: "",
      referee_contact_email: "",
      venue_name,
      venue_address,
      venue_city,
      venue_state,
      venue_zip,
      venue_url: "",
      venue_latitude: "",
      venue_longitude: "",
      confidence,
      notes: "",
    };
  }

  if (cols === 15) {
    const [
      tournament_name,
      sport,
      city,
      state,
      start_date,
      end_date,
      official_website_url,
      source_url,
      host_org,
      venue_name,
      venue_address,
      venue_city,
      venue_state,
      venue_zip,
      confidence,
    ] = row.map((v) => String(v ?? "").trim());

    return {
      tournament_name,
      sport,
      city,
      state,
      start_date,
      end_date,
      official_website_url,
      source_url,
      host_org,
      tournament_director: "",
      tournament_director_email: "",
      referee_contact: "",
      referee_contact_email: "",
      venue_name,
      venue_address,
      venue_city,
      venue_state,
      venue_zip,
      venue_url: "",
      venue_latitude: "",
      venue_longitude: "",
      confidence,
      notes: "",
    };
  }

  if (cols === 20) {
    const [
      tournament_name,
      sport,
      city,
      state,
      start_date,
      end_date,
      official_website_url,
      source_url,
      host_org,
      tournament_director,
      tournament_director_email,
      referee_contact,
      venue_name,
      venue_address,
      venue_city,
      venue_state,
      venue_zip,
      venue_url,
      confidence,
      notes,
    ] = row.map((v) => String(v ?? "").trim());

    // Note: this schema does not include referee_contact_email; keep blank.
    return {
      tournament_name,
      sport,
      city,
      state,
      start_date,
      end_date,
      official_website_url,
      source_url,
      host_org,
      tournament_director,
      tournament_director_email,
      referee_contact,
      referee_contact_email: "",
      venue_name,
      venue_address,
      venue_city,
      venue_state,
      venue_zip,
      venue_url,
      venue_latitude: "",
      venue_longitude: "",
      confidence,
      notes,
    };
  }

  return null;
}

function canonicalRowToLine(r) {
  const values = CANONICAL_HEADER.map((k) => esc(r[k] ?? ""));
  return values.join(",");
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.in) {
    console.log("Usage: node scripts/ops/clean_discovery_csv_v25.mjs --in <input.csv> --out <output.csv> [--drop-year-gte 2027]");
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = args.in;
  const outPath = args.out || path.join(process.cwd(), "tmp", `cleaned_${path.basename(inputPath)}`);

  const text = fs.readFileSync(inputPath, "utf8");
  const rawRows = parseCsv(text);
  if (!rawRows.length) {
    console.error("No rows detected.");
    process.exit(1);
  }

  let header = rawRows[0];
  if (header.length === 1 && String(header[0] ?? "").includes(",")) header = String(header[0]).split(",").map((s) => s.trim());

  const rows = rawRows.slice(1).map(parseRowMaybeWrapped);

  const outLines = [CANONICAL_HEADER.join(",")];
  const stats = {
    total: rows.length,
    mapped: 0,
    dropped_year: 0,
    dropped_invalid: 0,
    dropped_unmapped_schema: 0,
    schema_11: 0,
    schema_15: 0,
    schema_20: 0,
  };

  for (const row of rows) {
    const mapped = mapRowToCanonical(row);
    if (!mapped) {
      stats.dropped_unmapped_schema += 1;
      continue;
    }

    if (row.length === 11) stats.schema_11 += 1;
    if (row.length === 15) stats.schema_15 += 1;
    if (row.length === 20) stats.schema_20 += 1;

    // Basic normalization/validation (keeps this file safe for downstream parsers).
    mapped.state = normalizeState2(mapped.state);
    mapped.venue_state = normalizeState2(mapped.venue_state);
    mapped.official_website_url = normalizeUrl(mapped.official_website_url);
    mapped.source_url = normalizeUrl(mapped.source_url);
    mapped.venue_url = normalizeUrl(mapped.venue_url);

    if (!mapped.tournament_name || !mapped.sport || !mapped.state || !isIsoDate(mapped.start_date) || !isIsoDate(mapped.end_date) || !mapped.source_url) {
      stats.dropped_invalid += 1;
      continue;
    }

    const year = Number(String(mapped.start_date).slice(0, 4));
    if (Number.isFinite(year) && year >= args.drop_year_gte) {
      stats.dropped_year += 1;
      continue;
    }

    stats.mapped += 1;
    outLines.push(canonicalRowToLine(mapped));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, outLines.join("\n"));

  console.log(JSON.stringify({ in: inputPath, out: outPath, header_detected_cols: header.length, ...stats }, null, 2));
}

main();

