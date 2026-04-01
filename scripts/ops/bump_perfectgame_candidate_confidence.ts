import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type Candidate = {
  id: string;
  tournament_id: string | null;
  confidence: number | null;
  evidence_text: string | null;
  source_url: string | null;
};

const APPLY = process.argv.includes("--apply");
const HELP = process.argv.includes("--help") || process.argv.includes("-h");

const MIN_CONF_ARG = process.argv.find((a) => a.startsWith("--min_conf="));
const MIN_CONF = MIN_CONF_ARG ? Number(MIN_CONF_ARG.split("=")[1]) : 0.92;
const TARGET_CONF_ARG = process.argv.find((a) => a.startsWith("--target_conf="));
const TARGET_CONF = TARGET_CONF_ARG ? Number(TARGET_CONF_ARG.split("=")[1]) : 0.95;

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

function buildOutPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("/tmp", `ri_perfectgame_candidate_confidence_bump_${stamp}.csv`);
}

function toCsvRow(values: Record<string, string>) {
  const cols = Object.keys(values);
  const esc = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return cols.map((c) => esc(values[c] ?? "")).join(",");
}

function printHelp() {
  console.log(
    [
      "Bump confidence for PerfectGame-derived tournament_venue_candidates so they can pass apply guardrails.",
      "",
      "Usage:",
      "  TMPDIR=./tmp node --import tsx scripts/ops/bump_perfectgame_candidate_confidence.ts",
      "  TMPDIR=./tmp node --import tsx scripts/ops/bump_perfectgame_candidate_confidence.ts --apply",
      "",
      "Optional:",
      "  --min_conf=0.92        Guardrail threshold to pass (default 0.92)",
      "  --target_conf=0.95     New confidence (default 0.95)",
      "",
      "Env required:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
    ].join("\n")
  );
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

  if (!Number.isFinite(MIN_CONF) || MIN_CONF <= 0 || MIN_CONF > 1) throw new Error("--min_conf must be (0,1]");
  if (!Number.isFinite(TARGET_CONF) || TARGET_CONF <= 0 || TARGET_CONF > 1) throw new Error("--target_conf must be (0,1]");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const outPath = buildOutPath();

  // Pull a reasonable chunk; this is intended to be run right after a scan.
  const { data, error } = await supabase
    .from("tournament_venue_candidates" as any)
    .select("id,tournament_id,confidence,evidence_text,source_url")
    .ilike("evidence_text", "perfectgame-locations%")
    .limit(5000);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Candidate[];
  const targets = rows.filter((r) => Number(r.confidence ?? 0) < MIN_CONF);

  const report: Array<Record<string, string>> = [];
  let bumped = 0;
  let skipped = 0;

  for (const row of rows) {
    const current = Number(row.confidence ?? 0);
    if (current >= MIN_CONF) {
      skipped += 1;
      report.push({
        candidate_id: row.id,
        tournament_id: String(row.tournament_id ?? ""),
        confidence_before: String(row.confidence ?? ""),
        confidence_after: String(row.confidence ?? ""),
        action: "skipped_already_high",
        evidence_text: String(row.evidence_text ?? ""),
        source_url: String(row.source_url ?? ""),
      });
      continue;
    }

    if (!APPLY) {
      bumped += 1;
      report.push({
        candidate_id: row.id,
        tournament_id: String(row.tournament_id ?? ""),
        confidence_before: String(row.confidence ?? ""),
        confidence_after: String(TARGET_CONF),
        action: "dry_run_bump",
        evidence_text: String(row.evidence_text ?? ""),
        source_url: String(row.source_url ?? ""),
      });
      continue;
    }

    const { error: updErr } = await supabase.from("tournament_venue_candidates" as any).update({ confidence: TARGET_CONF }).eq("id", row.id);
    if (updErr) {
      report.push({
        candidate_id: row.id,
        tournament_id: String(row.tournament_id ?? ""),
        confidence_before: String(row.confidence ?? ""),
        confidence_after: String(row.confidence ?? ""),
        action: "update_failed",
        evidence_text: String(row.evidence_text ?? ""),
        source_url: String(row.source_url ?? ""),
        error: updErr.message.slice(0, 180),
      });
      continue;
    }

    bumped += 1;
    report.push({
      candidate_id: row.id,
      tournament_id: String(row.tournament_id ?? ""),
      confidence_before: String(row.confidence ?? ""),
      confidence_after: String(TARGET_CONF),
      action: "bumped",
      evidence_text: String(row.evidence_text ?? ""),
      source_url: String(row.source_url ?? ""),
    });
  }

  const header = Object.keys({
    candidate_id: "",
    tournament_id: "",
    confidence_before: "",
    confidence_after: "",
    action: "",
    evidence_text: "",
    source_url: "",
    error: "",
  });
  const rowsCsv = [
    header.join(","),
    ...report.map((r) =>
      toCsvRow(
        header.reduce(
          (acc, k) => {
            acc[k] = String(r[k] ?? "");
            return acc;
          },
          {} as Record<string, string>
        )
      )
    ),
  ].join("\n");
  fs.writeFileSync(outPath, rowsCsv);

  console.log(
    [
      "",
      "Done.",
      `- apply: ${APPLY ? "yes" : "no"}`,
      `- perfectgame_candidates: ${rows.length}`,
      `- below_min_conf: ${targets.length}`,
      `- bumped: ${bumped}`,
      `- skipped: ${skipped}`,
      `- csv: ${outPath}`,
    ].join("\n")
  );
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exit(1);
});

