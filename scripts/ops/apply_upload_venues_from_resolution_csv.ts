import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildVenueAddressFingerprint, buildVenueNameCityStateFingerprint } from "../../apps/referee/lib/identity/fingerprints";

type InputRow = {
  tournament_id: string;
  tournament_name?: string | null;
  venue_resolution_status?: string | null;
  venue_name: string;
  venue_address: string;
  venue_city: string;
  venue_state: string;
  venue_confidence?: string | null;
  evidence_notes?: string | null;
  needs_human_review?: string | null;
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

function splitList(value: string) {
  return value
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);
}

function confidenceToNumber(value: string | null | undefined) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "high") return 0.9;
  if (v === "medium") return 0.75;
  if (v === "low") return 0.6;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isUnknownPlaceholder(value: string | null | undefined) {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "unknown" || v === "tbd" || v === "n/a" || v === "na";
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function main() {
  loadEnvLocalIfMissing();
  const APPLY = process.argv.includes("--apply");

  const inputPath = clean(argValue("input"));
  const outPath = clean(argValue("out")) || path.resolve(process.cwd(), "tmp", `apply_upload_venues_resolution_${stamp()}.csv`);
  if (!inputPath) throw new Error("Usage: --input=<path-to-csv> [--apply] [--out=<path>]");

  const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const rawCsv = fs.readFileSync(inputPath, "utf8");
  const lines = rawCsv
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (!lines.length) throw new Error(`empty_input:${inputPath}`);

  const headerCells = parseCsvLine(lines[0]);
  const headers = headerCells.map(normalizeHeader);
  const idx = (name: string) => headers.indexOf(name);

  const tournamentIdx = idx("tournament_id");
  const nameIdx = idx("tournament_name");
  const statusIdx = idx("venue_resolution_status");
  const venueNameIdx = idx("venue_name");
  const venueAddrIdx = idx("venue_address");
  const venueCityIdx = idx("venue_city");
  const venueStateIdx = idx("venue_state");
  const venueConfidenceIdx = idx("venue_confidence");
  const evidenceIdx = idx("evidence_notes");
  const needsReviewIdx = idx("needs_human_review");

  if (tournamentIdx < 0) throw new Error(`missing_required_column: tournament_id (got: ${headers.join(",")})`);
  if (venueNameIdx < 0) throw new Error(`missing_required_column: venue_name (got: ${headers.join(",")})`);
  if (venueAddrIdx < 0) throw new Error(`missing_required_column: venue_address (got: ${headers.join(",")})`);
  if (venueCityIdx < 0) throw new Error(`missing_required_column: venue_city (got: ${headers.join(",")})`);
  if (venueStateIdx < 0) throw new Error(`missing_required_column: venue_state (got: ${headers.join(",")})`);

  const expanded: InputRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const tournament_id = clean(cells[tournamentIdx]);
    if (!tournament_id) continue;
    const venueNamesRaw = clean(cells[venueNameIdx]) ?? "";
    const venueAddrsRaw = clean(cells[venueAddrIdx]) ?? "";
    const venueCitiesRaw = clean(cells[venueCityIdx]) ?? "";
    const venueStateRaw = clean(cells[venueStateIdx]) ?? "";
    if (!venueNamesRaw || !venueAddrsRaw || !venueCitiesRaw || !venueStateRaw) continue;

    const venueNames = splitList(venueNamesRaw);
    const venueAddrs = splitList(venueAddrsRaw);
    const venueCities = splitList(venueCitiesRaw);
    const venueStates = splitList(venueStateRaw);
    const max = Math.max(venueNames.length, venueAddrs.length, venueCities.length, venueStates.length);
    for (let j = 0; j < max; j++) {
      const venue_name = venueNames[j] ?? venueNames[0] ?? "";
      const venue_address = venueAddrs[j] ?? venueAddrs[0] ?? "";
      const venue_city = venueCities[j] ?? venueCities[0] ?? "";
      const venue_state = venueStates[j] ?? venueStates[0] ?? "";
      if (!venue_name || !venue_address || !venue_city || !venue_state) continue;
      expanded.push({
        tournament_id,
        tournament_name: nameIdx >= 0 ? clean(cells[nameIdx]) : null,
        venue_resolution_status: statusIdx >= 0 ? clean(cells[statusIdx]) : null,
        venue_name,
        venue_address,
        venue_city,
        venue_state,
        venue_confidence: venueConfidenceIdx >= 0 ? clean(cells[venueConfidenceIdx]) : null,
        evidence_notes: evidenceIdx >= 0 ? clean(cells[evidenceIdx]) : null,
        needs_human_review: needsReviewIdx >= 0 ? clean(cells[needsReviewIdx]) : null,
      });
    }
  }

  if (!expanded.length) throw new Error("no_valid_rows");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    [
      ["tournament_id", "tournament_status", "tournament_name", "venue_name", "venue_address", "venue_city", "venue_state", "venue_id", "venue_action", "link_action", "error"].join(","),
    ].join("\n"),
    "utf8"
  );

  const report = (entry: Record<string, unknown>) => {
    fs.appendFileSync(
      outPath,
      `\n${[
        entry.tournament_id,
        entry.tournament_status,
        entry.tournament_name,
        entry.venue_name,
        entry.venue_address,
        entry.venue_city,
        entry.venue_state,
        entry.venue_id,
        entry.venue_action,
        entry.link_action,
        entry.error,
      ].map(csvCell).join(",")}`,
      "utf8"
    );
  };

  for (const row of expanded) {
    const tournamentId = row.tournament_id;
    if (!isUuid(tournamentId)) {
      report({ ...row, tournament_status: "", venue_id: "", venue_action: "", link_action: "", error: "invalid_tournament_id" });
      continue;
    }

    const { data: tournament, error: tErr } = await supabase
      .from("tournaments")
      .select("id,name,status")
      .eq("id", tournamentId)
      .maybeSingle();
    if (tErr) {
      report({ ...row, tournament_status: "", venue_id: "", venue_action: "", link_action: "", error: `load_tournament_failed:${tErr.message}` });
      continue;
    }
    if (!tournament?.id) {
      report({ ...row, tournament_status: "", venue_id: "", venue_action: "", link_action: "", error: "tournament_not_found" });
      continue;
    }
    const tournamentStatus = String((tournament as any).status ?? "");

    const status = normalizeStatus(row.venue_resolution_status);
    const isConfirmedStatus = status === "confirmed" || status === "multiple_venues";
    if (!isConfirmedStatus) {
      report({ ...row, tournament_status: tournamentStatus, venue_id: "", venue_action: "", link_action: "", error: `skip_unconfirmed_status:${status || "missing"}` });
      continue;
    }

    if (/address_needs_verification/i.test(row.venue_address)) {
      report({ ...row, tournament_status: tournamentStatus, venue_id: "", venue_action: "", link_action: "", error: "address_needs_verification" });
      continue;
    }

    if (isUnknownPlaceholder(row.venue_name)) {
      report({ ...row, tournament_status: tournamentStatus, venue_id: "", venue_action: "", link_action: "", error: "skip_unknown_placeholder" });
      continue;
    }

    const hasUsableAddress = !isUnknownPlaceholder(row.venue_address);
    const addressFingerprint = hasUsableAddress
      ? buildVenueAddressFingerprint({
          address: row.venue_address,
          city: row.venue_city,
          state: row.venue_state,
        })
      : null;
    const nameFingerprint = buildVenueNameCityStateFingerprint({
      name: row.venue_name,
      city: row.venue_city,
      state: row.venue_state,
    });

    let venueId: string | null = null;
    let venueAction = "";

    if (addressFingerprint) {
      const { data: hits, error } = await supabase
        .from("venues")
        .select("id,name_city_state_fingerprint")
        .eq("address_fingerprint", addressFingerprint)
        .limit(10);
      if (error) {
        report({ ...row, tournament_status: tournamentStatus, venue_id: "", venue_action: "", link_action: "", error: `venue_lookup_failed:${error.message}` });
        continue;
      }
      const rows = (hits ?? []) as any[];
      if (rows.length) {
        const pick =
          nameFingerprint ? rows.find((r) => String(r?.name_city_state_fingerprint ?? "") === nameFingerprint) ?? rows[0] : rows[0];
        venueId = String(pick.id);
        venueAction = "matched";
      }
    }

    if (!venueId && nameFingerprint) {
      const { data: hits, error } = await supabase
        .from("venues")
        .select("id")
        .eq("name_city_state_fingerprint", nameFingerprint)
        .limit(2);
      if (error) {
        report({ ...row, tournament_status: tournamentStatus, venue_id: "", venue_action: "", link_action: "", error: `venue_lookup_failed:${error.message}` });
        continue;
      }
      const pick = (hits ?? [])[0] as any;
      if (pick?.id) {
        venueId = String(pick.id);
        venueAction = "matched_name_city_state";
      }
    }

    if (!venueId) {
      if (!hasUsableAddress) {
        report({ ...row, tournament_status: tournamentStatus, venue_id: "", venue_action: "no_match", link_action: "", error: "missing_address_for_create" });
        continue;
      }
      venueAction = APPLY ? "created" : "would_create";
      if (!APPLY) {
        report({ ...row, tournament_status: tournamentStatus, venue_id: "", venue_action: venueAction, link_action: "", error: "" });
        continue;
      }
      const { data: created, error: createErr } = await supabase
        .from("venues")
        .upsert(
          {
            name: row.venue_name,
            address: row.venue_address,
            city: row.venue_city,
            state: row.venue_state,
            zip: null,
            sport: null,
          },
          { onConflict: "name,address,city,state" }
        )
        .select("id")
        .maybeSingle();
      if (createErr) {
        report({ ...row, tournament_status: tournamentStatus, venue_id: "", venue_action, link_action: "", error: `venue_create_failed:${createErr.message}` });
        continue;
      }
      if (!created?.id) {
        report({ ...row, tournament_status: tournamentStatus, venue_id: "", venue_action, link_action: "", error: "venue_create_failed:no_id" });
        continue;
      }
      venueId = String((created as any).id);
    }

    // Link rules: link when we have a usable address and confidence is at least medium.
    // `needs_human_review` is informational; we still link for "multiple venues" so the upload isn't blocked.
    const conf = confidenceToNumber(row.venue_confidence) ?? 0.75;
    const shouldLink = conf >= 0.75;

    if (!APPLY) {
      report({ ...row, tournament_status: tournamentStatus, venue_id: venueId, venue_action: venueAction, link_action: shouldLink ? "would_link" : "skip_needs_review", error: "" });
      continue;
    }

    if (!shouldLink) {
      report({ ...row, tournament_status: tournamentStatus, venue_id: venueId, venue_action: venueAction, link_action: "skip_low_confidence", error: "" });
      continue;
    }

    const { error: linkErr } = await supabase
      .from("tournament_venues")
      .upsert({ tournament_id: tournamentId, venue_id: venueId, is_inferred: false, is_primary: false }, { onConflict: "tournament_id,venue_id" });
    if (linkErr) {
      report({ ...row, tournament_status: tournamentStatus, venue_id: venueId, venue_action: venueAction, link_action: "", error: `link_failed:${linkErr.message}` });
      continue;
    }

    report({ ...row, tournament_status: tournamentStatus, venue_id: venueId, venue_action: venueAction, link_action: "linked", error: "" });
  }

  // eslint-disable-next-line no-console
  console.log(`Wrote report to ${outPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
