import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildVenueAddressFingerprint, buildVenueNameCityStateFingerprint } from "../../apps/referee/lib/identity/fingerprints";

type AcceptedVenueCandidate = {
  tournament_id: string;
  venue_name: string | null;
  address_text: string | null;
  venue_url: string | null;
  accepted_at: string | null;
};

type TournamentRow = {
  id: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport: string | null;
};

const HELP = process.argv.includes("--help") || process.argv.includes("-h");
const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 500;

function printHelp() {
  console.log(
    [
      "Backfill tournament_venues links from previously accepted tournament_venue_candidates.",
      "- Useful if earlier approvals updated tournaments.venue/address but didn’t create venue rows/links due to schema issues.",
      "",
      "Usage:",
      "  TMPDIR=./tmp node --import tsx scripts/ops/backfill_tournament_venues_from_accepted_candidates.ts [--limit=500]",
      "  TMPDIR=./tmp node --import tsx scripts/ops/backfill_tournament_venues_from_accepted_candidates.ts --apply [--limit=500]",
      "",
      "Env required:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
    ].join("\n")
  );
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

function isBlank(value: unknown) {
  return !clean(value);
}

function normalizeLower(value: unknown) {
  return clean(value).toLowerCase();
}

function parseFullAddress(addr: string): { address: string; city: string; state: string; zip: string | null } | null {
  const raw = clean(addr);
  if (!raw) return null;
  const m = raw.match(/^(.+?),\s*([A-Za-z.\s]{2,60}),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?\s*$/);
  if (!m) return null;
  return {
    address: clean(m[1]),
    city: clean(m[2]),
    state: clean(m[3]).toUpperCase(),
    zip: m[4] ? clean(m[4]) : null,
  };
}

function buildOutPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("/tmp", `ri_backfill_tournament_venues_from_accepted_${stamp}.csv`);
}

function toCsvRow(values: Record<string, string>) {
  const cols = Object.keys(values);
  const esc = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return cols.map((c) => esc(values[c] ?? "")).join(",");
}

async function main() {
  if (HELP) {
    printHelp();
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  if (!Number.isFinite(LIMIT) || LIMIT <= 0) throw new Error("--limit must be positive");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Load accepted candidates (most recent first).
  const { data: candidatesRaw, error: candErr } = await supabase
    .from("tournament_venue_candidates" as any)
    .select("tournament_id,venue_name,address_text,venue_url,accepted_at")
    .not("accepted_at", "is", null)
    .order("accepted_at", { ascending: false })
    .limit(5000);
  if (candErr) throw new Error(candErr.message);

  const candidates = (candidatesRaw ?? []) as AcceptedVenueCandidate[];
  const tournamentIds = Array.from(new Set(candidates.map((c) => String(c.tournament_id ?? "")).filter(Boolean))).slice(0, LIMIT);
  if (!tournamentIds.length) {
    console.log("No accepted candidates found.");
    return;
  }

  // Compute which tournaments are missing links.
  const linked = new Set<string>();
  for (let i = 0; i < tournamentIds.length; i += 100) {
    const chunk = tournamentIds.slice(i, i + 100);
    const { data, error } = await supabase.from("tournament_venues" as any).select("tournament_id").in("tournament_id", chunk).limit(20000);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ tournament_id: string | null }>) {
      const tid = String(row.tournament_id ?? "");
      if (tid) linked.add(tid);
    }
  }

  const missing = tournamentIds.filter((id) => !linked.has(id));
  const outPath = buildOutPath();
  const report: Array<Record<string, string>> = [];

  let scanned = 0;
  let fixed = 0;

  for (const tid of missing) {
    scanned += 1;
    const { data: tRaw, error: tErr } = await supabase
      .from("tournaments" as any)
      .select("id,city,state,zip,sport")
      .eq("id", tid)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    const t = tRaw as TournamentRow | null;
    if (!t?.id) continue;

    const best = candidates.find((c) => String(c.tournament_id) === tid) ?? null;
    if (!best) continue;

    const addressText = clean(best.address_text);
    const parsed = addressText ? parseFullAddress(addressText) : null;
    const city = clean(parsed?.city ?? t.city);
    const state = clean(parsed?.state ?? t.state).toUpperCase();
    const zip = clean(parsed?.zip ?? t.zip);

    const venueName = clean(best.venue_name) || null;
    const address_fingerprint = buildVenueAddressFingerprint({ address: parsed?.address ?? addressText, city, state });
    const name_city_state_fingerprint = buildVenueNameCityStateFingerprint({ name: venueName, city, state });

    let venueId: string | null = null;
    if (address_fingerprint) {
      const { data, error } = await supabase.from("venues" as any).select("id,name_city_state_fingerprint").eq("address_fingerprint", address_fingerprint).limit(10);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as any[];
      if (rows.length) {
        const exact = name_city_state_fingerprint
          ? rows.find((r) => String(r.name_city_state_fingerprint ?? "") === name_city_state_fingerprint)
          : null;
        venueId = String((exact ?? rows[0])?.id ?? "") || null;
      }
    }

    if (!venueId && name_city_state_fingerprint) {
      const { data, error } = await supabase.from("venues" as any).select("id").eq("name_city_state_fingerprint", name_city_state_fingerprint).limit(3);
      if (error) throw new Error(error.message);
      venueId = data?.[0]?.id ? String(data[0].id) : null;
    }

    if (!venueId) {
      const payload = {
        name: venueName,
        address: addressText || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        sport: clean(t.sport) || null,
        venue_url: clean(best.venue_url) || null,
      };
      const { data: inserted, error } = await supabase
        .from("venues" as any)
        .upsert(payload, { onConflict: "name,address,city,state" })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      venueId = inserted?.id ? String(inserted.id) : null;
    }

    if (!venueId) {
      report.push({
        tournament_id: tid,
        status: "skip_no_venue_id",
        venue_id: "",
        venue_name: venueName ?? "",
        address: addressText,
      });
      continue;
    }

    if (APPLY) {
      const { error } = await supabase.from("tournament_venues" as any).upsert({ tournament_id: tid, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
      if (error) throw new Error(error.message);
    }
    fixed += 1;
    report.push({
      tournament_id: tid,
      status: APPLY ? "linked" : "dry_run_linked",
      venue_id: venueId,
      venue_name: venueName ?? "",
      address: addressText,
    });
  }

  const cols = ["tournament_id", "status", "venue_id", "venue_name", "address"];
  fs.writeFileSync(outPath, `${cols.join(",")}\n${report.map((r) => toCsvRow(r)).join("\n")}\n`, "utf8");

  console.log(
    [
      "",
      "Done.",
      `- apply: ${APPLY ? "yes" : "no"}`,
      `- scanned_missing_links: ${scanned}`,
      `- fixed: ${fixed}`,
      `- csv: ${outPath}`,
    ].join("\n")
  );

  if (!APPLY) console.log("Run again with --apply to write updates.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

