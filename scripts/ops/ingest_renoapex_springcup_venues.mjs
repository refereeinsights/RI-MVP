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

function decodeHtmlText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCityState(value) {
  const v = clean(value);
  if (!v) return null;
  const m = v.match(/^(.+?),\s*([A-Z]{2})\b/i);
  if (!m?.[1] || !m?.[2]) return null;
  const city = clean(m[1]);
  const state = clean(m[2])?.toUpperCase() ?? null;
  if (!city || !state) return null;
  return { city, state };
}

function parseLatLngFromGoogleEmbed(src) {
  const s = String(src ?? "");
  // Example pb fragment contains: !2d-119.758...!3d39.405...
  const lngMatch = s.match(/!2d(-?\d+(?:\.\d+)?)/);
  const latMatch = s.match(/!3d(-?\d+(?:\.\d+)?)/);
  const lat = latMatch ? Number(latMatch[1]) : null;
  const lng = lngMatch ? Number(lngMatch[1]) : null;
  if (!Number.isFinite(lat ?? NaN) || !Number.isFinite(lng ?? NaN)) return null;
  return { latitude: lat, longitude: lng };
}

async function fetchText(url) {
  const resp = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "user-agent": "TI-RI-RenoApex/1.0", accept: "text/html,application/xhtml+xml" },
  });
  if (!resp.ok) return null;
  const text = await resp.text();
  return text || null;
}

function extractVenueBlocks(html) {
  const out = [];
  // We look for repeated blocks of:
  // <h4>Venue Name</h4>
  // <p>City, ST</p>
  // <iframe src="https://www.google.com/maps/embed?pb=...">
  const re =
    /<h4[^>]*>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>\s*<\/h4>\s*<p[^>]*>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>\s*<\/p>[\s\S]*?<iframe[^>]+src="([^"]*google\.com\/maps\/embed\?pb=[^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const name = decodeHtmlText(m[1]);
    const cityStateRaw = decodeHtmlText(m[2]);
    const src = decodeHtmlText(m[3]);
    if (!name || !src) continue;
    out.push({ name, cityStateRaw, mapEmbedUrl: src });
  }

  const deduped = Array.from(new Map(out.map((v) => [v.name.toLowerCase(), v])).values());
  return deduped;
}

async function findVenueMatch(supabase, args) {
  const name = clean(args.name);
  const city = clean(args.city);
  const state = clean(args.state)?.toUpperCase() ?? null;
  if (!name || !state) return { venue: null, note: "no_name_or_state" };

  if (city) {
    const exact = await supabase
      .from("venues")
      .select("id,name,address,city,state,zip,latitude,longitude,venue_url,notes")
      .eq("state", state)
      .eq("city", city)
      .ilike("name", name)
      .limit(5);
    if (exact.error) throw exact.error;
    const rows = (exact.data ?? []).filter((r) => r?.id);
    if (rows.length === 1) return { venue: rows[0], note: "exact_name_city_state" };
    if (rows.length > 1) return { venue: null, note: "ambiguous_exact_name_city_state" };
  }

  const byState = await supabase
    .from("venues")
    .select("id,name,address,city,state,zip,latitude,longitude,venue_url,notes")
    .eq("state", state)
    .ilike("name", name)
    .limit(5);
  if (byState.error) throw byState.error;
  const rows = (byState.data ?? []).filter((r) => r?.id);
  if (rows.length === 1) return { venue: rows[0], note: city ? "exact_name_state_fallback" : "exact_name_state" };
  if (rows.length > 1) return { venue: null, note: "ambiguous_exact_name_state" };
  return { venue: null, note: "no_match" };
}

