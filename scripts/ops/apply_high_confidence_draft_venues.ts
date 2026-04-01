import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type DraftRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  venue: string | null;
  address: string | null;
  venue_url: string | null;
  official_website_url: string | null;
  source_url: string | null;
  updated_at?: string | null;
};

type VenueCandidateRow = {
  id: string;
  tournament_id: string;
  venue_name: string | null;
  address_text: string | null;
  venue_url: string | null;
  source_url: string | null;
  evidence_text?: string | null;
  confidence: number | null;
  accepted_at: string | null;
  rejected_at: string | null;
};

const HELP = process.argv.includes("--help") || process.argv.includes("-h");
const APPLY = process.argv.includes("--apply");

const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 200;
const OFFSET_ARG = process.argv.find((arg) => arg.startsWith("--offset="));
const OFFSET = OFFSET_ARG ? Number(OFFSET_ARG.split("=")[1]) : 0;

const MIN_CONF_ARG = process.argv.find((arg) => arg.startsWith("--min_conf="));
const MIN_CONF = MIN_CONF_ARG ? Number(MIN_CONF_ARG.split("=")[1]) : 0.92;
const CANDIDATE_MIN_CONF_ARG = process.argv.find((arg) => arg.startsWith("--candidate_min_conf="));
const CANDIDATE_MIN_CONF = CANDIDATE_MIN_CONF_ARG ? Number(CANDIDATE_MIN_CONF_ARG.split("=")[1]) : 0.8;

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
      "Auto-apply ultra-high-confidence venue/address fields into RI draft tournament uploads.",
      "",
      "Usage:",
      "  TMPDIR=./tmp node --import tsx scripts/ops/apply_high_confidence_draft_venues.ts [--limit=200] [--offset=0] [--min_conf=0.92]",
      "  TMPDIR=./tmp node --import tsx scripts/ops/apply_high_confidence_draft_venues.ts --apply [--limit=200] [--offset=0] [--min_conf=0.92]",
      "",
      "Env required:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
      "",
      "Notes:",
      "- Only updates tournaments with status=draft and blank venue/address.",
      "- Requires candidate state to match tournament state and address to look like a street address.",
      "- Writes a CSV report to /tmp.",
      "- Optional: broaden the fetch with --candidate_min_conf=0.8 (default) while still applying only when effective confidence >= --min_conf.",
    ].join("\n")
  );
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

function normalizeLower(value: unknown) {
  return clean(value).toLowerCase();
}

function isBlank(value: unknown) {
  return !clean(value);
}

function isHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function buildOutPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("/tmp", `ri_draft_upload_apply_high_conf_venues_${stamp}.csv`);
}

function toCsvRow(values: Record<string, string>) {
  const cols = Object.keys(values);
  const esc = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return cols.map((c) => esc(values[c] ?? "")).join(",");
}

function parseFullAddress(addr: string): { address1: string; city: string; state: string; zip: string } | null {
  // Common variants we see from scrapers:
  // - "2228 N Center St, Mesa, AZ 85201"
  // - "7745 East Brown Rd, Mesa AZ 85207" (missing comma before state)
  const m = addr.match(/^(.+?),\s*([A-Za-z.\s]{2,60}),?\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
  if (!m) return null;
  const address1 = clean(m[1] ?? "");
  const city = clean(m[2] ?? "");
  const state = clean(m[3] ?? "").toUpperCase();
  const zip = clean(m[4] ?? "");
  if (!address1 || !city || !state || !zip) return null;
  return { address1, city, state, zip };
}

function looksLikeStreetAddress(addr: string) {
  const v = clean(addr);
  if (!v) return false;
  if (!/^\d{1,5}\s/.test(v)) return false;
  if (/\bP\.?\s*O\.?\s*Box\b/i.test(v)) return false;
  const suffix =
    /\b(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pkwy|Parkway|Pl|Place|Cir|Circle|Ter|Terrace|Highway|Hwy)\b\.?/i;
  return suffix.test(v);
}

function isPlaceholderVenueName(name: unknown) {
  const v = clean(name).toLowerCase();
  if (!v) return false;
  const compact = v.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!compact) return false;
  if (compact === "tbd" || compact === "tba") return true;
  if (compact === "to be determined" || compact === "to be announced") return true;
  if (compact.includes("venue tbd") || compact.includes("venues tbd")) return true;
  if (compact.includes("multiple locations") || compact.includes("multiple venues")) return true;
  if (compact.includes("location tbd") || compact.includes("locations tbd")) return true;
  return false;
}

