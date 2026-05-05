import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

type CsvRow = Record<string, string>;

function parseDotenv(contents: string) {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const parsed = parseDotenv(fs.readFileSync(envPath, "utf8"));
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function listCsvFiles(dirPath: string, match: string | null) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".csv"))
    .map((e) => e.name)
    .filter((name) => (match ? name.includes(match) : true))
    .map((name) => path.join(dirPath, name));
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function parseCsv(contents: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;

  function pushCell() {
    row.push(cur);
    cur = "";
  }
  function pushRow() {
    rows.push(row);
    row = [];
  }

  while (i < contents.length) {
    const ch = contents[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = contents[i + 1];
        if (next === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushCell();
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }

    cur += ch;
    i += 1;
  }

  if (cur.length || row.length) {
    pushCell();
    pushRow();
  }

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const out: CsvRow[] = [];
  for (const r of rows.slice(1)) {
    if (r.every((c) => !String(c ?? "").trim())) continue;
    const obj: CsvRow = {};
    for (let idx = 0; idx < header.length; idx += 1) {
      obj[header[idx]] = String(r[idx] ?? "");
    }
    out.push(obj);
  }
  return out;
}

function asIsoFromMtime(filePath: string) {
  try {
    const st = fs.statSync(filePath);
    return st.mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function main() {
  loadEnvLocal();

  const APPLY = hasFlag("apply");
  const file = clean(argValue("file"));
  const dir = clean(argValue("dir"));
  const match = clean(argValue("match"));
  if (!file && !dir) {
    throw new Error("Missing --file=tmp/season_scan_2027_....csv OR --dir=tmp (optionally --match=season_scan_2027_)");
  }

  const scannedAtOverride = clean(argValue("scanned_at"));

  const filePaths = (() => {
    if (file) {
      const filePath = path.resolve(process.cwd(), file);
      if (!fs.existsSync(filePath)) throw new Error(`File not found: ${file}`);
      return [filePath];
    }
    const dirPath = path.resolve(process.cwd(), dir!);
    if (!fs.existsSync(dirPath)) throw new Error(`Dir not found: ${dir}`);
    const files = listCsvFiles(dirPath, match);
    if (files.length === 0) {
      throw new Error(`No CSV files found in ${dir} ${match ? `matching "${match}"` : ""}`);
    }
    return files;
  })();

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let scanned = 0;
  let updated = 0;
  let noFound = 0;
  let failed = 0;
  let needsReview = 0;
  let skipped = 0;

  const perFile: Array<{ file: string; rows: number }> = [];

  for (const filePath of filePaths) {
    const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
    perFile.push({ file: path.relative(process.cwd(), filePath), rows: rows.length });
    if (rows.length === 0) continue;
    const scannedAt = scannedAtOverride ?? asIsoFromMtime(filePath);

    for (const r of rows) {
      scanned += 1;
      const tournamentId = String(r.tournament_id ?? "").trim();
      const seasonYear = Number(String(r.new_season_year ?? r.season_year ?? "2027").trim() || "2027");
      const updateAction = String(r.update_action ?? "").trim() || "unknown";

      if (!isUuid(tournamentId)) {
        skipped += 1;
        continue;
      }

      if (updateAction === "updated" || updateAction === "updated_existing_2027") updated += 1;
      else if (updateAction === "no_2027_found") noFound += 1;
      else if (updateAction === "needs_review") needsReview += 1;
      else if (updateAction === "failed_url") failed += 1;

      const scanPayload: Record<string, any> = {
        tournament_id: tournamentId,
        season_year: seasonYear,
        scanned_at: scannedAt,
        update_action: updateAction,
        source_checked: clean(r.source_checked),
        source_url_found: clean(r.source_url_found),
        official_website_url_found: clean(r.official_website_url_found),
        confidence: clean(r.confidence),
        notes: clean(r.notes),
        error: clean(r.error),
      };

      if (!APPLY) continue;

      // Upsert scan log always (this is what powers /admin/ti/seasons).
      const scanRes = await supabase
        .from("tournament_season_scan_log" as any)
        .upsert([scanPayload], { onConflict: "tournament_id,season_year" });
      if (scanRes.error) throw scanRes.error;

      // For success rows with explicit dates, also upsert tournament_seasons.
      const newStart = clean(r.new_start_date);
      const newEnd = clean(r.new_end_date);
      if ((updateAction === "updated" || updateAction === "updated_existing_2027") && newStart && newEnd) {
        const seasonPayload: Record<string, any> = {
          tournament_id: tournamentId,
          season_year: seasonYear,
          start_date: newStart,
          end_date: newEnd,
          source_url: clean(r.source_url_found),
          official_website_url: clean(r.official_website_url_found),
          date_precision: "day",
          confidence: clean(r.confidence) ?? "high",
          notes: clean(r.notes),
        };

        const seasonRes = await supabase
          .from("tournament_seasons" as any)
          .upsert([seasonPayload], { onConflict: "tournament_id,season_year" });
        if (seasonRes.error) throw seasonRes.error;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply: APPLY,
        files: perFile,
        rows: perFile.reduce((acc, f) => acc + f.rows, 0),
        scanned,
        updated,
        needs_review: needsReview,
        no_2027_found: noFound,
        failed_urls: failed,
        skipped_invalid: skipped,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
