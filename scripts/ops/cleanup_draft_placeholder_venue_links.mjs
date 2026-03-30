import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

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

function normalize(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function isBlank(value) {
  return normalize(value).length === 0;
}

function isPlaceholderVenueName(name) {
  const v = normalize(name).toLowerCase();
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

function venueLooksAddressless(venue) {
  if (!venue) return true;
  const hasAddr = !isBlank(venue.address1) || !isBlank(venue.address) || !isBlank(venue.zip);
  const hasGeo = typeof venue.latitude === "number" && typeof venue.longitude === "number";
  return !hasAddr && !hasGeo;
}

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, rows) {
  const header = [
    "tournament_id",
    "tournament_slug",
    "tournament_name",
    "tournament_status",
    "denorm_venue",
    "venue_id",
    "venue_name",
    "venue_city",
    "venue_state",
    "venue_address1",
    "venue_address",
    "venue_zip",
    "venue_latitude",
    "venue_longitude",
    "action",
    "reason",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      header
        .map((k) => csvEscape(r[k]))
        .join(",")
    );
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

async function main() {
  const apply = hasFlag("apply");
  const limit = Math.min(Math.max(parseInt(argValue("limit") || "5000", 10) || 5000, 1), 20000);
  const slug = argValue("slug");
  const maxPages = Math.min(Math.max(parseInt(argValue("max_pages") || "25", 10) || 25, 1), 200);

  loadEnvLocalIfMissing();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env or .env.local).");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const pageSize = 1000;
  const tournaments = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    let q = supabase
      .from("tournaments")
      .select(
        "id,slug,name,status,venue,address,tournament_venues(venue_id,venues(id,name,city,state,address,address1,zip,latitude,longitude))"
      )
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (slug) q = q.eq("slug", slug);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    tournaments.push(...rows);
    if (rows.length < pageSize) break;
    if (tournaments.length >= limit) break;
  }

  const candidates = [];
  for (const t of tournaments.slice(0, limit)) {
    const links = Array.isArray(t.tournament_venues) ? t.tournament_venues : [];
    for (const link of links) {
      const v = link?.venues || null;
      const venueName = v?.name || "";
      const reasonParts = [];
      if (!isPlaceholderVenueName(venueName)) continue;
      reasonParts.push("placeholder_name");
      if (!venueLooksAddressless(v)) continue;
      reasonParts.push("missing_address_and_geo");
      candidates.push({
        tournament_id: t.id,
        tournament_slug: t.slug,
        tournament_name: t.name,
        tournament_status: t.status,
        denorm_venue: t.venue,
        venue_id: link?.venue_id || v?.id || "",
        venue_name: venueName,
        venue_city: v?.city,
        venue_state: v?.state,
        venue_address1: v?.address1,
        venue_address: v?.address,
        venue_zip: v?.zip,
        venue_latitude: v?.latitude,
        venue_longitude: v?.longitude,
        action: apply ? "unlink" : "dry_run",
        reason: reasonParts.join("+"),
      });
    }
  }

  let unlinked = 0;
  let errors = 0;
  if (apply && candidates.length) {
    // Group deletes per tournament for fewer requests.
    const byTournament = new Map();
    for (const row of candidates) {
      const arr = byTournament.get(row.tournament_id) || [];
      arr.push(row.venue_id);
      byTournament.set(row.tournament_id, arr);
    }

    for (const [tournamentId, venueIds] of byTournament.entries()) {
      const uniqueVenueIds = Array.from(new Set(venueIds.filter(Boolean)));
      if (!uniqueVenueIds.length) continue;
      const { error } = await supabase
        .from("tournament_venues")
        .delete()
        .eq("tournament_id", tournamentId)
        .in("venue_id", uniqueVenueIds);
      if (error) {
        errors += 1;
        console.error("Unlink failed", { tournamentId, error: error.message });
        continue;
      }
      unlinked += uniqueVenueIds.length;
    }
  }

  const reportPath = path.join("tmp", `draft_placeholder_venue_unlinks_${nowStamp()}_${apply ? "apply" : "dry"}.csv`);
  writeCsv(reportPath, candidates);

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry_run",
        tournaments_scanned: Math.min(tournaments.length, limit),
        candidates: candidates.length,
        unlinked,
        errors,
        report: reportPath,
        note: "Only unlinks venues that look like placeholders (TBD/TBA/etc) AND have no address/geo.",
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

