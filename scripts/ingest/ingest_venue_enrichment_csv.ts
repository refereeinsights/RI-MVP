import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { normalizeIdentityStreet, normalizeIdentityText } from "../../apps/referee/lib/identity/fingerprints";

dotenv.config({ path: ".env.local" });
dotenv.config();

type CsvRow = {
  tournament_uuid: string;
  tournament_name?: string;
  venue_id?: string;
  venue_name: string;
  venue_address?: string;
  venue_city?: string;
  venue_state?: string;
  venue_zip?: string;
  confidence?: string;
  notes?: string;
};

type TournamentRow = {
  id: string;
  sport: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  address1: string | null;
  normalized_address?: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport?: string | null;
};

type ResultRow = {
  tournament_uuid: string;
  venue_name: string;
  venue_id?: string | null;
  action:
    | "linked_existing_venue"
    | "created_venue"
    | "already_linked"
    | "skipped"
    | "error";
  message?: string | null;
};

function clean(value: string | null | undefined) {
  const out = String(value ?? "").trim();
  return out.length ? out : null;
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((a) => a.startsWith(prefix));
  if (!arg) return null;
  return arg.slice(prefix.length);
}

function hasFlag(name: string) {
  return process.argv.slice(2).some((a) => a === `--${name}`);
}

function requireEnv(name: string) {
  const value = clean(process.env[name]);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\"") {
      const next = line[i + 1];
      if (inQuotes && next === "\"") {
        cur += "\"";
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const tournamentIdIdx = idx("tournament_uuid") >= 0 ? idx("tournament_uuid") : idx("tournament_id");
  const tournamentNameIdx = idx("tournament_name");
  const venueIdIdx = idx("venue_id");
  const venueNameIdx = idx("venue_name");
  const venueAddressIdx = idx("venue_address");
  const venueAddressTextIdx = idx("venue_address_text");
  const venueCityIdx = idx("venue_city");
  const venueStateIdx = idx("venue_state");
  const venueZipIdx = idx("venue_zip");
  const confidenceIdx = idx("confidence");
  const notesIdx = idx("notes");

  if (tournamentIdIdx < 0 || venueNameIdx < 0) {
    throw new Error(
      `CSV must include headers: tournament_uuid (or tournament_id),venue_name (and optionally venue_id,venue_address/venue_address_text,venue_city,venue_state,venue_zip,confidence,notes). Got: ${header.join(
        ","
      )}`
    );
  }

  const out: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const tournament_uuid = (cols[tournamentIdIdx] ?? "").trim();
    const venue_name = (cols[venueNameIdx] ?? "").trim();
    if (!tournament_uuid || !venue_name) continue;

    out.push({
      tournament_uuid,
      tournament_name: tournamentNameIdx >= 0 ? (cols[tournamentNameIdx] ?? "").trim() : undefined,
      venue_id: venueIdIdx >= 0 ? (cols[venueIdIdx] ?? "").trim() : undefined,
      venue_name,
      venue_address:
        venueAddressIdx >= 0
          ? (cols[venueAddressIdx] ?? "").trim()
          : venueAddressTextIdx >= 0
            ? (cols[venueAddressTextIdx] ?? "").trim()
            : undefined,
      venue_city: venueCityIdx >= 0 ? (cols[venueCityIdx] ?? "").trim() : undefined,
      venue_state: venueStateIdx >= 0 ? (cols[venueStateIdx] ?? "").trim() : undefined,
      venue_zip: venueZipIdx >= 0 ? (cols[venueZipIdx] ?? "").trim() : undefined,
      confidence: confidenceIdx >= 0 ? (cols[confidenceIdx] ?? "").trim() : undefined,
      notes: notesIdx >= 0 ? (cols[notesIdx] ?? "").trim() : undefined,
    });
  }
  return out;
}

