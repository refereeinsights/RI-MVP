import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type InputRow = {
  tournament_uuid: string; // actually slug or uuid; we support both
  tournament_name?: string;
  venue_name: string;
  venue_address: string;
  city: string;
  state: string;
  zip?: string;
  confidence?: string;
};

type VenueRow = {
  id: string;
  name: string | null;
  address1: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

const HELP = process.argv.includes("--help") || process.argv.includes("-h");
const APPLY = process.argv.includes("--apply");
const FILE_ARG = process.argv.find((arg) => arg.startsWith("--file="));
const FILE_PATH = FILE_ARG ? String(FILE_ARG.split("=")[1] ?? "").trim() : "";

function loadEnvLocalIfMissing() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2] || "";
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function printHelp() {
  console.log(
    [
      "Ingest tournament venue links from a CSV (create/match venues, then link to tournaments).",
      "",
      "Idempotent behavior:",
      "- Does not create duplicate tournament_venues links (upsert on tournament_id,venue_id).",
      "- Attempts to match existing venues by name+address+city+state(+zip) before creating.",
      "",
      "Usage:",
      "  TMPDIR=./tmp node --import tsx scripts/ops/ingest_tournament_venues_from_csv.ts --file=./tmp/venues.csv",
      "  TMPDIR=./tmp node --import tsx scripts/ops/ingest_tournament_venues_from_csv.ts --file=./tmp/venues.csv --apply",
      "",
      "Env required:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
      "",
      "CSV columns required:",
      "  tournament_uuid,tournament_name,venue_name,venue_address,city,state,zip,confidence",
    ].join("\n")
  );
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function csvParse(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (!lines.length) return [];

  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = line[i + 1];
          if (next === '"') {
            cur += '"';
            i += 1;
            continue;
          }
          inQuotes = false;
          continue;
        }
        cur += ch;
        continue;
      }
      if (ch === ",") {
        out.push(cur);
        cur = "";
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  };

  const header = parseLine(lines[0]).map((h) => clean(h));
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseLine(line);
    if (!cols.some((c) => clean(c))) continue;
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      const key = header[i] || `col_${i}`;
      row[key] = cols[i] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function buildVenueFullAddress(args: { street: string; city: string; state: string; zip?: string }) {
  const street = clean(args.street);
  const city = clean(args.city);
  const state = clean(args.state).toUpperCase();
  const zip = clean(args.zip ?? "");
  const tail = [city, state].filter(Boolean).join(", ");
  const tailWithZip = zip ? `${tail} ${zip}` : tail;
  return [street, tailWithZip].filter(Boolean).join(", ");
}

