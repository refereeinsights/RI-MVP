import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadEnvFileIfPresent(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const kv = parseEnvLine(line);
      if (!kv) continue;
      if (process.env[kv.key] === undefined) process.env[kv.key] = kv.value;
    }
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") return;
    throw e;
  }
}

// Load env vars without `source` (safer in CI/sandbox).
const repoRoot = path.resolve(__dirname, "..", "..");
loadEnvFileIfPresent(path.join(repoRoot, ".env"));
loadEnvFileIfPresent(path.join(repoRoot, ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function countTotalTournaments() {
  const res = await supabase.from("tournaments").select("id", { count: "exact", head: true });
  if (res.error) throw res.error;
  return res.count ?? 0;
}

async function countWithGeoPresent() {
  const res = await supabase
    .from("tournaments")
    .select("id", { count: "exact", head: true })
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  if (res.error) throw res.error;
  return res.count ?? 0;
}

async function countWithGeoMissingAny() {
  const res = await supabase
    .from("tournaments")
    .select("id", { count: "exact", head: true })
    .or("latitude.is.null,longitude.is.null");
  if (res.error) throw res.error;
  return res.count ?? 0;
}

async function countWithGeoMissingBoth() {
  const res = await supabase.from("tournaments").select("id", { count: "exact", head: true }).is("latitude", null).is("longitude", null);
  if (res.error) throw res.error;
  return res.count ?? 0;
}

async function sampleMissing(limit) {
  const res = await supabase
    .from("tournaments")
    .select("id,slug,name,city,state,zip,venue,address,latitude,longitude,geo_source,updated_at")
    .or("latitude.is.null,longitude.is.null")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (res.error) throw res.error;
  return res.data ?? [];
}

function pct(n, d) {
  if (!d) return "0.0%";
  return `${((n / d) * 100).toFixed(1)}%`;
}

async function main() {
  const total = await countTotalTournaments();
  const present = await countWithGeoPresent();
  const missingAny = await countWithGeoMissingAny();
  const missingBoth = await countWithGeoMissingBoth();

  console.log(
    JSON.stringify(
      {
        total_tournaments: total,
        geo_present_both: { count: present, pct: pct(present, total) },
        geo_missing_any: { count: missingAny, pct: pct(missingAny, total) },
        geo_missing_both: { count: missingBoth, pct: pct(missingBoth, total) },
        note: "Geo presence is defined as latitude!=null AND longitude!=null.",
      },
      null,
      2
    )
  );

  const rows = await sampleMissing(20);
  if (rows.length) {
    console.log("\nSample missing:");
    for (const r of rows) {
      const label = `${r.slug ?? r.id} :: ${r.name ?? ""}`.trim();
      const loc = [r.city, r.state, r.zip].filter(Boolean).join(", ");
      console.log(`- ${label}${loc ? ` (${loc})` : ""} source=${r.geo_source ?? "null"}`);
    }
  }
}

main().catch((e) => {
  console.error("[audit_tournaments_geo] fatal", e);
  process.exit(1);
});

