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

const APPLY = process.argv.includes("--apply");
const OUT_PATH =
  clean(argValue("out")) || path.resolve(process.cwd(), "tmp", `purge_owlseye_residential_nearby_${Date.now()}.csv`);

const STRONG_RE =
  /\b(mobile home|trailer|rv|campground|tent|private room|private bedroom|shared bathroom|ensuite|private entrance|guest suite|entire suite|entire home|whole home|airbnb|vrbo|vacation rental|furnished|fully furn|garden apt|apartment|apartments|condo|condominiums?|townhome|townhouse|studio apartment|guest house|guesthouse|single family|multi family|bed\s*&\s*breakfast|b&b)\b/i;
const HOME_WORD_RE = /\bhome\b/i;
const HOME_CONTEXT_RE =
  /\b(near|private|bedroom|bathroom|furn|furnished|family|yard|neighborhood|getaway|retreat|garden|apt|apartment|condo|townhome|townhouse|airbnb|vrbo|vacation)\b/i;

function looksResidential(nameRaw, addressRaw) {
  const name = String(nameRaw ?? "").trim();
  const address = String(addressRaw ?? "").trim();
  const haystack = `${name} ${address}`.toLowerCase();

  if (STRONG_RE.test(haystack)) return true;

  if (!HOME_WORD_RE.test(name)) return false;
  const hasStreetNumber = /\b\d{1,6}\b/.test(address);
  if (!hasStreetNumber) return true;
  if (HOME_CONTEXT_RE.test(haystack)) return true;
  return false;
}

async function main() {
  loadEnvLocal();

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, "row,run_id,place_id,category,name,address,action,note\n", "utf8");

  let scanned = 0;
  let matched = 0;
  let deleted = 0;

  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("owls_eye_nearby_food")
      .select("run_id,place_id,category,name,address,is_sponsor")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;

    scanned += rows.length;
    const byRun = new Map();
    for (const row of rows) {
      if (row?.is_sponsor) continue;
      if (String(row?.category ?? "") !== "hotel") continue;
      if (!looksResidential(row?.name, row?.address)) continue;
      matched += 1;
      const runId = String(row.run_id);
      const placeId = String(row.place_id);
      if (!byRun.has(runId)) byRun.set(runId, []);
      byRun.get(runId).push({ placeId, row });
    }

    for (const [runId, items] of byRun.entries()) {
      const placeIds = Array.from(new Set(items.map((it) => it.placeId))).filter(Boolean);
      if (placeIds.length === 0) continue;

      if (APPLY) {
        const { error: delErr } = await supabase.from("owls_eye_nearby_food").delete().eq("run_id", runId).in("place_id", placeIds);
        if (delErr) throw delErr;
        deleted += placeIds.length;
      }

      for (const it of items) {
        const r = it.row;
        fs.appendFileSync(
          OUT_PATH,
          [
            scanned,
            runId,
            it.placeId,
            r.category ?? "",
            r.name ?? "",
            r.address ?? "",
            APPLY ? "deleted" : "would_delete",
            "residential_match",
          ]
            .map((v) => {
              const s = String(v ?? "");
              return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(",") + "\n"
        );
      }
    }

    offset += rows.length;
    if (rows.length < pageSize) break;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply: APPLY,
        out: OUT_PATH,
        scanned,
        matched,
        deleted,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
