import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { load as loadHtml } from "cheerio";

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

function parseFullAddress(addr) {
  const normalized = String(addr ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const m = normalized.match(
    /^(.+?),\s*([A-Za-z.\s]{2,60}),\s*([A-Z]{2})(?:\s*,?\s*(\d{5}(?:-\d{4})?))?(?:\s*,?\s*([A-Z]{2}))?\s*$/
  );
  if (!m) return null;
  const street = String(m[1] ?? "").trim();
  const city = String(m[2] ?? "").trim();
  const state = String(m[3] ?? "").trim().toUpperCase();
  const zip = m[4] ? String(m[4]).trim() : null;
  const trailingState = m[5] ? String(m[5]).trim().toUpperCase() : null;
  if (trailingState && trailingState !== state) return null;
  if (!street || !city || !state) return null;
  return { street, city, state, zip };
}

function looksLikeSpecificCity(value) {
  const v = clean(value);
  if (!v) return false;
  const lower = v.toLowerCase();
  if (lower.includes("area") || lower.includes("metro") || lower.includes("various")) return false;
  if (/[()/]/.test(v)) return false;
  if (v.length > 40) return false;
  return true;
}

async function findExistingVenueByNameCityState(supabase, args) {
  const venueName = clean(args.name);
  const city = clean(args.city);
  const state = clean(args.state)?.toUpperCase() ?? null;
  if (!venueName || !state) return { match: null, note: "no_name_or_state" };
  const cityOk = looksLikeSpecificCity(city);

  if (cityOk) {
    const { data, error } = await supabase
      .from("venues")
      .select("id,name,address,city,state,zip,venue_url")
      .eq("state", state)
      .eq("city", city)
      .ilike("name", venueName)
      .limit(5);
    if (error) throw error;
    const rows = (data ?? []).filter((r) => r?.id);
    if (rows.length === 1) return { match: rows[0], note: "exact_name_city_state" };
    if (rows.length > 1) return { match: null, note: "ambiguous_exact_name_city_state" };

    const { data: fuzzy, error: fuzzyErr } = await supabase
      .from("venues")
      .select("id,name,address,city,state,zip,venue_url")
      .eq("state", state)
      .eq("city", city)
      .ilike("name", `%${venueName}%`)
      .limit(5);
    if (fuzzyErr) throw fuzzyErr;
    const fuzzyRows = (fuzzy ?? []).filter((r) => r?.id);
    if (fuzzyRows.length === 1) return { match: fuzzyRows[0], note: "fuzzy_name_city_state_single" };
    if (fuzzyRows.length > 1) return { match: null, note: "ambiguous_fuzzy_name_city_state" };
  }

  const { data: stateExact, error: stateExactErr } = await supabase
    .from("venues")
    .select("id,name,address,city,state,zip,venue_url")
    .eq("state", state)
    .ilike("name", venueName)
    .limit(5);
  if (stateExactErr) throw stateExactErr;
  const stateExactRows = (stateExact ?? []).filter((r) => r?.id);
  if (stateExactRows.length === 1)
    return { match: stateExactRows[0], note: cityOk ? "exact_name_state" : "exact_name_state_city_fuzzy" };
  if (stateExactRows.length > 1)
    return { match: null, note: cityOk ? "ambiguous_exact_name_state" : "ambiguous_exact_name_state_city_fuzzy" };

  const { data: stateFuzzy, error: stateFuzzyErr } = await supabase
    .from("venues")
    .select("id,name,address,city,state,zip,venue_url")
    .eq("state", state)
    .ilike("name", `%${venueName}%`)
    .limit(5);
  if (stateFuzzyErr) throw stateFuzzyErr;
  const stateFuzzyRows = (stateFuzzy ?? []).filter((r) => r?.id);
  if (stateFuzzyRows.length === 1)
    return { match: stateFuzzyRows[0], note: cityOk ? "fuzzy_name_state_single" : "fuzzy_name_state_single_city_fuzzy" };
  if (stateFuzzyRows.length > 1)
    return { match: null, note: cityOk ? "ambiguous_fuzzy_name_state" : "ambiguous_fuzzy_name_state_city_fuzzy" };

  return { match: null, note: cityOk ? "no_match" : "no_match_city_fuzzy" };
}

function decodeHtmlEntities(input) {
  const s = String(input ?? "");
  return s
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function extractLatLonFromPbUrl(url) {
  const m = String(url).match(/!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function extractAddressFromPbUrl(url) {
  const m = String(url).match(/!2s([^!]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).replace(/\s+/g, " ").trim();
  } catch {
    return null;
  }
}

function stateFromNominatimAddress(address, extra) {
  const rawStateCode = clean(address?.state_code);
  if (rawStateCode && rawStateCode.length === 2) return rawStateCode.toUpperCase();
  const iso = clean(address?.["ISO3166-2-lvl4"] || address?.["ISO3166-2-lvl3"] || address?.["ISO3166-2-lvl5"]);
  if (iso && iso.startsWith("US-") && iso.length === 5) return iso.slice(3).toUpperCase();
  const countryCode = clean(address?.country_code || extra?.country_code);
  const stateName = clean(address?.state);
  if (countryCode?.toLowerCase() === "us" && stateName?.toLowerCase() === "california") return "CA";
  return null;
}

function cityFromNominatimAddress(address) {
  return (
    clean(address?.city) ||
    clean(address?.town) ||
    clean(address?.village) ||
    clean(address?.hamlet) ||
    clean(address?.suburb) ||
    clean(address?.county) ||
    null
  );
}

function streetFromNominatim(rev) {
  const address = rev?.address ?? {};
  const house = clean(address?.house_number);
  const road = clean(address?.road) || clean(address?.pedestrian) || clean(address?.path);
  if (house && road) return `${house} ${road}`;
  if (road) return road;
  return clean(rev?.display_name) || null;
}

async function reverseGeocodeNominatim(lat, lon) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "RI_MVP venue linker (nominatim reverse; contact: ops@ri-mvp.local)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`nominatim_reverse_failed:${res.status}`);
  return await res.json();
}

function extractVenueNamesInOrder(html) {
  const $ = loadHtml(String(html ?? ""));
  const names = [];
  const seen = new Set();
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    if (text.toLowerCase() === "venues") return;
    if (seen.has(text)) return;
    if (text.length < 4 || text.length > 80) return;
    seen.add(text);
    names.push(text);
  });
  return names;
}

function extractEmbedUrlsInOrder(html) {
  const re = new RegExp("https://www\\.google\\.com/maps/embed\\?pb=[^\\\"'<>\\s]+", "g");
  return [...html.matchAll(re)]
    .map((m) => m[0])
    .map((u) => decodeHtmlEntities(u))
    .map((u) => u.replace(/\"$/, "").replace(/&quot;$/, "").trim());
}

async function main() {
  loadEnvLocal();

  const APPLY = process.argv.includes("--apply");
  const tournamentId = clean(argValue("tournament-id"));
  const sourceUrl = clean(argValue("url")) || "https://swallowscup.com/venues";
  const outPath =
    clean(argValue("out")) || path.resolve(process.cwd(), "tmp", `link_swallowscup_venues_${stamp()}.csv`);

  if (!tournamentId) throw new Error("Missing --tournament-id=<uuid>");

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: tournament, error: tournamentErr } = await supabase
    .from("tournaments")
    .select("id,name,sport,state,city,start_date,end_date")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tournamentErr) throw tournamentErr;
  if (!tournament?.id) throw new Error(`Tournament not found: ${tournamentId}`);

  const res = await fetch(sourceUrl, { headers: { "User-Agent": "RI_MVP venue linker" } });
  if (!res.ok) throw new Error(`Failed to fetch venues page (${res.status}): ${sourceUrl}`);
  const html = await res.text();

  const venueNames = extractVenueNamesInOrder(html);
  const embedUrls = extractEmbedUrlsInOrder(html);
  if (!venueNames.length) throw new Error("No venue names found on page.");
  if (venueNames.length !== embedUrls.length) {
    throw new Error(`Mismatch: venueNames=${venueNames.length} embedUrls=${embedUrls.length}`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const reportCols = [
    "tournament_id",
    "venue_name",
    "venue_id",
    "venue_created",
    "tournament_venues_linked",
    "resolved_address",
    "resolved_city",
    "resolved_state",
    "resolved_zip",
    "lat",
    "lon",
    "note",
  ];
  fs.writeFileSync(outPath, `${reportCols.join(",")}\n`, "utf8");

  let linkedCount = 0;
  let createdCount = 0;
  let matchedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < venueNames.length; i += 1) {
    const venueName = venueNames[i];
    const embedUrl = embedUrls[i];
    const coords = extractLatLonFromPbUrl(embedUrl);

    const embeddedAddress = extractAddressFromPbUrl(embedUrl);
    const parsed = parseFullAddress(embeddedAddress);

    let street = parsed?.street ?? null;
    let city = parsed?.city ?? null;
    let state = parsed?.state ?? null;
    let zip = parsed?.zip ?? null;
    let note = "";

    if (!street || !city || !state) {
      if (coords?.lat && coords?.lon) {
        try {
          const rev = await reverseGeocodeNominatim(coords.lat, coords.lon);
          const addr = rev?.address ?? {};
          const inferredState = stateFromNominatimAddress(addr, rev);
          const inferredCity = cityFromNominatimAddress(addr);
          const inferredStreet = streetFromNominatim(rev);
          street = street ?? inferredStreet;
          city = city ?? inferredCity;
          state = state ?? inferredState;
          zip = zip ?? clean(addr?.postcode);
          note = note ? `${note}|reverse_geocoded` : "reverse_geocoded";
        } catch (e) {
          note = note ? `${note}|reverse_geocode_failed` : "reverse_geocode_failed";
        }
      } else {
        note = note ? `${note}|no_coords` : "no_coords";
      }
    }

    // Fallback for Swallows Cup (all venues are in CA).
    if (!state) state = clean(tournament.state)?.toUpperCase() ?? "CA";

    let venueId = null;
    let venueCreated = false;
    let linked = false;

    if (!street || !city || !state) {
      skippedCount += 1;
      note = note ? `${note}|skip:missing_address_or_city_or_state` : "skip:missing_address_or_city_or_state";
    } else {
      const found = await findExistingVenueByNameCityState(supabase, { name: venueName, city, state });
      if (found.match?.id) {
        venueId = String(found.match.id);
        matchedCount += 1;
        note = note ? `${note}|match:${found.note}` : `match:${found.note}`;
      } else if (APPLY) {
        const venuePayload = {
          name: venueName,
          address: street,
          city,
          state,
          zip,
          sport: clean(tournament.sport) ?? "soccer",
        };
        const { data: upserted, error: upsertErr } = await supabase
          .from("venues")
          .upsert(venuePayload, { onConflict: "name,address,city,state" })
          .select("id")
          .maybeSingle();
        if (upsertErr) {
          note = note ? `${note}|error:venue_upsert:${upsertErr.message}` : `error:venue_upsert:${upsertErr.message}`;
        } else {
          venueId = upserted?.id ? String(upserted.id) : null;
          venueCreated = Boolean(venueId);
          if (venueCreated) createdCount += 1;
        }
      } else {
        note = note ? `${note}|dry_run:create` : "dry_run:create";
      }

      if (venueId && APPLY) {
        const { error: linkErr } = await supabase
          .from("tournament_venues")
          .upsert([{ tournament_id: tournamentId, venue_id: venueId }], { onConflict: "tournament_id,venue_id" });
        if (linkErr) {
          note = note ? `${note}|error:link:${linkErr.message}` : `error:link:${linkErr.message}`;
        } else {
          linked = true;
          linkedCount += 1;
        }
      } else if (venueId && !APPLY) {
        note = note ? `${note}|dry_run:link` : "dry_run:link";
      }
    }

    const row = [
      tournamentId,
      venueName,
      venueId,
      venueCreated ? "1" : "0",
      linked ? "1" : "0",
      street,
      city,
      state,
      zip,
      coords?.lat ?? null,
      coords?.lon ?? null,
      note || null,
    ].map(csv);
    fs.appendFileSync(outPath, row.join(",") + "\n", "utf8");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        applied: APPLY,
        tournament: { id: tournamentId, name: tournament.name, sport: tournament.sport, state: tournament.state },
        sourceUrl,
        venuesSeen: venueNames.length,
        linked: linkedCount,
        matched: matchedCount,
        created: createdCount,
        skipped: skippedCount,
        outPath,
        note: APPLY ? undefined : "Dry run only (add --apply to write venues + tournament_venues rows).",
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
