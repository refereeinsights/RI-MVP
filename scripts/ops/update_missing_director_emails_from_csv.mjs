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

function isValidEmail(value) {
  const v = clean(value).toLowerCase();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function main() {
  loadEnvLocal();

  const APPLY = process.argv.includes("--apply");
  const inputPath = clean(argValue("input"));
  const outPath = clean(argValue("out")) || path.resolve(process.cwd(), "tmp", "director_email_updates_report.csv");

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
    .map((l) => l.replace(/^\uFEFF/, "").trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) throw new Error(`empty_input:${inputPath}`);

  const headerRaw = parseCsvLine(lines[0]);
  const headers = headerRaw.map(normalizeHeader);
  const idx = (name) => headers.indexOf(normalizeHeader(name));
  const required = ["uuid", "tournament_director_email"];
  for (const col of required) {
    if (idx(col) < 0) throw new Error(`missing_required_header:${col}`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const reportCols = ["row", "uuid", "tournament_name", "existing_email", "new_email", "confidence", "action", "note"];
  fs.writeFileSync(outPath, `${reportCols.join(",")}\n`, "utf8");

  let updated = 0;
  let skippedHasEmail = 0;
  let skippedInvalidEmail = 0;
  let notFound = 0;

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i;
    const fields = parseCsvLine(lines[i]);
    const get = (name) => (idx(name) >= 0 ? clean(fields[idx(name)]) : "");

    const id = get("uuid");
    const name = get("tournament_name");
    const email = clean(get("tournament_director_email")).toLowerCase();
    const confidence = get("confidence");

    if (!id) continue;
    if (!isValidEmail(email)) {
      skippedInvalidEmail += 1;
      fs.appendFileSync(outPath, [rowNum, id, name, "", email, confidence, "skip", "invalid_email"].map(csv).join(",") + "\n");
      continue;
    }

    const { data: tournament, error: readError } = await supabase
      .from("tournaments")
      .select("id,name,tournament_director_email")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!tournament?.id) {
      notFound += 1;
      fs.appendFileSync(outPath, [rowNum, id, name, "", email, confidence, "skip", "tournament_not_found"].map(csv).join(",") + "\n");
      continue;
    }

    const existing = clean(tournament.tournament_director_email).toLowerCase();
    if (existing) {
      skippedHasEmail += 1;
      fs.appendFileSync(outPath, [rowNum, id, tournament.name ?? name, existing, email, confidence, "skip", "already_has_email"].map(csv).join(",") + "\n");
      continue;
    }

    if (APPLY) {
      const { error: updateError } = await supabase
        .from("tournaments")
        .update({ tournament_director_email: email, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (updateError) throw updateError;
      updated += 1;
      fs.appendFileSync(outPath, [rowNum, id, tournament.name ?? name, existing, email, confidence, "update", ""].map(csv).join(",") + "\n");
    } else {
      fs.appendFileSync(outPath, [rowNum, id, tournament.name ?? name, existing, email, confidence, "dry_run", ""].map(csv).join(",") + "\n");
    }
  }

  console.log(`[director_email_updates] report=${outPath}`);
  console.log(
    `[director_email_updates] apply=${APPLY} updated=${updated} skipped_has_email=${skippedHasEmail} skipped_invalid_email=${skippedInvalidEmail} not_found=${notFound}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

