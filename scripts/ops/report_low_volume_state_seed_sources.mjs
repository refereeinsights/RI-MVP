#!/usr/bin/env node
/**
 * Reports low-volume states for a given sport and whether we have good seed sources.
 *
 * Output: CSV under tmp/ and prints path + a short summary.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/ops/report_low_volume_state_seed_sources.mjs --sport=soccer --top=20 --out=tmp/file.csv
 */

import fs from "node:fs";
import path from "node:path";

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

function csv(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(
    d.getSeconds()
  )}`;
}

const US_STATES_PLUS_DC = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

function suggestionQueries(state, sport) {
  const baseSport = sport === "soccer" ? "youth soccer" : sport;
  const st = String(state).toUpperCase();
  const q1 = `"${st}" ${baseSport} sanctioned tournaments`;
  const q2 = `"${st}" ${baseSport} state association tournaments`;
  const q3 = `"${st}" ${baseSport} tournaments site:.org`;
  return [q1, q2, q3].join(" | ");
}

async function main() {
  loadEnvLocal();
  const sport = (clean(argValue("sport")) ?? "soccer").toLowerCase();
  const top = Math.max(5, Number(argValue("top") ?? "20") || 20);
  const outPath =
    clean(argValue("out")) || path.resolve(process.cwd(), "tmp", `low_volume_states_${sport}_${stamp()}.csv`);

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const today = new Date().toISOString().slice(0, 10);

  // Upcoming tournaments by state from tournaments_public (published/canonical directory).
  const counts = new Map(US_STATES_PLUS_DC.map((s) => [s, 0]));
  let from = 0;
  const step = 1000;
  for (;;) {
    const resp = await supabase
      .from("tournaments_public")
      .select("state,start_date,end_date")
      .eq("sport", sport)
      .or(`start_date.gte.${today},end_date.gte.${today}`)
      .range(from, from + step - 1);
    if (resp.error) throw resp.error;
    const rows = resp.data ?? [];
    for (const r of rows) {
      const st = String(r.state ?? "").trim().toUpperCase();
      if (!counts.has(st)) continue;
      counts.set(st, (counts.get(st) ?? 0) + 1);
    }
    if (!rows.length || rows.length < step) break;
    from += step;
    if (from > 200000) break;
  }

  // Existing seed sources (tournament_sources registry).
  const seedByState = new Map();
  {
    let from2 = 0;
    const step2 = 1000;
    const now = Date.now();
    for (;;) {
      const resp = await supabase
        .from("tournament_sources")
        .select("source_url,source_type,sport,state,review_status,is_active,ignore_until,is_custom_source,last_sweep_status,last_swept_at")
        .is("tournament_id", null)
        .eq("sport", sport)
        .eq("source_type", "association_directory")
        .range(from2, from2 + step2 - 1);
      if (resp.error) throw resp.error;
      const rows = resp.data ?? [];
      for (const r of rows) {
        if (!r?.is_active) continue;
        if (r.ignore_until && new Date(r.ignore_until).getTime() > now) continue;
        const st = String(r.state ?? "ALL").trim().toUpperCase();
        const existing = seedByState.get(st);
        const next = {
          source_url: String(r.source_url ?? ""),
          review_status: String(r.review_status ?? "untested"),
          is_custom_source: !!r.is_custom_source,
          last_sweep_status: r.last_sweep_status ? String(r.last_sweep_status) : null,
          last_swept_at: r.last_swept_at ? String(r.last_swept_at) : null,
        };
        // Prefer KEEP/APPROVED then custom sources then most recently swept.
        const score = () => {
          const rs = next.review_status.toLowerCase();
          let s = 0;
          if (rs === "keep" || rs === "approved") s += 50;
          if (rs === "untested") s += 10;
          if (next.is_custom_source) s += 10;
          if (String(next.last_sweep_status ?? "").toLowerCase() === "ok") s += 10;
          if (next.last_swept_at) s += Math.min(9, Math.floor((Date.now() - new Date(next.last_swept_at).getTime()) / (24 * 3600 * 1000)) * -1);
          return s;
        };
        const existingScore = existing ? existing._score : -9999;
        const nextScore = score();
        if (!existing || nextScore > existingScore) seedByState.set(st, { ...next, _score: nextScore });
      }
      if (!rows.length || rows.length < step2) break;
      from2 += step2;
      if (from2 > 20000) break;
    }
  }

  const ranked = US_STATES_PLUS_DC.map((st) => ({
    state: st,
    upcoming_count: counts.get(st) ?? 0,
    seed: seedByState.get(st) ?? null,
  }))
    .sort((a, b) => a.upcoming_count - b.upcoming_count || a.state.localeCompare(b.state))
    .slice(0, top);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const lines = [
    [
      "state",
      "upcoming_count",
      "has_association_seed",
      "seed_url",
      "seed_review_status",
      "seed_last_sweep_status",
      "seed_last_swept_at",
      "suggested_queries",
    ].join(","),
    ...ranked.map((r) =>
      [
        r.state,
        r.upcoming_count,
        r.seed ? "1" : "0",
        r.seed?.source_url ?? "",
        r.seed?.review_status ?? "",
        r.seed?.last_sweep_status ?? "",
        r.seed?.last_swept_at ?? "",
        suggestionQueries(r.state, sport),
      ]
        .map(csv)
        .join(",")
    ),
  ];
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");

  const missingSeed = ranked.filter((r) => !r.seed).map((r) => r.state);
  console.log(
    JSON.stringify(
      {
        ok: true,
        sport,
        today,
        out: outPath,
        bottom_states_count: ranked.length,
        bottom_states_missing_association_seed: missingSeed,
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

