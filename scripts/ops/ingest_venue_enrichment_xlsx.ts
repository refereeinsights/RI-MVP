import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

dotenv.config({ path: ".env.local" });
dotenv.config();

type EnrichedRow = {
  idx: number;
  sport: string;
  tournament_name: string;
  city: string;
  state: string;
  start_date: string;
  end_date: string;
  official_url: string;
  venue_name: string;
  venue_address: string;
  notes: string;
};

type TournamentRow = {
  id: string;
  name: string | null;
  state: string | null;
  start_date: string | null;
  official_website_url: string | null;
  source_url: string | null;
  sport: string | null;
  venue: string | null;
  address: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue_url: string | null;
};

const APPLY = process.argv.includes("--apply");
const HELP = process.argv.includes("--help") || process.argv.includes("-h");
const UPDATE_TOURNAMENT_FIELDS = !process.argv.includes("--no_update_tournament_fields");

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

function requireEnv(name: string) {
  const v = clean(process.env[name]);
  if (!v) throw new Error(`Missing ${name}.`);
  return v;
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeUrl(raw: string) {
  const v = clean(raw);
  if (!v) return "";
  try {
    const u = new URL(v);
    u.hash = "";
    // Keep query: some platforms use query-based ids (PerfectGame, etc.)
    const str = u.toString();
    return str.endsWith("/") ? str.slice(0, -1) : str;
  } catch {
    return "";
  }
}

function parseUsAddress(full: string): { address: string; city: string; state: string; zip: string } | null {
  const parts = String(full ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;
  const address = parts[0] ?? "";
  const city = parts[1] ?? "";
  const stateZip = parts.slice(2).join(" ");
  const m = stateZip.match(/\b([A-Za-z]{2})\b\s*(\d{5})(?:-\d{4})?$/);
  if (!m) return null;
  return { address, city, state: m[1]!.toUpperCase(), zip: m[2]! };
}

function looksLikeStreetAddress(addr: string) {
  const v = clean(addr);
  if (!v) return false;
  if (!/^\d{1,6}\s/.test(v)) return false;
  if (/\bP\.?\s*O\.?\s*Box\b/i.test(v)) return false;
  const suffix =
    /\b(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pkwy|Parkway|Pl|Place|Cir|Circle|Ter|Terrace|Highway|Hwy)\b\.?/i;
  return suffix.test(v);
}

function unzipText(xlsxPath: string, innerPath: string) {
  try {
    return execFileSync("unzip", ["-p", xlsxPath, innerPath], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function parseInlineStrCell($c: cheerio.Cheerio<cheerio.Element>) {
  const t = clean($c.find("is > t").first().text());
  return t;
}

function colFromCellRef(cellRef: string) {
  const m = String(cellRef ?? "").match(/^([A-Z]+)\d+$/i);
  if (!m) return "";
  return String(m[1] ?? "").toUpperCase();
}

function extractSheetRows(sheetXml: string): EnrichedRow[] {
  const $ = cheerio.load(sheetXml, { xmlMode: true });
  const out: EnrichedRow[] = [];

  const headersByCol = new Map<string, string>();
  const headerRow = $("sheetData > row[r='1']").first();
  headerRow.find("c").each((_idx, el) => {
    const $c = $(el);
    const col = colFromCellRef($c.attr("r") || "");
    if (!col) return;
    const header = parseInlineStrCell($c);
    if (header) headersByCol.set(col, header);
  });

  $("sheetData > row").each((_idx, rowEl) => {
    const $row = $(rowEl);
    const r = Number($row.attr("r") || "0");
    if (!Number.isFinite(r) || r <= 1) return;

    const cells: Record<string, string> = {};
    $row.find("c").each((_cIdx, cellEl) => {
      const $c = $(cellEl);
      const col = colFromCellRef($c.attr("r") || "");
      if (!col) return;
      const type = String($c.attr("t") || "");
      let value = "";
      if (type === "inlineStr") value = parseInlineStrCell($c);
      else if (type === "n") value = clean($c.find("v").first().text());
      else value = clean($c.text());
      if (value) cells[col] = value;
    });

    // Data rows have an index in column A.
    const idx = Number(cells["A"] || "");
    if (!Number.isFinite(idx) || idx <= 0) return;

    const row: EnrichedRow = {
      idx,
      sport: clean(cells["B"]),
      tournament_name: clean(cells["C"]),
      city: clean(cells["D"]),
      state: clean(cells["E"]).toUpperCase(),
      start_date: clean(cells["F"]),
      end_date: clean(cells["G"]),
      official_url: clean(cells["H"]),
      venue_name: clean(cells["I"]),
      venue_address: clean(cells["J"]),
      notes: clean(cells["L"]),
    };

    // Skip malformed / empty rows.
    if (!row.tournament_name || !row.state || !row.start_date) return;
    if (!row.official_url) return;
    if (!row.venue_name || !row.venue_address) return;

    out.push(row);
  });

  return out;
}

async function findVenueByUniqueKey(
  supabase: ReturnType<typeof createClient>,
  params: { venueName: string; address: string; city: string; state: string }
): Promise<VenueRow | null> {
  const { venueName, address, city, state } = params;
  const { data, error } = await supabase
    .from("venues" as any)
    .select("id,name,address,address1,city,state,zip,venue_url")
    .eq("state", state)
    .eq("city", city)
    .eq("name", venueName)
    .limit(50);
  if (error) throw new Error(error.message);
  const candidates = (data ?? []) as VenueRow[];
  const targetAddr = normalize(address);
  return (
    candidates.find((v) => normalize(v.address1 || v.address) === targetAddr) ??
    candidates.find((v) => normalize(v.address) === targetAddr) ??
    null
  );
}

function printHelp() {
  console.log(
    [
      "Ingest a venue enrichment XLSX and link/create venues for tournaments.",
      "",
      "Usage:",
      "  TMPDIR=./tmp node --import tsx scripts/ops/ingest_venue_enrichment_xlsx.ts --file=/path/to/file.xlsx",
      "  TMPDIR=./tmp node --import tsx scripts/ops/ingest_venue_enrichment_xlsx.ts --file=/path/to/file.xlsx --apply",
      "",
      "Options:",
      "  --no_update_tournament_fields   Do not fill tournaments.venue/address when blank.",
      "",
      "Env required:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
    ].join("\n")
  );
}

async function main() {
  if (HELP) {
    printHelp();
    return;
  }

  const filePath = argValue("file") || argValue("path");
  if (!filePath) throw new Error("Missing --file=... (xlsx)");
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) throw new Error(`File not found: ${absPath}`);

  const sheet1 = unzipText(absPath, "xl/worksheets/sheet1.xml");
  if (!sheet1) throw new Error("Failed to read sheet1.xml from XLSX (is it a valid .xlsx?)");

  const rows = extractSheetRows(sheet1);
  if (!rows.length) throw new Error("No usable rows found in sheet1.");

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Build URL index for tournaments by official_website_url and source_url.
  const uniqueUrls = Array.from(new Set(rows.map((r) => canonicalizeUrl(r.official_url)).filter(Boolean)));
  const tournamentByUrl = new Map<string, TournamentRow[]>();

  const fetchChunk = async (field: "official_website_url" | "source_url", urls: string[]) => {
    for (let i = 0; i < urls.length; i += 50) {
      const chunk = urls.slice(i, i + 50);
      const { data, error } = await supabase
        .from("tournaments" as any)
        .select("id,name,state,start_date,official_website_url,source_url,sport,venue,address")
        .in(field, chunk)
        .limit(5000);
      if (error) throw new Error(error.message);
      for (const t of ((data ?? []) as TournamentRow[])) {
        const keys = [canonicalizeUrl((t as any).official_website_url), canonicalizeUrl((t as any).source_url)].filter(Boolean);
        for (const key of keys) {
          const arr = tournamentByUrl.get(key) ?? [];
          arr.push(t);
          tournamentByUrl.set(key, arr);
        }
      }
    }
  };

  await fetchChunk("official_website_url", uniqueUrls);
  await fetchChunk("source_url", uniqueUrls);

  // Resolve tournament id for each row; then group venue rows by tournament_id.
  const unresolved: EnrichedRow[] = [];
  const grouped = new Map<
    string,
    { tournament: TournamentRow; venues: Array<{ venue_name: string; venue_address: string; source_url: string; notes: string }> }
  >();

  for (const row of rows) {
    const key = canonicalizeUrl(row.official_url);
    const candidates = (tournamentByUrl.get(key) ?? []).slice();
    let tournament: TournamentRow | null = null;

    if (candidates.length === 1) {
      tournament = candidates[0]!;
    } else if (candidates.length > 1) {
      const state = row.state.toUpperCase();
      const start = row.start_date;
      tournament =
        candidates.find((t) => clean(t.state).toUpperCase() === state && clean(t.start_date) === start) ??
        candidates.find((t) => clean(t.state).toUpperCase() === state) ??
        candidates[0]!;
    }

    if (!tournament) {
      unresolved.push(row);
      continue;
    }

    const existing = grouped.get(tournament.id) ?? { tournament, venues: [] };
    existing.venues.push({
      venue_name: row.venue_name,
      venue_address: row.venue_address,
      source_url: row.official_url,
      notes: row.notes,
    });
    grouped.set(tournament.id, existing);
  }

  // Attempt fallback resolution for a small number of unresolved rows by name/state/start_date.
  for (const row of unresolved.slice(0, 60)) {
    const { data, error } = await supabase
      .from("tournaments" as any)
      .select("id,name,state,start_date,official_website_url,source_url,sport,venue,address")
      .eq("status", "published")
      .eq("state", row.state)
      .eq("start_date", row.start_date)
      .ilike("name", row.tournament_name)
      .limit(3);
    if (error) throw new Error(error.message);
    const hit = ((data ?? []) as TournamentRow[])[0] ?? null;
    if (!hit) continue;
    const existing = grouped.get(hit.id) ?? { tournament: hit, venues: [] };
    existing.venues.push({
      venue_name: row.venue_name,
      venue_address: row.venue_address,
      source_url: row.official_url,
      notes: row.notes,
    });
    grouped.set(hit.id, existing);
  }

  const reportPath = path.join(
    os.tmpdir(),
    `ri_venue_enrichment_xlsx_ingest_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`
  );

  let tournamentsTouched = 0;
  let venueRowsSeen = 0;
  let venueRowsLinked = 0;
  let venuesCreated = 0;
  let venuesMatched = 0;
  let skippedRows = 0;

  const report: Array<Record<string, string>> = [];

  const existingLinks = new Set<string>();
  const tournamentIds = Array.from(grouped.keys());
  for (let i = 0; i < tournamentIds.length; i += 50) {
    const chunk = tournamentIds.slice(i, i + 50);
    const { data, error } = await supabase.from("tournament_venues" as any).select("tournament_id,venue_id").in("tournament_id", chunk).limit(20000);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ tournament_id: string; venue_id: string }>) {
      existingLinks.add(`${row.tournament_id}|${row.venue_id}`);
    }
  }

  for (const [tournamentId, payload] of grouped.entries()) {
    tournamentsTouched += 1;
    const tournament = payload.tournament;
    const sport = clean(tournament.sport) || null;

    // De-dupe venue rows within tournament.
    const uniq = new Map<string, { venue_name: string; venue_address: string; source_url: string; notes: string }>();
    for (const v of payload.venues) {
      const key = `${normalize(v.venue_name)}|${normalize(v.venue_address)}`;
      if (!uniq.has(key)) uniq.set(key, v);
    }
    const venues = Array.from(uniq.values()).slice(0, 10);

    for (const v of venues) {
      venueRowsSeen += 1;
      if (!looksLikeStreetAddress(v.venue_address)) {
        skippedRows += 1;
        report.push({
          tournament_id: tournamentId,
          tournament_name: clean(tournament.name) || tournamentId,
          venue_name: v.venue_name,
          venue_address: v.venue_address,
          action: "skipped_non_street_address",
          message: "",
        });
        continue;
      }

      const parsed = parseUsAddress(v.venue_address);
      if (!parsed) {
        skippedRows += 1;
        report.push({
          tournament_id: tournamentId,
          tournament_name: clean(tournament.name) || tournamentId,
          venue_name: v.venue_name,
          venue_address: v.venue_address,
          action: "skipped_unparseable_address",
          message: "",
        });
        continue;
      }

      const venueName = clean(v.venue_name);
      if (!venueName) {
        skippedRows += 1;
        report.push({
          tournament_id: tournamentId,
          tournament_name: clean(tournament.name) || tournamentId,
          venue_name: v.venue_name,
          venue_address: v.venue_address,
          action: "skipped_missing_venue_name",
          message: "",
        });
        continue;
      }

      const { address, city, state, zip } = parsed;

      // Prefer exact match by unique key.
      let venue: VenueRow | null = await findVenueByUniqueKey(supabase, {
        venueName,
        address,
        city,
        state,
      });

      if (!venue) {
        // Second pass: look up by (state,zip) then fuzzy match.
        const { data: candidatesRaw, error: candidatesErr } = await supabase
          .from("venues" as any)
          .select("id,name,address,address1,city,state,zip,venue_url")
          .eq("state", state)
          .eq("zip", zip)
          .limit(250);
        if (candidatesErr) throw new Error(candidatesErr.message);
        const candidates = (candidatesRaw ?? []) as VenueRow[];
        const targetName = normalize(venueName);
        const targetAddr = normalize(address);
        const targetCity = normalize(city);

        venue =
          candidates.find((c) => normalize(c.name) === targetName && normalize(c.city) === targetCity && normalize(c.address1 || c.address) === targetAddr) ??
          candidates.find((c) => normalize(c.city) === targetCity && normalize(c.address1 || c.address) === targetAddr) ??
          null;
      }

      let created = false;
      if (!venue) {
        const insertPayload: any = {
          name: venueName,
          address,
          city,
          state,
          zip,
          sport,
        };
        if (!APPLY) {
          created = true;
          venue = {
            id: "DRY_RUN_VENUE",
            name: venueName,
            address,
            address1: null,
            city,
            state,
            zip,
            venue_url: null,
          };
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("venues" as any)
            .upsert(insertPayload, { onConflict: "name,address,city,state" })
            .select("id,name,address,address1,city,state,zip,venue_url")
            .single();
          if (insErr) throw new Error(insErr.message);
          venue = inserted as any;
          created = true;
        }
      }

      if (!venue?.id) throw new Error("venue_not_resolved");

      if (created) venuesCreated += 1;
      else venuesMatched += 1;

      if (venue.id !== "DRY_RUN_VENUE") {
        const linkKey = `${tournamentId}|${venue.id}`;
        if (!existingLinks.has(linkKey)) {
          if (!APPLY) {
            existingLinks.add(linkKey);
          } else {
            const { error: linkErr } = await supabase
              .from("tournament_venues" as any)
              .upsert([{ tournament_id: tournamentId, venue_id: venue.id }], { onConflict: "tournament_id,venue_id" });
            if (linkErr) throw new Error(linkErr.message);
            existingLinks.add(linkKey);
          }
        }

        if (UPDATE_TOURNAMENT_FIELDS) {
          const patch: any = {};
          if (!clean(tournament.venue)) patch.venue = venueName;
          if (!clean(tournament.address)) patch.address = `${address}, ${city}, ${state} ${zip}`;
          if (Object.keys(patch).length) {
            if (APPLY) {
              const { error: updErr } = await supabase.from("tournaments" as any).update(patch).eq("id", tournamentId);
              if (updErr) throw new Error(updErr.message);
            }
          }
        }
      }

      venueRowsLinked += 1;
      report.push({
        tournament_id: tournamentId,
        tournament_name: clean(tournament.name) || tournamentId,
        venue_name: venueName,
        venue_address: `${address}, ${city}, ${state} ${zip}`,
        action: created ? "created_and_linked" : "linked_existing",
        message: v.source_url ? `source=${v.source_url}` : "",
      });
    }
  }

  const header = Object.keys({
    tournament_id: "",
    tournament_name: "",
    venue_name: "",
    venue_address: "",
    action: "",
    message: "",
  });
  const esc = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const csv = [
    header.join(","),
    ...report.map((r) => header.map((h) => esc(String(r[h] ?? ""))).join(",")),
  ].join("\n");
  fs.writeFileSync(reportPath, csv);

  console.log(
    [
      "",
      "Done.",
      `- apply: ${APPLY ? "yes" : "no"}`,
      `- xlsx_rows: ${rows.length}`,
      `- tournaments_touched: ${tournamentsTouched}`,
      `- venue_rows_seen: ${venueRowsSeen}`,
      `- venue_rows_linked: ${venueRowsLinked}`,
      `- venues_created: ${venuesCreated}`,
      `- venues_matched: ${venuesMatched}`,
      `- skipped_rows: ${skippedRows}`,
      `- unresolved_input_rows: ${unresolved.length}`,
      `- report: ${reportPath}`,
    ].join("\n")
  );
}

main().catch((err) => {
  console.error("ERROR", err?.message || err);
  process.exit(1);
});