async function main() {
  loadEnvLocal();
  const APPLY = process.argv.includes("--apply");

  const tournamentId = clean(argValue("tournament_id"));
  const url = clean(argValue("url")) ?? "https://renoapex.com/springcup/";
  if (!tournamentId) throw new Error("Missing required arg: --tournament_id=<uuid> (add --apply to write)");

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const tRes = await supabase.from("tournaments").select("id,name,sport,state").eq("id", tournamentId).maybeSingle();
  if (tRes.error) throw tRes.error;
  const t = tRes.data;
  if (!t?.id) throw new Error(`tournament_not_found:${tournamentId}`);

  const tournamentState = clean(t.state)?.toUpperCase() ?? null;
  const tournamentSport = clean(t.sport) ?? null;

  const html = await fetchText(url);
  if (!html) throw new Error(`fetch_failed:${url}`);
  const venues = extractVenueBlocks(html);
  if (!venues.length) throw new Error("no_venues_found_on_page");

  const outPath = path.resolve(process.cwd(), "tmp", `renoapex_springcup_venues_ingest_${stamp()}.csv`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const cols = [
    "tournament_id",
    "venue_name",
    "city",
    "state",
    "latitude",
    "longitude",
    "map_embed_url",
    "matched_venue_id",
    "created_venue_id",
    "linked",
    "note",
  ];
  fs.writeFileSync(outPath, `${cols.join(",")}\n`, "utf8");

  const desiredVenueIds = [];
  let matched = 0;
  let created = 0;
  let linked = 0;

  for (const v of venues) {
    const name = clean(v.name);
    const cityState = parseCityState(v.cityStateRaw);
    const city = clean(cityState?.city);
    const state = clean(cityState?.state)?.toUpperCase() ?? tournamentState;
    const latlng = parseLatLngFromGoogleEmbed(v.mapEmbedUrl);
    const latitude = latlng?.latitude ?? null;
    const longitude = latlng?.longitude ?? null;

    let matchId = null;
    let createdId = null;
    let didLink = false;
    let note = "";

    if (!name) {
      note = "skip:no_name";
    } else if (!state) {
      note = "skip:no_state";
    } else {
      const found = await findVenueMatch(supabase, { name, city, state });
      if (found.venue?.id) {
        matchId = String(found.venue.id);
        matched += 1;
        note = found.note;

        const patch = {};
        if (city && !clean(found.venue.city)) patch.city = city;
        if (state && !clean(found.venue.state)) patch.state = state;
        if (
          typeof latitude === "number" &&
          !Number.isNaN(latitude) &&
          (found.venue.latitude === null || found.venue.latitude === undefined)
        )
          patch.latitude = latitude;
        if (
          typeof longitude === "number" &&
          !Number.isNaN(longitude) &&
          (found.venue.longitude === null || found.venue.longitude === undefined)
        )
          patch.longitude = longitude;
        if (clean(v.mapEmbedUrl) && !clean(found.venue.venue_url)) patch.venue_url = clean(v.mapEmbedUrl);
        if (!clean(found.venue.notes)) patch.notes = `[renoapex] ${url}`;

        if (APPLY && Object.keys(patch).length) {
          const { error: updErr } = await supabase.from("venues").update(patch).eq("id", matchId);
          if (updErr) throw updErr;
        }
      } else if (found.note?.startsWith("ambiguous")) {
        note = found.note;
      } else {
        if (APPLY) {
          const payload = {
            name,
            address: null,
            city,
            state,
            sport: tournamentSport,
            latitude,
            longitude,
            venue_url: clean(v.mapEmbedUrl),
            notes: `[renoapex] ${url}`,
          };
          const ins = await supabase.from("venues").insert(payload).select("id").single();
          if (ins.error) throw ins.error;
          createdId = String(ins.data.id);
          created += 1;
        } else {
          createdId = "dry_run";
        }
      }

      const venueIdToLink = matchId || (createdId && createdId !== "dry_run" ? createdId : null);
      if (venueIdToLink) desiredVenueIds.push(venueIdToLink);
      if (venueIdToLink && APPLY) {
        const link = await supabase
          .from("tournament_venues")
          .upsert({ tournament_id: tournamentId, venue_id: venueIdToLink }, { onConflict: "tournament_id,venue_id" });
        if (link.error) throw link.error;
        didLink = true;
        linked += 1;
      } else if (venueIdToLink && !APPLY) {
        didLink = true;
      }
    }

    fs.appendFileSync(
      outPath,
      [
        tournamentId,
        name,
        city,
        state,
        latitude,
        longitude,
        v.mapEmbedUrl,
        matchId,
        createdId,
        didLink ? "yes" : "no",
        note,
      ].map(csv).join(",") + "\n"
    );
  }

  // Remove any old tournament_venues links that are not in the new set.
  if (APPLY) {
    const keepIds = Array.from(new Set(desiredVenueIds));
    if (keepIds.length) {
      const del = await supabase.from("tournament_venues").delete().eq("tournament_id", tournamentId).not("venue_id", "in", `(${keepIds.join(",")})`);
      if (del.error) throw del.error;
    }
  }

  console.log(`[renoapex_springcup_venues] tournament=${t?.name ?? tournamentId} apply=${APPLY}`);
  console.log(`[renoapex_springcup_venues] url=${url}`);
  console.log(`[renoapex_springcup_venues] venues_found=${venues.length} matched=${matched} created=${created} linked=${linked}`);
  console.log(`[renoapex_springcup_venues] report=${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

