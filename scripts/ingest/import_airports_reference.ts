/*
 * Import the full global OurAirports dataset into public.airports.
 *
 * Dry run:
 *   npx tsx scripts/ingest/import_airports_reference.ts
 *
 * Apply to Supabase:
 *   npx tsx scripts/ingest/import_airports_reference.ts --apply
 *
 * Optional:
 *   AIRPORTS_CSV_URL=https://ourairports.com/data/airports.csv
 *   AIRPORTS_IMPORT_LIMIT=1000
 *
 * Import rule:
 * - full global dataset (no country filter)
 * - import all allowed OurAirports airport types
 * - is_commercial = scheduled_service && airport_type in {large, medium, small}
 * - is_major = scheduled_service && airport_type in {large, medium}
 * - major_rank = 1 for large, 2 for medium, null otherwise
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const CSV_URL = process.env.AIRPORTS_CSV_URL || "https://ourairports.com/data/airports.csv";
const LIMIT = Number(process.env.AIRPORTS_IMPORT_LIMIT || "0");
const UPSERT_CHUNK = 1000;
const ALLOWED_TYPES = new Set([
  "large_airport",
  "medium_airport",
  "small_airport",
  "heliport",
  "seaplane_base",
  "balloonport",
  "closed",
]);
const COMMERCIAL_TYPES = new Set(["large_airport", "medium_airport", "small_airport"]);
const MAJOR_TYPES = new Set(["large_airport", "medium_airport"]);

type CsvRow = Record<string, string>;

type AirportUpsertRow = {
  source: "ourairports";
  source_airport_id: number;
  ident: string;
  airport_type: string;
  name: string;
  municipality: string | null;
  iso_country: string;
  iso_region: string | null;
  continent: string | null;
  iata_code: string | null;
  gps_code: string | null;
  local_code: string | null;
  latitude_deg: number;
  longitude_deg: number;
  elevation_ft: number | null;
  scheduled_service: boolean;
  is_commercial: boolean;
  is_major: boolean;
  major_rank: number | null;
  home_link: string | null;
  wikipedia_link: string | null;
  keywords: string | null;
  raw: CsvRow;
};

function loadLocalEnv() {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function clean(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  return v.length ? v : null;
}

function parseBoolean(value: string | null | undefined) {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "yes" || v === "true" || v === "1";
}

function parseInteger(value: string | null | undefined) {
  const v = clean(value);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseFloatStrict(value: string | null | undefined) {
  const v = clean(value);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      field = "";
      const hasContent = row.some((cell) => cell.length > 0);
      if (hasContent) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0].map((cell) => cell.trim());
  return rows.slice(1).map((cells) => {
    const out: CsvRow = {};
    for (let i = 0; i < headers.length; i += 1) out[headers[i]] = cells[i] ?? "";
    return out;
  });
}

function toAirportRow(row: CsvRow): AirportUpsertRow | null {
  const sourceAirportId = parseInteger(row.id);
  const ident = clean(row.ident);
  const airportType = clean(row.type);
  const name = clean(row.name);
  const isoCountry = clean(row.iso_country);
  const latitude = parseFloatStrict(row.latitude_deg);
  const longitude = parseFloatStrict(row.longitude_deg);
  if (
    sourceAirportId === null ||
    !ident ||
    !airportType ||
    !name ||
    !isoCountry ||
    latitude === null ||
    longitude === null ||
    !ALLOWED_TYPES.has(airportType)
  ) {
    return null;
  }

  const scheduledService = parseBoolean(row.scheduled_service);
  const isCommercial = scheduledService && COMMERCIAL_TYPES.has(airportType);
  const isMajor = scheduledService && MAJOR_TYPES.has(airportType);
  const majorRank = airportType === "large_airport" ? 1 : airportType === "medium_airport" ? 2 : null;

  return {
    source: "ourairports",
    source_airport_id: sourceAirportId,
    ident,
    airport_type: airportType,
    name,
    municipality: clean(row.municipality),
    iso_country: isoCountry,
    iso_region: clean(row.iso_region),
    continent: clean(row.continent),
    iata_code: clean(row.iata_code),
    gps_code: clean(row.gps_code),
    local_code: clean(row.local_code),
    latitude_deg: latitude,
    longitude_deg: longitude,
    elevation_ft: parseInteger(row.elevation_ft),
    scheduled_service: scheduledService,
    is_commercial: isCommercial,
    is_major: isMajor,
    major_rank: isMajor ? majorRank : null,
    home_link: clean(row.home_link),
    wikipedia_link: clean(row.wikipedia_link),
    keywords: clean(row.keywords),
    raw: row,
  };
}

async function fetchCsvText(url: string) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "RI-MVP airport importer",
      accept: "text/csv,text/plain;q=0.9,*/*;q=0.1",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch airports CSV: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

async function main() {
  loadLocalEnv();

  const csvText = await fetchCsvText(CSV_URL);
  const parsedRows = parseCsv(csvText);
  const airportRows = parsedRows.map(toAirportRow).filter(Boolean) as AirportUpsertRow[];
  const limitedRows = LIMIT > 0 ? airportRows.slice(0, LIMIT) : airportRows;

  const summary = {
    mode: APPLY ? "apply" : "dry-run",
    csv_url: CSV_URL,
    csv_rows: parsedRows.length,
    valid_airports: limitedRows.length,
    full_dataset_valid_airports: airportRows.length,
    by_type: Object.fromEntries(
      Array.from(ALLOWED_TYPES).map((type) => [type, limitedRows.filter((row) => row.airport_type === type).length])
    ),
    commercial_airports: limitedRows.filter((row) => row.is_commercial).length,
    major_airports: limitedRows.filter((row) => row.is_major).length,
    sample: limitedRows.slice(0, 10).map((row) => ({
      ident: row.ident,
      iata_code: row.iata_code,
      airport_type: row.airport_type,
      name: row.name,
      municipality: row.municipality,
      iso_country: row.iso_country,
      scheduled_service: row.scheduled_service,
      is_commercial: row.is_commercial,
      is_major: row.is_major,
      major_rank: row.major_rank,
    })),
  };

  if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let upserted = 0;
  for (let i = 0; i < limitedRows.length; i += UPSERT_CHUNK) {
    const chunk = limitedRows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .from("airports" as any)
      .upsert(chunk, { onConflict: "source_airport_id", ignoreDuplicates: false });
    if (error) throw error;
    upserted += chunk.length;
  }

  console.log(
    JSON.stringify(
      {
        ...summary,
        upserted,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[import-airports-reference] fatal", error);
  process.exitCode = 1;
});
