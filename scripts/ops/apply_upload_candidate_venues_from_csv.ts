import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildVenueAddressFingerprint, buildVenueNameCityStateFingerprint } from "../../apps/referee/lib/identity/fingerprints";

type InputRow = {
  tournament_uuid: string;
  tournament_name?: string | null;
  venue: string;
  address: string;
};

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

function loadEnvLocalIfMissing() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
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

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

function parseCsvLine(line: string) {
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
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPlaceholderVenueName(name: string | null | undefined) {
  const v = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return v === "tbd" || v === "tba" || v === "venue tbd" || v === "venues tbd" || v === "to be determined" || v === "to be announced";
}

function parseFullAddress(addr: string): { street: string; city: string; state: string; zip: string | null } | null {
  const normalized = String(addr ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const m = normalized.match(
    /^(.+?),\s*([A-Za-z.\s]{2,60}),\s*([A-Z]{2})(?:\s*,?\s*(\d{5}(?:-\d{4})?))?(?:\s*,?\s*([A-Z]{2}))?\s*$/
  );
  if (!m) return null;
  const street = String(m[1] ?? "").trim();
  const city = String(m[2] ?? "").trim();
  const state = String(m[3] ?? "").trim().toUpperCase();
  const zip = m[4] ? String(m[4]).trim() : null;
  const trailingState = m[5] ? String(m[5]).trim().toUpperCase() : null;
  if (trailingState && trailingState !== state) return null;
  if (!street || !city || !state) return null;
  return { street, city, state, zip };
}

function stamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  loadEnvLocalIfMissing();

  const APPLY = process.argv.includes("--apply");
  const updateTournamentFields = !process.argv.includes("--no_update_tournament_fields");
  const inputPath = clean(argValue("input"));
  const outPath =
    clean(argValue("out")) || path.resolve(process.cwd(), "tmp", `apply_upload_candidate_venues_${stamp()}.csv`);

  if (!inputPath) {
    throw new Error("Usage: --input=<path-to-csv> [--apply] [--out=<path>] [--no_update_tournament_fields]");
  }

  const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const rawCsv = fs.readFileSync(inputPath, "utf8");
  const lines = rawCsv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (!lines.length) throw new Error(`empty_input:${inputPath}`);

  const headerCells = parseCsvLine(lines[0]);
  const headers = headerCells.map(normalizeHeader);
  const idx = (name: string) => headers.indexOf(name);

  const tournamentIdx =
    idx("tournament_uuid") >= 0 ? idx("tournament_uuid") : idx("tournament_id") >= 0 ? idx("tournament_id") : -1;
  const nameIdx = idx("tournament_name");
  const venueIdx = idx("venue");
  const addressIdx = idx("address");

  if (tournamentIdx < 0) throw new Error(`missing_required_column: tournament_uuid (got: ${headers.join(",")})`);
  if (venueIdx < 0) throw new Error(`missing_required_column: venue (got: ${headers.join(",")})`);
  if (addressIdx < 0) throw new Error(`missing_required_column: address (got: ${headers.join(",")})`);

  const rows: InputRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const tournament_uuid = clean(cells[tournamentIdx]);
    const venue = clean(cells[venueIdx]);
    const address = clean(cells[addressIdx]);
    if (!tournament_uuid || !venue || !address) continue;
    rows.push({
      tournament_uuid,
      tournament_name: nameIdx >= 0 ? clean(cells[nameIdx]) : null,
      venue,
      address,
    });
  }

  if (!rows.length) throw new Error("no_valid_rows");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    [
      [
        "tournament_uuid",
        "tournament_status",
        "tournament_name",
        "input_venue",
        "input_address",
        "venue_action",
        "venue_id",
        "venue_match",
        "link_action",
        "tournament_patch",
        "error",
      ].join(","),
    ].join("\n"),
    "utf8"
  );

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const tournamentId = row.tournament_uuid;
    const inputVenue = row.venue;
    const inputAddress = row.address;

    const writeReport = (entry: Record<string, unknown>) => {
      const cells = [
        entry.tournament_uuid,
        entry.tournament_status,
        entry.tournament_name,
        entry.input_venue,
        entry.input_address,
        entry.venue_action,
        entry.venue_id,
        entry.venue_match,
        entry.link_action,
        entry.tournament_patch,
        entry.error,
      ].map(csvCell);
      fs.appendFileSync(outPath, `\n${cells.join(",")}`, "utf8");
    };

    if (!isUuid(tournamentId)) {
      failed += 1;
      writeReport({
        tournament_uuid: tournamentId,
        tournament_status: "",
        tournament_name: row.tournament_name ?? "",
        input_venue: inputVenue,
        input_address: inputAddress,
        venue_action: "",
        venue_id: "",
        venue_match: "",
        link_action: "",
        tournament_patch: "",
        error: "invalid_tournament_uuid",
      });
      continue;
    }

    const parsed = parseFullAddress(inputAddress);
    if (!parsed) {
      failed += 1;
      writeReport({
        tournament_uuid: tournamentId,
        tournament_status: "",
        tournament_name: row.tournament_name ?? "",
        input_venue: inputVenue,
        input_address: inputAddress,
        error: "address_parse_failed",
      });
      continue;
    }

    const tResp = await supabase
      .from("tournaments" as any)
      .select("id,name,status,venue,address,city,state,zip,sport")
      .eq("id", tournamentId)
      .maybeSingle();
    if (tResp.error) {
      failed += 1;
      writeReport({
        tournament_uuid: tournamentId,
        tournament_status: "",
        tournament_name: row.tournament_name ?? "",
        input_venue: inputVenue,
        input_address: inputAddress,
        error: `tournament_lookup_failed:${tResp.error.message}`,
      });
      continue;
    }

    const tournament = (tResp.data ?? null) as any;
    if (!tournament?.id) {
      failed += 1;
      writeReport({
        tournament_uuid: tournamentId,
        tournament_status: "",
        tournament_name: row.tournament_name ?? "",
        input_venue: inputVenue,
        input_address: inputAddress,
        error: "tournament_not_found",
      });
      continue;
    }

    const status = clean(tournament.status) ?? "";
    if (status !== "draft") {
      skipped += 1;
      writeReport({
        tournament_uuid: tournamentId,
        tournament_status: status,
        tournament_name: clean(tournament.name) ?? row.tournament_name ?? "",
        input_venue: inputVenue,
        input_address: inputAddress,
        error: "skip_not_draft",
      });
      continue;
    }

    const address_fingerprint = buildVenueAddressFingerprint({ address: parsed.street, city: parsed.city, state: parsed.state });
    const name_city_state_fingerprint = buildVenueNameCityStateFingerprint({ name: inputVenue, city: parsed.city, state: parsed.state });

    let venue: any | null = null;
    let venueMatch = "";

    if (address_fingerprint) {
      const vHits = await supabase
        .from("venues" as any)
        .select("id,name,address,city,state,zip,venue_url,address_fingerprint,name_city_state_fingerprint")
        .eq("address_fingerprint", address_fingerprint)
        .limit(10);
      if (vHits.error) throw new Error(vHits.error.message);
      const list = (vHits.data ?? []) as any[];
      if (list.length) {
        venue = name_city_state_fingerprint
          ? list.find((r) => String(r.name_city_state_fingerprint ?? "") === name_city_state_fingerprint) ?? list[0]
          : list[0];
        venueMatch = "match_address_fingerprint";
      }
    }

    if (!venue && name_city_state_fingerprint) {
      const vHits = await supabase
        .from("venues" as any)
        .select("id,name,address,city,state,zip,venue_url,address_fingerprint,name_city_state_fingerprint")
        .eq("name_city_state_fingerprint", name_city_state_fingerprint)
        .limit(5);
      if (vHits.error) throw new Error(vHits.error.message);
      venue = ((vHits.data ?? []) as any[])[0] ?? null;
      if (venue) venueMatch = "match_name_city_state_fingerprint";
    }

    if (!venue) {
      const vHits = await supabase
        .from("venues" as any)
        .select("id,name,address,city,state,zip,venue_url")
        .eq("state", parsed.state)
        .eq("city", parsed.city)
        .eq("address", parsed.street)
        .limit(5);
      if (vHits.error) throw new Error(vHits.error.message);
      const list = (vHits.data ?? []) as any[];
      if (list.length === 1) {
        venue = list[0];
        venueMatch = "match_address_city_state";
      }
    }

    let venueAction = "existing";
    if (!venue) {
      venueAction = APPLY ? "created" : "create_dry_run";
      const payload: any = {
        name: inputVenue,
        address: parsed.street,
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
        address_fingerprint,
        name_city_state_fingerprint,
      };
      if (APPLY) {
        const ins = await supabase
          .from("venues" as any)
          .upsert(payload, { onConflict: "name,address,city,state" })
          .select("id,name,address,city,state,zip,venue_url,address_fingerprint,name_city_state_fingerprint")
          .maybeSingle();
        if (ins.error) throw new Error(ins.error.message);
        venue = ins.data ?? null;
        venueMatch = "created";
      }
    }

    if (!venue?.id) {
      failed += 1;
      writeReport({
        tournament_uuid: tournamentId,
        tournament_status: status,
        tournament_name: clean(tournament.name) ?? row.tournament_name ?? "",
        input_venue: inputVenue,
        input_address: inputAddress,
        venue_action: venueAction,
        venue_id: "",
        venue_match: venueMatch,
        link_action: "",
        tournament_patch: "",
        error: "venue_not_resolved",
      });
      continue;
    }

    const linkAction = APPLY ? "linked" : "link_dry_run";
    if (APPLY) {
      const link = await supabase
        .from("tournament_venues" as any)
        .upsert({ tournament_id: tournamentId, venue_id: venue.id }, { onConflict: "tournament_id,venue_id" });
      if (link.error) throw new Error(link.error.message);
    }

    let tournamentPatch: Record<string, unknown> = {};
    if (updateTournamentFields) {
      const existingVenue = clean(tournament.venue);
      const existingAddress = clean(tournament.address);
      const fullAddress = `${parsed.street}, ${parsed.city}, ${parsed.state}${parsed.zip ? ` ${parsed.zip}` : ""}`;
      if (!existingVenue || isPlaceholderVenueName(existingVenue)) tournamentPatch.venue = inputVenue;
      if (!existingAddress || isPlaceholderVenueName(existingAddress)) tournamentPatch.address = fullAddress;
    }
    const patchAction = APPLY && Object.keys(tournamentPatch).length ? "patched" : Object.keys(tournamentPatch).length ? "patch_dry_run" : "none";
    if (APPLY && Object.keys(tournamentPatch).length) {
      const upd = await supabase.from("tournaments" as any).update(tournamentPatch).eq("id", tournamentId);
      if (upd.error) throw new Error(upd.error.message);
    }

    ok += 1;
    writeReport({
      tournament_uuid: tournamentId,
      tournament_status: status,
      tournament_name: clean(tournament.name) ?? row.tournament_name ?? "",
      input_venue: inputVenue,
      input_address: inputAddress,
      venue_action: venueAction,
      venue_id: venue.id,
      venue_match: venueMatch,
      link_action: linkAction,
      tournament_patch: patchAction,
      error: "",
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        applied: APPLY,
        totals: { rows: rows.length, ok, skipped, failed },
        report: outPath,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("ERROR", err?.message || err);
  process.exit(1);
});

