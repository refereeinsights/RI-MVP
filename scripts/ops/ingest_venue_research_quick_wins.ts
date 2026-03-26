import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  buildVenueAddressFingerprint,
  buildVenueNameCityStateFingerprint,
} from "../../apps/referee/lib/identity/fingerprints";

const APPLY = process.argv.includes("--apply");

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}.`);
  return v;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

type CsvRow = {
  tournament_id: string;
  tournament_name: string | null;
  sport: string | null;
  state: string | null;
  venue_name: string;
  venue_address: string;
  confidence: string | null;
  source: string | null;
};

// Minimal CSV parser that handles quotes/double-quotes.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === "\"") {
        const next = line[i + 1];
        if (next === "\"") {
          cur += "\"";
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === "\"") inQuotes = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];

  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => header.indexOf(name);

  const tIdIdx = idx("tournament_id");
  const tNameIdx = idx("tournament_name");
  const sportIdx = idx("sport");
  const stateIdx = idx("state");
  const venueNameIdx = idx("venue_name");
  const venueAddrIdx = idx("venue_address");
  const confIdx = idx("confidence");
  const sourceIdx = idx("source");

  if ([tIdIdx, venueNameIdx, venueAddrIdx].some((v) => v < 0)) {
    throw new Error(`CSV header missing required columns. Found: ${header.join(",")}`);
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    while (cols.length < header.length) cols.push("");

    const tournament_id = clean(cols[tIdIdx]) ?? "";
    const venue_name = clean(cols[venueNameIdx]) ?? "";
    const venue_address = clean(cols[venueAddrIdx]) ?? "";

    if (!tournament_id || !venue_name || !venue_address) continue;

    rows.push({
      tournament_id,
      tournament_name: tNameIdx >= 0 ? clean(cols[tNameIdx]) : null,
      sport: sportIdx >= 0 ? clean(cols[sportIdx]) : null,
      state: stateIdx >= 0 ? clean(cols[stateIdx]) : null,
      venue_name,
      venue_address,
      confidence: confIdx >= 0 ? clean(cols[confIdx]) : null,
      source: sourceIdx >= 0 ? clean(cols[sourceIdx]) : null,
    });
  }

  return rows;
}

function parseFullAddress(addr: string): { street: string | null; city: string; state: string; zip: string | null } | null {
  const normalized = String(addr ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  // Full address: "Street, City, ST 12345"
  const full = normalized.match(/^(.+?),\s*([^,]+?),\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?\s*$/);
  if (full) {
    const street = String(full[1] ?? "").trim();
    const city = String(full[2] ?? "").trim();
    const state = String(full[3] ?? "").trim().toUpperCase();
    const zip = full[4] ? String(full[4]).trim() : null;
    if (!street || !city || !state) return null;
    return { street, city, state, zip };
  }

  // City-only: "City, ST 12345" (no street)
  const cityOnly = normalized.match(/^([^,]+?),\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?\s*$/);
  if (cityOnly) {
    const city = String(cityOnly[1] ?? "").trim();
    const state = String(cityOnly[2] ?? "").trim().toUpperCase();
    const zip = cityOnly[3] ? String(cityOnly[3]).trim() : null;
    if (!city || !state) return null;
    return { street: null, city, state, zip };
  }

  return null;
}

async function main() {
  const filePath = argValue("file") || argValue("path");
  if (!filePath) throw new Error("Usage: node --import tsx scripts/ops/ingest_venue_research_quick_wins.ts --file=... [--apply]");
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const content = fs.readFileSync(filePath, "utf8");
  const rows = parseCsv(content);
  if (!rows.length) {
    console.log("No rows found in CSV.");
    return;
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const summary = {
    rows: rows.length,
    tournamentsMissing: 0,
    venuesCreated: 0,
    venuesMatched: 0,
    linksUpserted: 0,
    skippedBadRows: 0,
    failures: [] as Array<{ tournament_id: string; venue_name: string; message: string }>,
  };

  console.log(`${APPLY ? "[APPLY]" : "[DRY-RUN]"} Ingesting ${rows.length} tournament-venue row(s) from ${filePath}`);

  for (const row of rows) {
    const tournamentId = clean(row.tournament_id);
    if (!tournamentId || !isUuid(tournamentId)) {
      summary.skippedBadRows += 1;
      continue;
    }

    const parsed = parseFullAddress(row.venue_address);
    if (!parsed) {
      summary.failures.push({ tournament_id: tournamentId, venue_name: row.venue_name, message: `Could not parse address: ${row.venue_address}` });
      continue;
    }

    try {
      const { data: tournament, error: tournamentErr } = await supabase
        .from("tournaments" as any)
        .select("id,name,state")
        .eq("id", tournamentId)
        .maybeSingle();
      if (tournamentErr) throw new Error(tournamentErr.message);
      if (!tournament?.id) {
        summary.tournamentsMissing += 1;
        console.log(`[missing tournament] ${tournamentId} (${row.tournament_name ?? "unknown"})`);
        continue;
      }

      const addressFingerprint = parsed.street
        ? buildVenueAddressFingerprint({
            address: parsed.street,
            city: parsed.city,
            state: parsed.state,
          })
        : null;
      const nameCityStateFingerprint = buildVenueNameCityStateFingerprint({
        name: row.venue_name,
        city: parsed.city,
        state: parsed.state,
      });

      let venue: any | null = null;

      if (addressFingerprint) {
        const { data: hits, error } = await supabase
          .from("venues" as any)
          .select("id,name,address,city,state,zip,address_fingerprint,name_city_state_fingerprint")
          .eq("address_fingerprint", addressFingerprint)
          .limit(10);
        if (error) throw new Error(error.message);
        const candidates = (hits ?? []) as any[];
        if (candidates.length) {
          venue =
            (nameCityStateFingerprint
              ? candidates.find((v) => String(v.name_city_state_fingerprint ?? "") === nameCityStateFingerprint)
              : null) ?? candidates[0] ?? null;
        }
      }

      if (!venue && nameCityStateFingerprint) {
        const { data: hits, error } = await supabase
          .from("venues" as any)
          .select("id,name,address,city,state,zip,address_fingerprint,name_city_state_fingerprint")
          .eq("name_city_state_fingerprint", nameCityStateFingerprint)
          .limit(5);
        if (error) throw new Error(error.message);
        venue = (hits ?? [])[0] ?? null;
      }

      const venuePayload = {
        name: row.venue_name,
        address: parsed.street,
        address1: parsed.street,
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
        address_fingerprint: addressFingerprint,
        name_city_state_fingerprint: nameCityStateFingerprint,
      };

      if (!venue) {
        if (!APPLY) {
          console.log(`[dry-run create venue] ${row.venue_name} | ${row.venue_address}`);
          summary.venuesCreated += 1;
          venue = { id: `DRY_RUN_${slugify(row.venue_name)}` };
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("venues" as any)
            .insert(venuePayload)
            .select("id,name,address,city,state,zip")
            .single();
          if (insErr) throw new Error(insErr.message);
          venue = inserted ?? null;
          summary.venuesCreated += 1;
        }
      } else {
        summary.venuesMatched += 1;
      }

      if (!APPLY) {
        console.log(`[dry-run link] tournament=${tournamentId} -> venue=${venue.id}`);
        summary.linksUpserted += 1;
        continue;
      }

      const { error: linkErr } = await supabase
        .from("tournament_venues" as any)
        .upsert({ tournament_id: tournamentId, venue_id: venue.id }, { onConflict: "tournament_id,venue_id" });
      if (linkErr) throw new Error(linkErr.message);
      summary.linksUpserted += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failures.push({ tournament_id: tournamentId, venue_name: row.venue_name, message });
      console.log(`[fail] tournament=${tournamentId} venue=${row.venue_name}: ${message}`);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[ingest-venue-research-quick-wins] fatal", err);
  process.exit(1);
});
