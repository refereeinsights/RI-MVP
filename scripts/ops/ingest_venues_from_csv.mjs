import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseDotenv(contents) {
  const out = {};
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
    if (!process.env[k] && typeof v === "string") process.env[k] = v;
  }
}

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function clean(value) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(
    d.getSeconds()
  )}`;
}

function csv(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stripMarkdownLinks(line) {
  // [label](url) -> label
  return String(line ?? "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}

function parseCsvLine(line) {
  const out = [];
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

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

function parseAddressFromSingleField(raw) {
  const normalized = clean(raw);
  if (!normalized) return null;
  // "3501 High Resort Blvd, Rio Rancho, NM 87124"
  const m = normalized.match(
    // Be permissive about trailing junk (some sources repeat "City, ST ZIP" twice).
    /^(.+?),\s*([^,]+),\s*([A-Z]{2})(?:\s*,?\s*(\d{5}(?:-\d{4})?))?(?:,.*)?$/i
  );
  if (!m) return null;
  const street = clean(m[1]);
  const city = clean(m[2]);
  const state = clean(m[3])?.toUpperCase() ?? null;
  const zip = m[4] ? clean(m[4]) : null;
  if (!street || !city || !state) return null;
  return { street, city, state, zip };
}

async function findExistingVenue(supabase, venue) {
  const name = clean(venue.name);
  const address = clean(venue.address);
  const city = clean(venue.city);
  const state = clean(venue.state)?.toUpperCase() ?? null;

  if (address && city && state && name) {
    const resp = await supabase
      .from("venues")
      .select("id,name,address,city,state,zip,venue_url,notes")
      .eq("state", state)
      .eq("city", city)
      .eq("address", address)
      .ilike("name", name)
      .limit(5);
    if (resp.error) throw resp.error;
    const rows = (resp.data ?? []).filter((r) => r?.id);
    if (rows.length === 1) return { venueId: String(rows[0].id), note: "match_exact", row: rows[0] };
    if (rows.length > 1) return { venueId: null, note: "ambiguous_exact", row: null };
  }

  if (address && city && state) {
    const resp = await supabase
      .from("venues")
      .select("id,name,address,city,state,zip,venue_url,notes")
      .eq("state", state)
      .eq("city", city)
      .eq("address", address)
      .limit(5);
    if (resp.error) throw resp.error;
    const rows = (resp.data ?? []).filter((r) => r?.id);
    if (rows.length === 1) return { venueId: String(rows[0].id), note: "match_address_city_state", row: rows[0] };
    if (rows.length > 1) return { venueId: null, note: "ambiguous_address_city_state", row: null };
  }

  if (name && city && state) {
    const resp = await supabase
      .from("venues")
      .select("id,name,address,city,state,zip,venue_url,notes")
      .eq("state", state)
      .eq("city", city)
      .ilike("name", name)
      .limit(5);
    if (resp.error) throw resp.error;
    const rows = (resp.data ?? []).filter((r) => r?.id);
    if (rows.length === 1) return { venueId: String(rows[0].id), note: "match_name_city_state", row: rows[0] };
    if (rows.length > 1) return { venueId: null, note: "ambiguous_name_city_state", row: null };
  }

  return { venueId: null, note: "no_match", row: null };
}

async function main() {
  loadEnvLocal();
  const APPLY = process.argv.includes("--apply");
  const inputPath = clean(argValue("input"));
  const outPath = clean(argValue("out")) || path.resolve(process.cwd(), "tmp", `ingest_venues_${stamp()}.csv`);

  if (!inputPath) throw new Error("Missing required arg: --input=<path-to-csv>");

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const rawCsv = fs.readFileSync(inputPath, "utf8");
  const lines = rawCsv
    .split(/\r?\n/)
    .map((l) => stripMarkdownLinks(l).trim())
    .filter((l) => l.length > 0);
  if (!lines.length) throw new Error(`empty_input:${inputPath}`);

  const headerCells = parseCsvLine(lines[0]);
  const headers = headerCells.map(normalizeHeader);
  const idx = (name) => headers.indexOf(name);

  const nameIdx =
    idx("venue_name") >= 0 ? idx("venue_name") : idx("description") >= 0 ? idx("description") : idx("name");
  const addressIdx =
    idx("venue_address") >= 0
      ? idx("venue_address")
      : idx("facility_address") >= 0
      ? idx("facility_address")
      : idx("address") >= 0
      ? idx("address")
      : idx("street");
  const cityIdx = idx("city");
  const stateIdx = idx("state");
  const zipIdx = idx("zip");
  const urlIdx =
    idx("venue_url") >= 0 ? idx("venue_url") : idx("view_map") >= 0 ? idx("view_map") : idx("url");
  const sportIdx = idx("sport");
  const notesIdx = idx("notes");

  if (nameIdx < 0) throw new Error(`missing_required_column: venue_name (got: ${headers.join(",")})`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const cols = ["row", "venue_id", "venue_name", "address", "city", "state", "zip", "venue_url", "note"];
  fs.writeFileSync(outPath, `${cols.join(",")}\n`, "utf8");

  let created = 0;
  let matched = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i;
    const fields = parseCsvLine(lines[i]);

    const venue_name = clean(fields[nameIdx]);
    const rawAddress = addressIdx >= 0 ? clean(fields[addressIdx]) : null;
    const cityRaw = cityIdx >= 0 ? clean(fields[cityIdx]) : null;
    const stateRaw = stateIdx >= 0 ? clean(fields[stateIdx])?.toUpperCase() ?? null : null;
    const zipRaw = zipIdx >= 0 ? clean(fields[zipIdx]) : null;
    const venue_url = urlIdx >= 0 ? clean(fields[urlIdx]) : null;
    const sport = sportIdx >= 0 ? clean(fields[sportIdx]) : null;
    const notes = notesIdx >= 0 ? clean(fields[notesIdx]) : null;

    if (!venue_name) {
      skipped += 1;
      fs.appendFileSync(outPath, `${[rowNum, "", "", rawAddress ?? "", cityRaw ?? "", stateRaw ?? "", zipRaw ?? "", venue_url ?? "", "missing_name"].map(csv).join(",")}\n`);
      continue;
    }

    let address = rawAddress;
    let city = cityRaw;
    let state = stateRaw;
    let zip = zipRaw;
    if (rawAddress && (!city || !state)) {
      const parsed = parseAddressFromSingleField(rawAddress);
      if (parsed) {
        address = parsed.street;
        city = parsed.city;
        state = parsed.state;
        zip = zip ?? parsed.zip;
      }
    }

    const venue = { name: venue_name, address, city, state, zip, venue_url, sport, notes };
    const existing = await findExistingVenue(supabase, venue);
    if (existing.venueId) {
      matched += 1;
      if (APPLY && existing.row) {
        const patch = {};
        const row = existing.row;
        const rowName = clean(row.name);
        const rowAddress = clean(row.address);
        const rowCity = clean(row.city);
        const rowState = clean(row.state)?.toUpperCase() ?? null;
        const rowZip = clean(row.zip);
        const rowUrl = clean(row.venue_url);
        const rowNotes = clean(row.notes);

        if (!rowName && venue_name) patch.name = venue_name;
        if (!rowAddress && clean(address)) patch.address = clean(address);
        if (!rowCity && clean(city)) patch.city = clean(city);
        if (!rowState && clean(state)) patch.state = clean(state)?.toUpperCase();
        if (!rowZip && clean(zip)) patch.zip = clean(zip);
        if (!rowUrl && clean(venue_url)) patch.venue_url = clean(venue_url);
        if (!rowNotes && clean(notes)) patch.notes = clean(notes);

        if (Object.keys(patch).length) {
          patch.updated_at = new Date().toISOString();
          const upd = await supabase.from("venues").update(patch).eq("id", existing.venueId);
          if (upd.error) throw upd.error;
          updated += 1;
        }
      }
      fs.appendFileSync(outPath, `${[rowNum, existing.venueId, venue_name, address ?? "", city ?? "", state ?? "", zip ?? "", venue_url ?? "", existing.note].map(csv).join(",")}\n`);
      continue;
    }
    if (existing.note.startsWith("ambiguous")) {
      skipped += 1;
      fs.appendFileSync(outPath, `${[rowNum, "", venue_name, address ?? "", city ?? "", state ?? "", zip ?? "", venue_url ?? "", existing.note].map(csv).join(",")}\n`);
      continue;
    }

    if (!APPLY) {
      fs.appendFileSync(outPath, `${[rowNum, "", venue_name, address ?? "", city ?? "", state ?? "", zip ?? "", venue_url ?? "", "dry_run_no_match"].map(csv).join(",")}\n`);
      continue;
    }

    if (!clean(address) || !clean(city) || !clean(state)) {
      skipped += 1;
      fs.appendFileSync(outPath, `${[rowNum, "", venue_name, address ?? "", city ?? "", state ?? "", zip ?? "", venue_url ?? "", "missing_address_city_state"].map(csv).join(",")}\n`);
      continue;
    }

    const payload = {
      name: venue_name,
      address: clean(address),
      city: clean(city),
      state: clean(state)?.toUpperCase(),
      zip: clean(zip),
      venue_url,
      sport,
      notes,
      updated_at: new Date().toISOString(),
    };
    const ins = await supabase.from("venues").insert(payload).select("id").single();
    if (ins.error) throw ins.error;
    created += 1;
    fs.appendFileSync(outPath, `${[rowNum, String(ins.data.id), venue_name, payload.address ?? "", payload.city ?? "", payload.state ?? "", payload.zip ?? "", venue_url ?? "", "created"].map(csv).join(",")}\n`);
  }

  console.log(`[ingest_venues_csv] report=${outPath}`);
  console.log(`[ingest_venues_csv] apply=${APPLY} created=${created} matched=${matched} updated=${updated} skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
