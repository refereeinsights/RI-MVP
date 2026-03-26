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

function decodeHtmlText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTournamentCity(value) {
  const v = clean(value);
  if (!v) return null;
  // e.g. "Wilton, CT" -> "Wilton"
  return v.split(",")[0]?.trim() || v;
}

function parseLatLngFromGmapsUrl(href) {
  const m = String(href ?? "").match(/\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function decodeGmapsPlaceSegment(href) {
  try {
    const u = new URL(href);
    const idx = u.pathname.indexOf("/maps/place/");
    if (idx < 0) return null;
    const rest = u.pathname.slice(idx + "/maps/place/".length);
    const until = rest.split("/@")[0]?.split("/data")[0] ?? rest;
    const plusDecoded = until.replace(/\+/g, " ");
    return decodeURIComponent(plusDecoded);
  } catch {
    return null;
  }
}

function parsePlaceIntoAddress(placeText) {
  const p = clean(placeText);
  if (!p) return null;
  const parts = p.split(",").map((s) => s.trim()).filter(Boolean);
  // Common form: "Name, Street, City, ST 12345"
  if (parts.length < 3) return null;
  const tail = parts.slice(-2).join(", ");
  const m = tail.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  if (!m) return null;
  const city = clean(m[1]);
  const state = clean(m[2])?.toUpperCase() ?? null;
  const zip = m[3] ? clean(m[3]) : null;
  const street = clean(parts.slice(1, -2).join(", "));
  if (!city || !state || !street) return null;
  return { street, city, state, zip };
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
  const url = clean(argValue("url")) ?? "https://www.coastaleliteshowcases.com/venues";
  if (!tournamentId) {
    throw new Error("Missing required arg: --tournament_id=<uuid> (add --apply to write)");
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const tRes = await supabase
    .from("tournaments")
    .select("id,name,slug,sport,city,state")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tRes.error) throw tRes.error;
  const t = tRes.data;
  if (!t?.id) throw new Error(`tournament_not_found:${tournamentId}`);

  const tournamentCity = normalizeTournamentCity(t.city);
  const tournamentState = clean(t.state)?.toUpperCase() ?? null;
  const tournamentSport = clean(t.sport) ?? null;

  const html = await (await fetch(url)).text();
  const anchorRe = /<a[^>]+href="(https:\/\/www\.google\.com\/maps\/place\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const raw = [];
  let m;
  while ((m = anchorRe.exec(html))) {
    const href = m[1];
    const text = decodeHtmlText(m[2]);
    if (!href || !text) continue;
    raw.push({ href, text });
  }

  const seen = new Set();
  const venues = [];
  for (const row of raw) {
    const key = `${row.text}@@${row.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    venues.push(row);
  }

  const outPath = path.resolve(process.cwd(), "tmp", `coastal_elite_venues_ingest_${stamp()}.csv`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const cols = [
    "tournament_id",
    "venue_name",
    "street",
    "city",
    "state",
    "zip",
    "latitude",
    "longitude",
    "gmaps_url",
    "matched_venue_id",
    "created_venue_id",
    "linked",
    "note",
  ];
  fs.writeFileSync(outPath, `${cols.join(",")}\n`, "utf8");

  let matched = 0;
  let created = 0;
  let linked = 0;

  for (const item of venues) {
    const name = clean(item.text);
    const gmapsUrl = item.href;
    const latlng = parseLatLngFromGmapsUrl(gmapsUrl);
    const placeText = decodeGmapsPlaceSegment(gmapsUrl);
    const addr = parsePlaceIntoAddress(placeText);

    const street = addr?.street ?? null;
    const city = addr?.city ?? tournamentCity ?? null;
    const state = addr?.state ?? tournamentState ?? null;
    const zip = addr?.zip ?? null;
    const latitude = latlng?.lat ?? null;
    const longitude = latlng?.lng ?? null;

    let matchId = null;
    let createdId = null;
    let didLink = false;
    let note = "";

    if (!name) {
      note = "skip:no_name";
    } else if (!state || !city) {
      note = "skip:no_city_state";
    } else {
      const found = await findVenueMatch(supabase, { name, city, state });
      if (found.venue?.id) {
        matchId = String(found.venue.id);
        matched += 1;

        // Best-effort patch missing fields (never overwrite existing non-null values).
        const patch = {};
        if (street && !clean(found.venue.address)) patch.address = street;
        if (zip && !clean(found.venue.zip)) patch.zip = zip;
        if (typeof latitude === "number" && !Number.isNaN(latitude) && (found.venue.latitude === null || found.venue.latitude === undefined)) {
          patch.latitude = latitude;
        }
        if (typeof longitude === "number" && !Number.isNaN(longitude) && (found.venue.longitude === null || found.venue.longitude === undefined)) {
          patch.longitude = longitude;
        }
        const nextNotes = [`[coastal-elite] ${url}`, `[gmaps] ${gmapsUrl}`].join(" | ");
        if (!clean(found.venue.notes)) patch.notes = nextNotes;
        if (Object.keys(patch).length && APPLY) {
          const upd = await supabase.from("venues").update(patch).eq("id", matchId);
          if (upd.error) note = `warn:venue_patch_failed:${upd.error.message}`;
        }
        note = note || `match:${found.note}`;
      } else if (APPLY) {
        const payload = {
          name,
          address: street,
          city,
          state,
          zip,
          latitude,
          longitude,
          venue_url: null,
          sport: tournamentSport,
          notes: [`[coastal-elite] ${url}`, `[gmaps] ${gmapsUrl}`].join(" | "),
        };
        const ins = await supabase
          .from("venues")
          .insert(payload)
          .select("id")
          .maybeSingle();
        if (ins.error) {
          note = `error:venue_insert:${ins.error.message}`;
        } else {
          createdId = ins.data?.id ? String(ins.data.id) : null;
          if (createdId) created += 1;
          note = `created:${found.note}`;
        }
      } else {
        note = `dry_run:no_match`;
      }

      const venueId = matchId || createdId;
      if (venueId) {
        if (APPLY) {
          const linkRes = await supabase
            .from("tournament_venues")
            .upsert([{ tournament_id: tournamentId, venue_id: venueId }], { onConflict: "tournament_id,venue_id" });
          if (linkRes.error) {
            note = `${note}|error:link:${linkRes.error.message}`;
          } else {
            didLink = true;
            linked += 1;
          }
        } else {
          didLink = false;
        }
      }
    }

    const row = [
      tournamentId,
      name,
      street,
      city,
      state,
      zip,
      latitude,
      longitude,
      gmapsUrl,
      matchId,
      createdId,
      didLink ? "1" : "0",
      note,
    ].map(csv);
    fs.appendFileSync(outPath, row.join(",") + "\n", "utf8");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        applied: APPLY,
        tournament_id: tournamentId,
        tournament_name: t.name ?? null,
        source_url: url,
        venues_found: venues.length,
        matched,
        created,
        linked,
        outPath,
        note: APPLY ? undefined : "Dry run only (re-run with --apply to insert + link venues).",
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("[ingest-coastal-elite-venues] fatal:", err?.message ?? err);
  process.exit(1);
});

