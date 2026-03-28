import fs from "node:fs";
import path from "node:path";

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function clean(value) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function csv(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
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
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

function stripMarkdownLinks(line) {
  // Turns: [text](url) -> text
  return String(line ?? "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}

function normalizeVenueKey(name) {
  const raw = clean(name);
  if (!raw) return null;
  return raw
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractUrlAndConfidence(rawTail, explicitConfidence) {
  const tail = clean(rawTail);
  const allowed = new Set(["low", "medium", "high"]);

  const explicit = clean(explicitConfidence)?.toLowerCase();
  const confidence = explicit && allowed.has(explicit) ? explicit : null;

  if (!tail) return { url: null, confidence };

  // Prefer the first URL-like thing in the tail.
  const urlMatch = tail.match(/https?:\/\/[^\s)\],]+/i);
  const url = urlMatch ? urlMatch[0].replace(/[)\]]+$/g, "") : null;

  if (confidence) return { url, confidence };

  // Extract confidence embedded as ",medium" etc.
  const confMatch = tail.match(/,(low|medium|high)\b/i);
  const conf = confMatch ? confMatch[1].toLowerCase() : null;
  return { url, confidence: conf };
}

function main() {
  const inputPath = clean(argValue("input"));
  const outPath =
    clean(argValue("out")) || path.resolve(process.cwd(), "tmp", "ti_feed_normalized_for_ingest.csv");
  if (!inputPath) throw new Error("Missing --input=<path>");

  const raw = fs.readFileSync(inputPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => String(l ?? "").trim())
    .filter((l) => l.length > 0);
  if (!lines.length) throw new Error(`empty_input:${inputPath}`);

  const headerRaw = parseCsvLine(lines[0]).map((h) => clean(h) ?? "");
  const headers = headerRaw.map((h) => normalizeHeader(h));
  const idx = (name) => headers.indexOf(normalizeHeader(name));

  const required = [
    "id",
    "tournament_name",
    "sport",
    "start_date",
    "end_date",
    "city",
    "state",
    "venue_name",
    "venue_address",
    "venue_city",
    "venue_state",
    "source_url",
    "confidence",
  ];
  for (const col of required) {
    if (idx(col) < 0) throw new Error(`missing_column:${col}`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const outHeader = [
    "tournament_external_id",
    "tournament_name",
    "sport",
    "state",
    "tournament_city",
    "start_date",
    "end_date",
    "tournament_url",
    "director_email",
    "confidence_score",
    "venue_name",
    "venue_normalized_name",
    "venue_address",
    "venue_city",
    "venue_state",
  ];
  fs.writeFileSync(outPath, outHeader.join(",") + "\n", "utf8");

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const line = stripMarkdownLinks(lines[i]);
    const fields = parseCsvLine(line);

    // Take the first 11 columns as fixed (quotes handled for venue_address), then reconstruct the tail.
    const get = (name) => (idx(name) >= 0 && idx(name) < fields.length ? clean(fields[idx(name)]) : null);

    const id = get("id");
    const tournament_name = get("tournament_name");
    const sport = get("sport");
    const start_date = get("start_date");
    const end_date = get("end_date");
    const city = get("city");
    const state = clean(get("state"))?.toUpperCase() ?? null;
    const venue_name = get("venue_name");
    const venue_address = get("venue_address");
    const venue_city = get("venue_city");
    const venue_state = clean(get("venue_state"))?.toUpperCase() ?? null;

    // Rebuild tail starting at source_url column (everything after venue_state).
    const venueStateIdx = idx("venue_state");
    const tail = venueStateIdx >= 0 ? fields.slice(venueStateIdx + 1).join(",") : "";
    const explicitConfidence = get("confidence");
    const { url: sourceUrl, confidence } = extractUrlAndConfidence(tail, explicitConfidence);

    // If the row is too malformed, skip but keep going.
    if (!id || !tournament_name || !sport || !state) {
      console.warn(`[normalize_ti_feed] skip row=${rowNum} missing required fields`);
      continue;
    }

    const outRow = [
      id,
      tournament_name,
      sport,
      state,
      city ?? "",
      start_date ?? "",
      end_date ?? "",
      sourceUrl ?? "",
      "",
      confidence ?? "",
      venue_name ?? "",
      normalizeVenueKey(venue_name) ?? "",
      venue_address ?? "",
      venue_city ?? "",
      venue_state ?? "",
    ].map(csv);

    fs.appendFileSync(outPath, outRow.join(",") + "\n", "utf8");
  }

  console.log(JSON.stringify({ ok: true, inputPath, outPath }, null, 2));
}

main();
