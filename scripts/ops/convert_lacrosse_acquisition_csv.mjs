import fs from "node:fs";
import path from "node:path";

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function clean(value) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

function csv(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

function parseUsDateToIso(value) {
  const v = clean(value);
  if (!v) return "";
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return v; // if already ISO or some other format, pass through
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  let yy = Number(m[3]);
  if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yy)) return v;
  if (yy < 100) yy += 2000;
  const pad = (n) => String(n).padStart(2, "0");
  return `${yy}-${pad(mm)}-${pad(dd)}`;
}

function looksLikeTbdVenue(text) {
  const v = clean(text).toLowerCase();
  if (!v) return true;
  if (v.includes("venue tbd")) return true;
  if (v.includes("tbd")) return true;
  return false;
}

function parseVenueGuess(venueRaw) {
  const raw = clean(venueRaw);
  if (!raw) return { venue_name: "", venue_city: "", venue_state: "" };
  if (looksLikeTbdVenue(raw)) return { venue_name: "", venue_city: "", venue_state: "" };
  // If it looks like multiple venues/notes combined, skip to avoid creating junk venues.
  if (raw.includes("/") || raw.includes(" / ") || raw.toLowerCase().includes(" hs ") || raw.toLowerCase().includes("(hs)")) {
    return { venue_name: "", venue_city: "", venue_state: "" };
  }

  // Common pattern: "Some Complex, City ST"
  const comma = raw.split(",").map((s) => clean(s)).filter(Boolean);
  if (comma.length >= 2) {
    const last = comma[comma.length - 1];
    const m = last.match(/^(.+?)\s+([A-Z]{2})$/);
    if (m?.[1] && m?.[2]) {
      return {
        venue_name: comma.slice(0, -1).join(", "),
        venue_city: clean(m[1]),
        venue_state: clean(m[2]).toUpperCase(),
      };
    }
  }

  // Pattern: "... – venue TBD" already removed above; try "City ST" at end.
  const tail = raw.match(/^(.*?)(?:\s+[-–—]\s+.*)?$/);
  const candidate = clean(tail?.[1] ?? raw);
  const m2 = candidate.match(/^(.+?)\s+([A-Za-z][A-Za-z .'-]+?)\s+([A-Z]{2})$/);
  if (m2?.[1] && m2?.[2] && m2?.[3]) {
    return { venue_name: clean(m2[1]), venue_city: clean(m2[2]), venue_state: clean(m2[3]).toUpperCase() };
  }

  // Fallback: use as name only (no city/state)
  return { venue_name: raw, venue_city: "", venue_state: "" };
}

function main() {
  const inputPath = clean(argValue("input"));
  const outPath =
    clean(argValue("out")) || path.resolve(process.cwd(), "tmp", `lacrosse_acquisition_ingest_normalized.csv`);
  if (!inputPath) throw new Error("Missing required arg: --input=/path/to/lacrosse_acquisition_ingest.csv");

  const raw = fs.readFileSync(inputPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^\uFEFF/, ""))
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error(`empty_input:${inputPath}`);

  const headersRaw = parseCsvLine(lines[0]).map((h) => normalizeHeader(h));
  const idx = (name) => headersRaw.indexOf(normalizeHeader(name));
  const need = ["name", "sport", "state", "start_date", "official_website_url"];
  for (const col of need) {
    if (idx(col) < 0) throw new Error(`missing_required_header:${col}`);
  }

  // Output in the "new feed" format supported by scripts/ops/ingest_tournaments_and_venues_from_csv.mjs
  const outHeaders = [
    "tournament_external_id",
    "tournament_name",
    "sport",
    "state",
    "tournament_city",
    "start_date",
    "end_date",
    "tournament_url",
    "director_email",
    "director_name",
    "venue_name",
    "venue_address",
    "venue_city",
    "venue_state",
    "venue_zip",
    "confidence",
    "notes",
    "venue_normalized_name",
  ];
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, outHeaders.join(",") + "\n", "utf8");

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const get = (name) => (idx(name) >= 0 ? clean(fields[idx(name)]) : "");

    const tournamentName = get("name");
    const sport = get("sport");
    const city = get("city");
    const state = clean(get("state")).toUpperCase();
    const startDate = parseUsDateToIso(get("start_date"));
    const endDate = parseUsDateToIso(get("end_date"));
    const url = get("official_website_url");
    const directorName = get("tournament_director");
    const directorEmail = get("tournament_director_email");
    const notes = get("notes");
    const venueRaw = get("venue_name");
    const venue = parseVenueGuess(venueRaw);

    const externalId = url || `${tournamentName}|${state}|${startDate}`;

    const rowOut = [
      externalId,
      tournamentName,
      sport,
      state,
      city,
      startDate,
      endDate,
      url,
      directorEmail,
      directorName,
      venue.venue_name,
      "", // venue_address
      venue.venue_city,
      venue.venue_state || state,
      "", // venue_zip
      "", // confidence
      notes,
      "", // venue_normalized_name
    ];
    fs.appendFileSync(outPath, rowOut.map(csv).join(",") + "\n");
  }

  console.log(`[convert_lacrosse_acquisition_csv] out=${outPath}`);
}

main();