function sameHost(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.hostname.replace(/^www\./, "").toLowerCase() === ub.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return false;
  }
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function effectiveConfidence(args: { base: number; evidence: string | null; seedUrl: string | null; sourceUrl: string | null }) {
  const evidence = normalizeLower(args.evidence ?? "");
  let boost = 0;
  if (evidence.includes("json-ld")) boost += 0.12;
  else if (evidence.includes("fields-link")) boost += 0.1;
  else if (evidence.includes("page-text-address")) boost += 0.06;
  else if (evidence.includes("map-link")) boost += 0.04;
  else if (evidence.includes("venue-page")) boost += 0.04;

  let hostBonus = 0;
  if (args.seedUrl && args.sourceUrl && isHttpUrl(args.seedUrl) && isHttpUrl(args.sourceUrl) && sameHost(args.seedUrl, args.sourceUrl)) {
    hostBonus += 0.03;
  }
  if (args.seedUrl && args.sourceUrl && clean(args.seedUrl) === clean(args.sourceUrl)) hostBonus += 0.03;

  return clamp01(args.base + boost + hostBonus);
}

async function main() {
  if (HELP) {
    printHelp();
    return;
  }

  loadEnvLocalIfMissing();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  if (!Number.isFinite(LIMIT) || LIMIT <= 0) throw new Error("--limit must be positive");
  if (!Number.isFinite(OFFSET) || OFFSET < 0) throw new Error("--offset must be >= 0");
  if (!Number.isFinite(MIN_CONF) || MIN_CONF <= 0 || MIN_CONF > 1) throw new Error("--min_conf must be (0,1]");
  if (!Number.isFinite(CANDIDATE_MIN_CONF) || CANDIDATE_MIN_CONF <= 0 || CANDIDATE_MIN_CONF > 1) {
    throw new Error("--candidate_min_conf must be (0,1]");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const allDrafts: DraftRow[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 50000; from += pageSize) {
    const to = from + pageSize - 1;
    const { data: draftsRaw, error: draftsErr } = await supabase
      .from("tournaments" as any)
      .select("id,name,city,state,venue,address,venue_url,official_website_url,source_url,updated_at")
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (draftsErr) throw new Error(draftsErr.message);
    const chunk = (draftsRaw ?? []) as DraftRow[];
    allDrafts.push(...chunk);
    if (chunk.length < pageSize) break;
    if (allDrafts.length >= OFFSET + LIMIT + 2000) break;
  }

  const targets = allDrafts
    // Treat placeholder venue values (TBD/TBA/etc) as missing so we can overwrite them safely.
    .filter((d) => isBlank(d.address) && (isBlank(d.venue) || isPlaceholderVenueName(d.venue)))
    .slice(OFFSET, OFFSET + LIMIT);
  const targetIds = targets.map((t) => t.id);

  const candidateRows: VenueCandidateRow[] = [];
  for (let i = 0; i < targetIds.length; i += 50) {
    const chunk = targetIds.slice(i, i + 50);
    const { data, error } = await supabase
      .from("tournament_venue_candidates" as any)
      .select("id,tournament_id,venue_name,address_text,venue_url,source_url,evidence_text,confidence,accepted_at,rejected_at")
      .in("tournament_id", chunk)
      .is("accepted_at", null)
      .is("rejected_at", null)
      .gte("confidence", CANDIDATE_MIN_CONF)
      .order("confidence", { ascending: false })
      .limit(20000);
    if (error) throw new Error(error.message);
    candidateRows.push(...((data ?? []) as VenueCandidateRow[]));
  }

  const byTournament = new Map<string, VenueCandidateRow[]>();
  for (const row of candidateRows) {
    const tid = String(row.tournament_id ?? "");
    if (!tid) continue;
    const arr = byTournament.get(tid) ?? [];
    arr.push(row);
    byTournament.set(tid, arr);
  }

  const outPath = buildOutPath();
  const report: Array<Record<string, string>> = [];

  let scanned = 0;
  let considered = 0;
  let applied = 0;
  let skippedNoCandidates = 0;
  let skippedGuardrails = 0;

  const denylist = new Set<string>(["1529 third st. s., jacksonville beach, fl 32250"]);

  for (const draft of targets) {
    scanned += 1;
    const state = clean(draft.state).toUpperCase();
    if (!state || state.length !== 2) {
      report.push({
        tournament_id: draft.id,
        name: clean(draft.name) || draft.id,
        status: "skip_no_state",
        reason: "tournament.state missing",
        applied: "0",
      });
      skippedGuardrails += 1;
      continue;
    }

    const candidates = (byTournament.get(draft.id) ?? []).slice(0, 10);
    if (!candidates.length) {
      skippedNoCandidates += 1;
      report.push({
        tournament_id: draft.id,
        name: clean(draft.name) || draft.id,
        status: "skip_no_candidates",
        reason: "",
        applied: "0",
      });
      continue;
    }
    considered += 1;

    const seed = clean(draft.official_website_url) || clean(draft.source_url);
    const best = candidates.find((c) => {
      const addr = clean(c.address_text);
      if (!addr) return false;
      if (denylist.has(normalizeLower(addr))) return false;
      if (!looksLikeStreetAddress(addr)) return false;
      const parsed = parseFullAddress(addr);
      if (!parsed) return false;
      if (parsed.state !== state) return false;
      const source = clean(c.source_url);
      if (seed && source && isHttpUrl(seed) && isHttpUrl(source) && !sameHost(seed, source)) return false;
      const venueName = clean(c.venue_name);
      if (venueName && isPlaceholderVenueName(venueName)) return false;
      const base = Number(c.confidence ?? 0);
      const eff = effectiveConfidence({
        base,
        evidence: (c as any).evidence_text ?? null,
        seedUrl: seed || null,
        sourceUrl: source || null,
      });
      if (eff < MIN_CONF) return false;
      return true;
    });

    if (!best) {
      skippedGuardrails += 1;
      report.push({
        tournament_id: draft.id,
        name: clean(draft.name) || draft.id,
        status: "skip_guardrails",
        reason: "no candidate passed guardrails",
        applied: "0",
      });
      continue;
    }

    const patch: Record<string, unknown> = {};
    const venueName = clean(best.venue_name);
    const addr = clean(best.address_text);
    const venueUrl = clean(best.venue_url);

    if ((isBlank(draft.venue) || isPlaceholderVenueName(draft.venue)) && venueName && !isPlaceholderVenueName(venueName)) {
      patch.venue = venueName;
    }
    if (isBlank(draft.address) && addr) patch.address = addr;
    if (isBlank(draft.venue_url) && venueUrl && isHttpUrl(venueUrl)) patch.venue_url = venueUrl;

    if (!Object.keys(patch).length) {
      report.push({
        tournament_id: draft.id,
        name: clean(draft.name) || draft.id,
        status: "skip_no_patch",
        reason: "",
        applied: "0",
      });
      continue;
    }

    if (APPLY) {
      const upd = await supabase.from("tournaments" as any).update(patch).eq("id", draft.id);
      if (upd.error) throw new Error(upd.error.message);
    }
    applied += 1;

    report.push({
      tournament_id: draft.id,
      name: clean(draft.name) || draft.id,
      status: APPLY ? "applied" : "dry_run_applied",
      reason: `candidate_conf=${String(best.confidence ?? "")}`,
      applied: "1",
    });
  }

  const cols = ["tournament_id", "name", "status", "reason", "applied"];
  fs.writeFileSync(outPath, `${cols.join(",")}\n${report.map((r) => toCsvRow(r)).join("\n")}\n`, "utf8");

  console.log(
    [
      "",
      "Done.",
      `- apply: ${APPLY ? "yes" : "no"}`,
      `- min_conf: ${MIN_CONF}`,
      `- candidate_min_conf: ${CANDIDATE_MIN_CONF}`,
      `- scanned: ${scanned}`,
      `- considered: ${considered}`,
      `- applied: ${applied}`,
      `- skipped_no_candidates: ${skippedNoCandidates}`,
      `- skipped_guardrails: ${skippedGuardrails}`,
      `- csv: ${outPath}`,
    ].join("\n")
  );

  if (!APPLY) console.log("Run again with --apply to write updates.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