function maybeExpandMultiVenueRows(rows: CsvRow[]): CsvRow[] {
  const out: CsvRow[] = [];

  for (const row of rows) {
    const rawName = String(row.venue_name ?? "").trim();
    const rawAddr = String(row.venue_address ?? "").trim();

    const canSplitName = rawName.includes("/") && !rawName.toLowerCase().includes("http");
    const canSplitAddr = rawAddr.includes("/") && !rawAddr.toLowerCase().includes("http");

    if (!canSplitName || !canSplitAddr) {
      out.push(row);
      continue;
    }

    const nameParts = rawName.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
    const addrParts = rawAddr.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);

    // Only expand small, aligned lists (avoid exploding malformed data).
    if (nameParts.length < 2 || nameParts.length > 5) {
      out.push(row);
      continue;
    }
    if (addrParts.length !== nameParts.length) {
      out.push(row);
      continue;
    }

    for (let i = 0; i < nameParts.length; i++) {
      out.push({
        ...row,
        venue_name: nameParts[i]!,
        venue_address: addrParts[i]!,
        notes: row.notes ? `${row.notes} (split from multi-venue row)` : "split from multi-venue row",
      });
    }
  }

  return out;
}

function normalizeName(value: string | null | undefined) {
  return normalizeIdentityText(value).toLowerCase();
}

function normalizeCity(value: string | null | undefined) {
  return normalizeIdentityText(value).toLowerCase();
}

function normalizeState(value: string | null | undefined) {
  const raw = normalizeIdentityText(value).toUpperCase();
  if (!raw) return "";
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return raw.slice(0, 2);
}

function normalizeAddress(value: string | null | undefined) {
  return normalizeIdentityStreet(value).toLowerCase();
}

function parseAddressBlob(rawAddress: string) {
  const raw = rawAddress
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*(usa|united states)\.?$/i, "")
    .trim();
  if (!raw) return null;

  const commaPattern = /^(.*?),\s*([^,]+),\s*([A-Za-z]{2}|[A-Za-z .]+)\s*,?\s*(\d{5}(?:-\d{4})?)$/;
  const commaMatch = raw.match(commaPattern);
  if (commaMatch) {
    const street = commaMatch[1]?.trim() ?? "";
    const city = commaMatch[2]?.trim() ?? "";
    const state = commaMatch[3]?.trim() ?? "";
    const zip = (commaMatch[4] ?? "").trim();
    if (street && city && state && zip) return { street, city, state, zip };
  }

  return null;
}

function venueCandidateAddress(v: VenueRow) {
  return v.address1 || v.address || v.normalized_address || null;
}

function pickExistingVenue(params: { row: CsvRow; candidates: VenueRow[] }) {
  const targetName = normalizeName(params.row.venue_name);
  const targetCity = normalizeCity(params.row.venue_city);
  const targetState = normalizeState(params.row.venue_state);
  const targetAddr = normalizeAddress(params.row.venue_address);

  const scored = params.candidates
    .filter((v) => normalizeState(v.state) === targetState && normalizeCity(v.city) === targetCity)
    .map((v) => {
      const name = normalizeName(v.name);
      const addr = normalizeAddress(venueCandidateAddress(v));
      const score =
        (name === targetName ? 10 : 0) +
        (targetAddr && addr && addr === targetAddr ? 100 : 0) +
        (!targetAddr && addr ? 1 : 0);
      return { v, name, addr, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.v ?? null;
  if (!best) return null;

  const bestName = normalizeName(best.name);
  const bestAddr = normalizeAddress(venueCandidateAddress(best));
  if (bestName !== targetName && !(targetAddr && bestAddr && targetAddr === bestAddr)) return null;
  return best;
}

function defaultReportPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const downloadsDir = path.join(os.homedir(), "Downloads");
  return path.join(downloadsDir, `venue_enrichment_ingest_${stamp}.csv`);
}

function escapeCsvCell(value: string) {
  if (value.includes("\"") || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/\"/g, "\"\"")}"`;
  }
  return value;
}

