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
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(
    d.getSeconds()
  )}`;
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

function parseCityStateFromLine(line) {
  const v = clean(line);
  if (!v) return null;
  // Example: "West Linn, OR, US"
  const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const city = clean(parts[0]);
  const state = clean(parts[1])?.toUpperCase() ?? null;
  if (!city || !state || state.length !== 2) return null;
  return { city, state };
}

function parseLatLngFromGmapsEmbedUrl(href) {
  const m = String(href ?? "").match(/[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
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

async function fetchText(url) {
  const resp = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "user-agent": "TI-RI-GotSport-Fields/1.0", accept: "text/html,application/xhtml+xml" },
  });
  if (!resp.ok) return null;
  const text = await resp.text();
  return text || null;
}

function extractVenueIndexRows(html) {
  const out = [];
  const re = /<a[^>]+href="([^"]*\/org_event\/events\/\d+\/fields\?venue=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const href = decodeHtmlText(m[1]);
    const venueId = clean(m[2]);
    const text = decodeHtmlText(m[3]);
    if (!venueId) continue;
    if (!text) continue;
    if (/^\d+$/.test(text)) continue; // field-count link
    out.push({ venueId, href, text });
  }
  const deduped = Array.from(new Map(out.map((r) => [r.venueId, r])).values());
  return deduped;
}

function extractVenueDetails(html) {
  // Scope to the venue widget body: the <h4 class="...no-margin-top..."> name and its following <ul>.
  const headerMatch = html.match(
    /<h4[^>]*class=(?:"[^"]*no-margin-top[^"]*"|'[^']*no-margin-top[^']*')[^>]*>\s*([\s\S]*?)\s*<\/h4>\s*<ul>([\s\S]*?)<\/ul>/i
  );
  const venueName = headerMatch ? decodeHtmlText(headerMatch[1]) : null;
  const ulHtml = headerMatch ? headerMatch[2] : "";

  const liRe = /<li[^>]*>\s*([\s\S]*?)\s*<\/li>/gi;
  const liValues = [];
  let m;
  while ((m = liRe.exec(ulHtml))) {
    const val = decodeHtmlText(m[1]);
    if (val) liValues.push(val);
  }

  const street = clean(liValues[0] ?? null);
  const cityState = parseCityStateFromLine(liValues[1] ?? null);

  const iframeMatch = html.match(/<iframe[^>]+id=(?:"map"|'map')[^>]+src=(?:"([^"]+)"|'([^']+)')[^>]*>/i);
  const iframeSrcRaw = iframeMatch ? decodeHtmlText(iframeMatch[1] ?? iframeMatch[2]) : null;
  const iframeSrc = iframeSrcRaw && iframeSrcRaw.includes("google.com/maps/embed/v1/place") ? iframeSrcRaw : null;
  const latlng = parseLatLngFromGmapsEmbedUrl(iframeSrc);

  return {
    venueName,
    street,
    city: cityState?.city ?? null,
    state: cityState?.state ?? null,
    latitude: latlng?.lat ?? null,
    longitude: latlng?.lng ?? null,
    gmaps_embed_url: iframeSrc,
  };
}

async function main() {
  loadEnvLocal();
  const APPLY = process.argv.includes("--apply");

  const tournamentId = clean(argValue("tournament_id"));
  const url = clean(argValue("url")) ?? "https://system.gotsport.com/org_event/events/41792/fields";
  if (!tournamentId) {
    throw new Error("Missing required arg: --tournament_id=<uuid> (add --apply to write)");
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const tRes = await supabase.from("tournaments").select("id,name,slug,sport,state").eq("id", tournamentId).maybeSingle();
  if (tRes.error) throw tRes.error;
  const t = tRes.data;
  if (!t?.id) throw new Error(`tournament_not_found:${tournamentId}`);

  const tournamentState = clean(t.state)?.toUpperCase() ?? null;
  const tournamentSport = clean(t.sport) ?? null;

  const html = await fetchText(url);
  if (!html) throw new Error(`fetch_failed:${url}`);

  const rows = extractVenueIndexRows(html);

  const outPath = path.resolve(process.cwd(), "tmp", `gotsport_fields_venues_ingest_${stamp()}.csv`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const cols = [
    "tournament_id",
    "venue_id_external",
    "venue_name",
    "address",
    "city",
    "state",
    "latitude",
    "longitude",
    "gotsport_url",
    "matched_venue_id",
    "created_venue_id",
    "linked",
    "note",
  ];
  fs.writeFileSync(outPath, `${cols.join(",")}\n`, "utf8");

  let matched = 0;
  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const row of rows) {
    const venueIdExternal = clean(row.venueId);
    const gotsportHref = clean(row.href);
    const indexName = clean(row.text);

    const detailUrl = gotsportHref ? new URL(gotsportHref, url).toString() : null;
    if (!detailUrl) continue;

    const detailHtml = await fetchText(detailUrl);
    if (!detailHtml) {
      skipped += 1;
      fs.appendFileSync(
        outPath,
        [
          tournamentId,
          venueIdExternal,
          indexName,
          "",
          "",
          tournamentState,
          "",
          "",
          detailUrl,
          "",
          "",
          "",
          "skip:fetch_failed",
        ].map(csv).join(",") + "\n"
      );
      continue;
    }

    const detail = extractVenueDetails(detailHtml);
    const name = clean(detail.venueName) ?? indexName;
    const address = clean(detail.street);
    const city = clean(detail.city);
    const state = clean(detail.state)?.toUpperCase() ?? tournamentState;
    const latitude = typeof detail.latitude === "number" ? detail.latitude : null;
    const longitude = typeof detail.longitude === "number" ? detail.longitude : null;

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
        if (address && !clean(found.venue.address)) patch.address = address;
        if (city && !clean(found.venue.city)) patch.city = city;
        if (state && !clean(found.venue.state)) patch.state = state;
        if (
          typeof latitude === "number" &&
          !Number.isNaN(latitude) &&
          (found.venue.latitude === null || found.venue.latitude === undefined)
        ) {
          patch.latitude = latitude;
        }
        if (
          typeof longitude === "number" &&
          !Number.isNaN(longitude) &&
          (found.venue.longitude === null || found.venue.longitude === undefined)
        ) {
          patch.longitude = longitude;
        }
        const nextNotes = [`[gotsport-fields] ${url}`, `[gotsport-venue] ${detailUrl}`].join(" | ");
        if (!clean(found.venue.notes)) patch.notes = nextNotes;

        if (APPLY && Object.keys(patch).length) {
          const { error: updErr } = await supabase.from("venues").update(patch).eq("id", matchId);
          if (updErr) throw updErr;
        }
      } else if (found.note?.startsWith("ambiguous")) {
        note = found.note;
      } else if (!address || !city) {
        note = "skip:no_address_or_city";
      } else {
        // Secondary exact match on the venues unique key (name+address+city+state) before inserting.
        const exact = await supabase
          .from("venues")
          .select("id,name,address,city,state,zip,latitude,longitude,venue_url,notes")
          .eq("state", state)
          .eq("city", city)
          .ilike("name", name)
          .ilike("address", address)
          .limit(5);
        if (exact.error) throw exact.error;
        const exactRows = (exact.data ?? []).filter((r) => r?.id);
        if (exactRows.length === 1) {
          matchId = String(exactRows[0].id);
          matched += 1;
          note = "exact_name_address_city_state";
        } else if (APPLY) {
          const payload = {
            name,
            address,
            city,
            state,
            sport: tournamentSport,
            latitude,
            longitude,
            notes: [`[gotsport-fields] ${url}`, `[gotsport-venue] ${detailUrl}`].join(" | "),
          };
          const ins = await supabase.from("venues").insert(payload).select("id").single();
          if (ins.error) {
            // If another process inserted the same venue concurrently, resolve by re-selecting.
            if (String(ins.error.code ?? "") === "23505") {
              const again = await supabase
                .from("venues")
                .select("id")
                .eq("state", state)
                .eq("city", city)
                .ilike("name", name)
                .ilike("address", address)
                .limit(1)
                .maybeSingle();
              if (again.error) throw again.error;
              if (again.data?.id) {
                matchId = String(again.data.id);
                matched += 1;
                note = "conflict_resolved_existing";
              } else {
                throw ins.error;
              }
            } else {
              throw ins.error;
            }
          } else {
            createdId = String(ins.data.id);
            created += 1;
          }
        } else {
          createdId = "dry_run";
        }
      }

      const venueIdToLink = matchId || (createdId && createdId !== "dry_run" ? createdId : null);
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
        venueIdExternal,
        name,
        address,
        city,
        state,
        latitude,
        longitude,
        detailUrl,
        matchId,
        createdId,
        didLink ? "yes" : "no",
        note,
      ].map(csv).join(",") + "\n"
    );
  }

  console.log(`[gotsport_fields_venues] tournament=${t?.name ?? tournamentId} apply=${APPLY}`);
  console.log(`[gotsport_fields_venues] url=${url}`);
  console.log(`[gotsport_fields_venues] venues_found=${rows.length} matched=${matched} created=${created} linked=${linked} skipped=${skipped}`);
  console.log(`[gotsport_fields_venues] report=${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
