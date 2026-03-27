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

function clean(value) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function csv(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  loadEnvLocal();
  const APPLY = process.argv.includes("--apply");
  const outPath = clean(argValue("out")) || path.resolve(process.cwd(), "tmp", "rmr_mountain_series_venue_fix.csv");

  const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const keepVenueIds = [
    "cc455362-7317-4f2d-ac1d-6f2ff86825d5", // Blackout Sports Fieldhouse
    "7811d0cc-fe74-4dac-a25a-caefa4481149", // Colorado Mesa University
  ];

  const targetTournamentNames = ["RMR Mountain Series #1", "RMR Mountain Series #2", "RMR Mountain Series #3", "RMR Mountain Series #4"];

  const { data: tournamentsRaw, error: tErr } = await supabase
    .from("tournaments")
    .select("id,name,state,city,start_date,end_date,official_website_url,source_url")
    .in("name", targetTournamentNames)
    .eq("state", "CO")
    .limit(20);
  if (tErr) throw tErr;
  const tournaments = Array.isArray(tournamentsRaw) ? tournamentsRaw : [];

  const missing = targetTournamentNames.filter((name) => !tournaments.some((t) => t.name === name));
  if (missing.length) {
    throw new Error(`Missing tournaments in DB (state=CO): ${missing.join(", ")}`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, ["tournament_id", "tournament_name", "old_links", "kept_links", "unlinked_links", "note"].join(",") + "\n", "utf8");

  for (const t of tournaments.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const tournamentId = String(t.id);
    const tournamentName = String(t.name ?? "");
    const { data: linksRaw, error: lErr } = await supabase.from("tournament_venues").select("venue_id").eq("tournament_id", tournamentId);
    if (lErr) throw lErr;
    const existing = new Set((linksRaw ?? []).map((r) => String(r.venue_id ?? "")).filter(Boolean));

    const toUnlink = Array.from(existing).filter((id) => !keepVenueIds.includes(id));
    const missingLinks = keepVenueIds.filter((id) => !existing.has(id));

    if (APPLY) {
      for (const venueId of keepVenueIds) {
        await supabase.from("tournament_venues").upsert({ tournament_id: tournamentId, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
      }
      if (toUnlink.length) {
        const { error: delErr } = await supabase
          .from("tournament_venues")
          .delete()
          .eq("tournament_id", tournamentId)
          .in("venue_id", toUnlink);
        if (delErr) throw delErr;
      }
    }

    fs.appendFileSync(
      outPath,
      [tournamentId, tournamentName, String(existing.size), String(keepVenueIds.length), String(toUnlink.length), APPLY ? "applied" : `dry_run_missing_keep=${missingLinks.length}`]
        .map(csv)
        .join(",") + "\n",
      "utf8"
    );
  }

  console.log(`[rmr_fix] apply=${APPLY} tournaments=${tournaments.length} report=${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