function venueKey(row: InputRow) {
  return [
    clean(row.venue_name).toLowerCase(),
    clean(row.venue_address).toLowerCase(),
    clean(row.city).toLowerCase(),
    clean(row.state).toUpperCase(),
    clean(row.zip ?? ""),
  ].join("|");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function supabaseAdmin(): SupabaseClient {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function findTournamentIdBySlugOrId(supabase: SupabaseClient, slugOrId: string) {
  const key = clean(slugOrId);
  if (!key) return null;
  if (isUuid(key)) {
    const { data } = await supabase.from("tournaments").select("id").eq("id", key).maybeSingle();
    return data?.id ?? null;
  }
  const { data } = await supabase.from("tournaments").select("id").eq("slug", key).maybeSingle();
  return data?.id ?? null;
}

async function matchExistingVenue(
  supabase: SupabaseClient,
  row: InputRow
): Promise<VenueRow | null> {
  const venueName = clean(row.venue_name);
  const street = clean(row.venue_address);
  const city = clean(row.city);
  const state = clean(row.state).toUpperCase();
  const zip = clean(row.zip ?? "");

  if (!venueName || !street || !city || !state) return null;

  // Prefer a tight match first.
  let query = supabase
    .from("venues")
    .select("id,name,address1,address,city,state,zip")
    .eq("city", city)
    .eq("state", state)
    .ilike("name", venueName)
    .or(`address1.ilike.${street},address.ilike.${street}`)
    .limit(10);

  if (zip) query = query.eq("zip", zip);

  const { data } = await query;
  const candidates = (data ?? []) as VenueRow[];
  if (!candidates.length) return null;

  // If multiple venues match, try to choose the one with the closest address string.
  const normalizeAddr = (v: VenueRow) =>
    clean(v.address1 ?? v.address ?? "").toLowerCase();
  const targetAddr = street.toLowerCase();
  const exact = candidates.find((v) => normalizeAddr(v) === targetAddr);
  return exact ?? candidates[0] ?? null;
}

async function createVenue(supabase: SupabaseClient, row: InputRow): Promise<string> {
  const name = clean(row.venue_name);
  const street = clean(row.venue_address);
  const city = clean(row.city);
  const state = clean(row.state).toUpperCase();
  const zip = clean(row.zip ?? "");

  const payload: any = {
    name: name || null,
    address1: street || null,
    address: buildVenueFullAddress({ street, city, state, zip: zip || undefined }) || null,
    city: city || null,
    state: state || null,
    zip: zip || null,
  };

  const { data, error } = await supabase.from("venues").insert(payload).select("id").single();
  if (error || !data?.id) throw error ?? new Error("venue_insert_failed");
  return String(data.id);
}

async function upsertTournamentVenueLink(supabase: SupabaseClient, tournamentId: string, venueId: string) {
  const { error } = await supabase
    .from("tournament_venues")
    .upsert({ tournament_id: tournamentId, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
  if (error) throw error;
}

async function main() {
  if (HELP || !FILE_PATH) {
    printHelp();
    process.exit(HELP ? 0 : 1);
  }

  loadEnvLocalIfMissing();
  const supabase = supabaseAdmin();

  const csvText = fs.readFileSync(FILE_PATH, "utf8");
  const parsed = csvParse(csvText);
  const rows: InputRow[] = parsed.map((r) => ({
    tournament_uuid: clean(r.tournament_uuid),
    tournament_name: clean(r.tournament_name),
    venue_name: clean(r.venue_name),
    venue_address: clean(r.venue_address),
    city: clean(r.city),
    state: clean(r.state),
    zip: clean(r.zip),
    confidence: clean(r.confidence),
  }));

  const usable = rows.filter((r) => r.tournament_uuid && r.venue_name && r.venue_address && r.city && r.state);
  if (!usable.length) {
    console.log("No usable rows found (need tournament_uuid, venue_name, venue_address, city, state).");
    return;
  }

  const createdVenueIdsByKey = new Map<string, string>();
  let linksUpserted = 0;
  let venuesCreated = 0;
  let venuesMatched = 0;
  let missingTournaments = 0;
  let failures = 0;

  for (const row of usable) {
    const tournamentId = await findTournamentIdBySlugOrId(supabase, row.tournament_uuid);
    if (!tournamentId) {
      missingTournaments += 1;
      console.log(`[skip] tournament not found: ${row.tournament_uuid} (${row.tournament_name || "unknown"})`);
      continue;
    }

    const key = venueKey(row);
    let venueId = createdVenueIdsByKey.get(key) ?? null;

    try {
      if (!venueId) {
        const existing = await matchExistingVenue(supabase, row);
        if (existing?.id) {
          venueId = existing.id;
          venuesMatched += 1;
        } else if (APPLY) {
          venueId = await createVenue(supabase, row);
          venuesCreated += 1;
        } else {
          console.log(
            `[dry-run] would create venue: ${row.venue_name} — ${buildVenueFullAddress({
              street: row.venue_address,
              city: row.city,
              state: row.state,
              zip: row.zip,
            })}`
          );
          // still attempt linking if it already exists; but we don't have an id without creating/matching.
          continue;
        }
        if (venueId) createdVenueIdsByKey.set(key, venueId);
      }

      if (!venueId) continue;

      if (APPLY) {
        await upsertTournamentVenueLink(supabase, tournamentId, venueId);
        linksUpserted += 1;
      } else {
        console.log(`[dry-run] would link tournament=${row.tournament_uuid} -> venue=${row.venue_name}`);
      }
    } catch (err: any) {
      failures += 1;
      console.log(`[error] ${row.tournament_uuid} / ${row.venue_name}: ${err?.message ?? String(err)}`);
    }
  }

  console.log(
    [
      "Done.",
      `apply=${APPLY}`,
      `venues_matched=${venuesMatched}`,
      `venues_created=${venuesCreated}`,
      `links_upserted=${linksUpserted}`,
      `missing_tournaments=${missingTournaments}`,
      `failures=${failures}`,
    ].join(" ")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