function writeReportCsv(reportPath: string, rows: ResultRow[]) {
  const header = ["tournament_uuid", "venue_name", "venue_id", "action", "message"];
  const lines = [header.join(",")];
  for (const row of rows) {
    const cols = [
      row.tournament_uuid,
      row.venue_name,
      row.venue_id ?? "",
      row.action,
      row.message ?? "",
    ].map((c) => escapeCsvCell(String(c ?? "")));
    lines.push(cols.join(","));
  }
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
}

async function main() {
  const csvPath = clean(argValue("csv")) ?? clean(process.argv[2]);
  if (!csvPath) {
    throw new Error("Usage: npx tsx scripts/ingest/ingest_venue_enrichment_csv.ts --csv=/path/to/file.csv [--apply] [--out=/path/report.csv]");
  }

  const apply = hasFlag("apply");
  const dryRun = !apply;
  const reportPath = clean(argValue("out")) ?? defaultReportPath();

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const content = fs.readFileSync(csvPath, "utf8");
  const rowsRaw = parseCsv(content);
  const expanded = maybeExpandMultiVenueRows(rowsRaw);
  const rows = expanded
    .map((r) => ({
      ...r,
      tournament_uuid: String(r.tournament_uuid ?? "").trim(),
      venue_name: String(r.venue_name ?? "").trim(),
    }))
    .filter((r) => r.tournament_uuid && r.venue_name);

  if (rows.length === 0) throw new Error("No data rows found in CSV.");

  const uniqueTournamentIds = Array.from(new Set(rows.map((r) => r.tournament_uuid)));
  const { data: tournamentsData, error: tournamentsError } = await supabase
    .from("tournaments" as any)
    .select("id,sport")
    .in("id", uniqueTournamentIds)
    .limit(5000);
  if (tournamentsError) throw tournamentsError;

  const tournamentById = new Map<string, TournamentRow>();
  for (const row of (tournamentsData ?? []) as Array<{ id: string; sport?: string | null }>) {
    if (!row?.id) continue;
    tournamentById.set(String(row.id), { id: String(row.id), sport: (row as any)?.sport ?? null });
  }

  const linkRowsTournamentIds = Array.from(new Set(rows.map((r) => r.tournament_uuid).filter((id) => tournamentById.has(id))));
  const { data: linkRows, error: linkError } = await supabase
    .from("tournament_venues" as any)
    .select("tournament_id,venue_id")
    .in("tournament_id", linkRowsTournamentIds)
    .limit(200000);
  if (linkError) throw linkError;

  const existingLinks = new Set<string>();
  for (const row of (linkRows ?? []) as Array<{ tournament_id: string | null; venue_id: string | null }>) {
    if (!row?.tournament_id || !row?.venue_id) continue;
    existingLinks.add(`${row.tournament_id}|${row.venue_id}`);
  }

  const cityKeys = Array.from(
    new Set(
      rows
        .map((r) => `${normalizeState(r.venue_state)}|${normalizeCity(r.venue_city)}`)
        .filter((k) => !k.startsWith("|") && !k.endsWith("|"))
    )
  );

  const venuesByCityKey = new Map<string, VenueRow[]>();
  for (const key of cityKeys) {
    const [state, city] = key.split("|");
    const resp = await supabase
      .from("venues" as any)
      .select("id,name,address,address1,normalized_address,city,state,zip,sport")
      .eq("state", state)
      .ilike("city", city)
      .limit(5000);
    if (resp.error) throw resp.error;
    venuesByCityKey.set(key, (resp.data ?? []) as VenueRow[]);
  }

  const venueInfoByNormalizedKey = new Map<string, { id: string; created: boolean }>();
  const nowIso = new Date().toISOString();

  let venuesCreated = 0;
  let venuesMatched = 0;
  let linksCreated = 0;
  let linksAlreadyPresent = 0;
  let skipped = 0;
  let errors = 0;

  const resultRows: ResultRow[] = [];

  for (const row of rows) {
    const tournamentId = row.tournament_uuid;
    if (!tournamentById.has(tournamentId)) {
      skipped += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        action: "skipped",
        message: "tournament_not_found",
      });
      continue;
    }

    const explicitVenueId = String(row.venue_id ?? "").trim();
    if (explicitVenueId) {
      const linkKey = `${tournamentId}|${explicitVenueId}`;
      if (existingLinks.has(linkKey)) {
        linksAlreadyPresent += 1;
        resultRows.push({
          tournament_uuid: tournamentId,
          venue_name: row.venue_name,
          venue_id: explicitVenueId,
          action: "already_linked",
          message: "already_linked_by_venue_id",
        });
        continue;
      }

      if (dryRun) {
        linksCreated += 1;
        resultRows.push({
          tournament_uuid: tournamentId,
          venue_name: row.venue_name,
          venue_id: explicitVenueId,
          action: "linked_existing_venue",
          message: "would_link_by_venue_id",
        });
        continue;
      }

      const { data: venueExists, error: venueExistsErr } = await supabase
        .from("venues" as any)
        .select("id")
        .eq("id", explicitVenueId)
        .maybeSingle();
      const venueExistsId = (venueExists as any)?.id ? String((venueExists as any).id) : null;
      if (venueExistsErr || !venueExistsId) {
        errors += 1;
        resultRows.push({
          tournament_uuid: tournamentId,
          venue_name: row.venue_name,
          venue_id: explicitVenueId,
          action: "error",
          message: "venue_id_not_found",
        });
        continue;
      }

      const upsertResp = await supabase
        .from("tournament_venues" as any)
        .upsert({ tournament_id: tournamentId, venue_id: explicitVenueId }, { onConflict: "tournament_id,venue_id" });
      if (upsertResp.error) {
        errors += 1;
        resultRows.push({
          tournament_uuid: tournamentId,
          venue_name: row.venue_name,
          venue_id: explicitVenueId,
          action: "error",
          message: "link_upsert_failed",
        });
        continue;
      }

      existingLinks.add(linkKey);
      linksCreated += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        venue_id: explicitVenueId,
        action: "linked_existing_venue",
        message: "linked_by_venue_id",
      });
      continue;
    }

    let venueCity = row.venue_city;
    let venueState = row.venue_state;
    let venueZip = row.venue_zip;
    let venueAddress = row.venue_address;
    if ((!venueCity || !venueState) && venueAddress) {
      const parsed = parseAddressBlob(venueAddress);
      if (parsed) {
        venueAddress = parsed.street;
        venueCity = parsed.city;
        venueState = parsed.state;
        venueZip = parsed.zip;
      }
    }

    const state = normalizeState(venueState);
    const city = normalizeCity(venueCity);
    if (!state || !city) {
      skipped += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        action: "skipped",
        message: "missing_city_or_state",
      });
      continue;
    }

    const venueKey = [normalizeName(row.venue_name), normalizeAddress(venueAddress), city, state].join("|");
    const cachedVenue = venueInfoByNormalizedKey.get(venueKey) ?? null;

    let venueId = cachedVenue?.id ?? null;
    let createdThisRow = cachedVenue?.created ?? false;
    let matchedThisRow = cachedVenue ? !cachedVenue.created : false;

    if (!venueId) {
      const candidates = venuesByCityKey.get(`${state}|${city}`) ?? [];
      const existing = pickExistingVenue({
        row: {
          ...row,
          venue_address: venueAddress,
          venue_city: venueCity,
          venue_state: venueState,
          venue_zip: venueZip,
        },
        candidates,
      });

      if (existing?.id) {
        venueId = existing.id;
        venuesMatched += 1;
        matchedThisRow = true;
        createdThisRow = false;
      } else if (!dryRun) {
        const tournament = tournamentById.get(tournamentId)!;
        const insertPayload: any = {
          name: row.venue_name,
          address: venueAddress ?? null,
          address1: venueAddress ?? null,
          city: venueCity ?? null,
          state: state || null,
          zip: venueZip ?? null,
          sport: tournament.sport ?? null,
          updated_at: nowIso,
        };

        const insertResp = await supabase.from("venues" as any).insert(insertPayload).select("id").single();
        if (insertResp.error) {
          if ((insertResp.error as any)?.code === "23505") {
            const retryResp = await supabase
              .from("venues" as any)
              .select("id,name,address,address1,normalized_address,city,state,zip,sport")
              .eq("state", state)
              .ilike("city", venueCity ?? city)
              .limit(5000);
            if (retryResp.error) {
              errors += 1;
              resultRows.push({
                tournament_uuid: tournamentId,
                venue_name: row.venue_name,
                action: "error",
                message: "venue_insert_conflict_and_retry_failed",
              });
              continue;
            }
            const retryExisting = pickExistingVenue({
              row: {
                ...row,
                venue_address: venueAddress,
                venue_city: venueCity,
                venue_state: venueState,
                venue_zip: venueZip,
              },
              candidates: (retryResp.data ?? []) as VenueRow[],
            });
            if (!retryExisting?.id) {
              errors += 1;
              resultRows.push({
                tournament_uuid: tournamentId,
                venue_name: row.venue_name,
                action: "error",
                message: "venue_insert_conflict_but_no_match_found",
              });
              continue;
            }
            venueId = retryExisting.id;
            venuesMatched += 1;
            matchedThisRow = true;
          } else {
            errors += 1;
            resultRows.push({
              tournament_uuid: tournamentId,
              venue_name: row.venue_name,
              action: "error",
              message: "venue_insert_failed",
            });
            continue;
          }
        } else {
          venueId = (insertResp.data as any)?.id ?? null;
          if (!venueId) {
            errors += 1;
            resultRows.push({
              tournament_uuid: tournamentId,
              venue_name: row.venue_name,
              action: "error",
              message: "venue_insert_missing_id",
            });
            continue;
          }
          venuesCreated += 1;
          createdThisRow = true;
          matchedThisRow = false;
        }
      }

      if (venueId) {
        venueInfoByNormalizedKey.set(venueKey, { id: venueId, created: createdThisRow ? true : false });
      }
    }

    if (!venueId) {
      if (dryRun) {
        venuesCreated += 1;
        resultRows.push({
          tournament_uuid: tournamentId,
          venue_name: row.venue_name,
          action: "created_venue",
          venue_id: null,
          message: "would_create_and_link",
        });
        continue;
      }
      errors += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        action: "error",
        message: "venue_unresolved",
      });
      continue;
    }

    const linkKey = `${tournamentId}|${venueId}`;
    if (existingLinks.has(linkKey)) {
      linksAlreadyPresent += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        venue_id: venueId,
        action: "already_linked",
      });
      continue;
    }

    if (dryRun) {
      linksCreated += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        venue_id: venueId,
        action: matchedThisRow ? "linked_existing_venue" : "created_venue",
        message: "would_link",
      });
      continue;
    }

    const upsertResp = await supabase
      .from("tournament_venues" as any)
      .upsert({ tournament_id: tournamentId, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
    if (upsertResp.error) {
      errors += 1;
      resultRows.push({
        tournament_uuid: tournamentId,
        venue_name: row.venue_name,
        venue_id: venueId,
        action: "error",
        message: "link_upsert_failed",
      });
      continue;
    }

    existingLinks.add(linkKey);
    linksCreated += 1;
    resultRows.push({
      tournament_uuid: tournamentId,
      venue_name: row.venue_name,
      venue_id: venueId,
      action: createdThisRow ? "created_venue" : "linked_existing_venue",
    });
  }

  writeReportCsv(reportPath, resultRows);

  console.log(
    JSON.stringify(
      {
        tool: "venue_enrichment_csv_ingest_script",
        dryRun,
        csv: csvPath,
        rows_in_file: rowsRaw.length,
        rows_after_expansion: expanded.length,
        rows_processed: resultRows.length,
        venues_created: venuesCreated,
        venues_matched: venuesMatched,
        links_created: linksCreated,
        links_already_present: linksAlreadyPresent,
        skipped,
        errors,
        report: reportPath,
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
