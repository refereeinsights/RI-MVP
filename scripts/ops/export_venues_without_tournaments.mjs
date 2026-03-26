import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`;
}

function csv(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function fetchPage(supabase, from, to) {
  return await supabase
    .from("venues")
    .select("id,name,city,state,zip,address,address1,latitude,longitude,venue_url,created_at,updated_at")
    .order("created_at", { ascending: false })
    .range(from, to);
}

async function loadLinkedVenueIds(supabase, venueIds) {
  const linked = new Set();
  const chunkSize = 80;
  for (let i = 0; i < venueIds.length; i += chunkSize) {
    const chunk = venueIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("tournament_venues")
      .select("venue_id")
      .in("venue_id", chunk)
      .limit(20000);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = row?.venue_id ? String(row.venue_id) : "";
      if (id) linked.add(id);
    }
  }
  return linked;
}

async function main() {
  loadEnvLocal();

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const outPath =
    process.env.OUT?.trim() ||
    path.resolve(process.cwd(), "tmp", `venues_without_tournaments_${stamp()}.csv`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const cols = [
    "venue_id",
    "name",
    "city",
    "state",
    "zip",
    "address",
    "address1",
    "latitude",
    "longitude",
    "venue_url",
    "created_at",
    "updated_at",
  ];

  const pageSize = Number(process.env.PAGE_SIZE ?? "500") || 500;
  let offset = 0;
  let wroteHeader = false;
  let orphanCount = 0;
  let scannedCount = 0;

  while (true) {
    const { data, error } = await fetchPage(supabase, offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []).filter((r) => r?.id);
    if (!rows.length) break;

    scannedCount += rows.length;
    const ids = rows.map((r) => String(r.id)).filter(Boolean);
    const linked = await loadLinkedVenueIds(supabase, ids);

    const orphanRows = rows.filter((r) => !linked.has(String(r.id)));
    if (orphanRows.length) {
      if (!wroteHeader) {
        fs.writeFileSync(outPath, `${cols.join(",")}\n`, "utf8");
        wroteHeader = true;
      }
      const lines = orphanRows.map((v) =>
        [
          v.id,
          v.name,
          v.city,
          v.state,
          v.zip,
          v.address,
          v.address1,
          v.latitude,
          v.longitude,
          v.venue_url,
          v.created_at,
          v.updated_at,
        ]
          .map(csv)
          .join(",")
      );
      fs.appendFileSync(outPath, lines.join("\n") + "\n", "utf8");
      orphanCount += orphanRows.length;
    }

    offset += pageSize;
  }

  if (!wroteHeader) {
    fs.writeFileSync(outPath, `${cols.join(",")}\n`, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        scannedVenues: scannedCount,
        orphanVenues: orphanCount,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("[export-venues-without-tournaments] fatal:", err?.message ?? err);
  process.exit(1);
});

