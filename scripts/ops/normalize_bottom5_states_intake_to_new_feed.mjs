import fs from "node:fs";
import path from "node:path";

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

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function parseFullAddress(addr) {
  const normalized = String(addr ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const m = normalized.match(
    /^(.+?),\s*([A-Za-z.\s]{2,60}),\s*([A-Z]{2})(?:\s*,?\s*(\d{5}(?:-\d{4})?))?(?:\s*,?\s*([A-Z]{2}))?\s*$/
  );
  if (!m) return null;

  const street = String(m[1] ?? "").trim();
  const city = String(m[2] ?? "").trim();
  const state = String(m[3] ?? "").trim().toUpperCase();
  const zip = m[4] ? String(m[4]).trim() : "";
  const trailingState = m[5] ? String(m[5]).trim().toUpperCase() : "";
  if (trailingState && trailingState !== state) return null;
  if (!street || !city || !state) return null;
  return { street, city, state, zip };
}

async function main() {
  const inputPath = argValue("input");
  const outPath = argValue("out") || path.resolve(process.cwd(), "tmp", "bottom5_states_tournament_intake_normalized.csv");

  if (!inputPath) {
    throw new Error("Missing required arg: --input=<path-to-bottom5-states-intake.csv>");
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^\uFEFF/, "").trimEnd())
    .filter((l) => l.trim().length > 0);

  if (!lines.length) throw new Error(`empty_input:${inputPath}`);

  const header = parseCsvLine(lines[0]);
  const headers = header.map(normalizeHeader);
  const idx = (name) => headers.indexOf(normalizeHeader(name));
  const get = (fields, name) => (idx(name) >= 0 ? clean(fields[idx(name)]) : "");

  const required = ["State", "Tournament Name", "Sport", "City", "Start Date", "Venue Name"];
  for (const col of required) {
    if (idx(col) < 0) throw new Error(`missing_required_header:${col}`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
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
    "venue_name",
    "venue_normalized_name",
    "venue_address",
    "venue_city",
    "venue_state",
  ];
  fs.writeFileSync(outPath, `${outHeaders.join(",")}\n`, "utf8");

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);

    const state = get(fields, "State").toUpperCase();
    const tournamentName = get(fields, "Tournament Name");
    const sport = get(fields, "Sport").toLowerCase();
    const city = get(fields, "City");
    const startDate = get(fields, "Start Date");
    const endDate = get(fields, "End Date");
    const officialWebsite = get(fields, "Official Website");
    const directorEmail = get(fields, "Director Email").toLowerCase();
    const venueName = get(fields, "Venue Name");
    const venueAddressRaw = get(fields, "Venue Address");

    const parsed = parseFullAddress(venueAddressRaw);
    const venueAddress = parsed?.street ? parsed.street : venueAddressRaw;
    const venueCity = parsed?.city || city;
    const venueState = parsed?.state || state;

    const row = [
      "", // tournament_external_id (leave blank to avoid overwriting source_event_id on updates)
      tournamentName,
      sport,
      state,
      city,
      startDate,
      endDate,
      officialWebsite,
      directorEmail,
      venueName,
      "", // venue_normalized_name
      venueAddress,
      venueCity,
      venueState,
    ];

    fs.appendFileSync(outPath, `${row.map(csv).join(",")}\n`, "utf8");
  }

  console.log(`[normalize_bottom5] in=${inputPath}`);
  console.log(`[normalize_bottom5] out=${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

