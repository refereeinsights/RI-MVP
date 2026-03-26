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
      // case-insensitive exact match first
      .ilike("name", venueName)
      .limit(5);
    if (error) throw error;
    const rows = (data ?? []).filter((r) => r?.id);
    if (rows.length === 1) return { match: rows[0], note: "exact_name_city_state" };
    if (rows.length > 1) return { match: null, note: "ambiguous_exact_name_city_state" };

    // Fallback: single hit with "contains" matching.
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

  // Broader fallback: state-only match (only accept a single unambiguous hit).
  const { data: stateExact, error: stateExactErr } = await supabase
    .from("venues")
    .select("id,name,address,city,state,zip,venue_url")
    .eq("state", state)
    .ilike("name", venueName)
    .limit(5);
  if (stateExactErr) throw stateExactErr;
  const stateExactRows = (stateExact ?? []).filter((r) => r?.id);
  if (stateExactRows.length === 1) return { match: stateExactRows[0], note: cityOk ? "exact_name_state" : "exact_name_state_city_fuzzy" };
  if (stateExactRows.length > 1) return { match: null, note: cityOk ? "ambiguous_exact_name_state" : "ambiguous_exact_name_state_city_fuzzy" };

  const { data: stateFuzzy, error: stateFuzzyErr } = await supabase
    .from("venues")
    .select("id,name,address,city,state,zip,venue_url")
    .eq("state", state)
    .ilike("name", `%${venueName}%`)
    .limit(5);
  if (stateFuzzyErr) throw stateFuzzyErr;
  const stateFuzzyRows = (stateFuzzy ?? []).filter((r) => r?.id);
  if (stateFuzzyRows.length === 1) return { match: stateFuzzyRows[0], note: cityOk ? "fuzzy_name_state_single" : "fuzzy_name_state_single_city_fuzzy" };
  if (stateFuzzyRows.length > 1) return { match: null, note: cityOk ? "ambiguous_fuzzy_name_state" : "ambiguous_fuzzy_name_state_city_fuzzy" };

  return { match: null, note: cityOk ? "no_match" : "no_match_city_fuzzy" };
}

async function loadLinkedTournamentIds(supabase, tournamentIds) {
  const linked = new Set();
  const chunkSize = 80;
  for (let i = 0; i < tournamentIds.length; i += chunkSize) {
    const chunk = tournamentIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("tournament_venues")
      .select("tournament_id")
      .in("tournament_id", chunk)
      .limit(20000);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = row?.tournament_id ? String(row.tournament_id) : "";
      if (id) linked.add(id);
    }
  }
  return linked;
}

async function fetchTournamentPage(supabase, from, to) {
  return await supabase
    .from("tournaments")
    .select("id,name,slug,sport,state,city,zip,start_date,official_website_url,source_url,venue,address")
    .eq("status", "published")
    .eq("is_canonical", true)
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);
}

async function main() {
  loadEnvLocal();

  const APPLY = process.argv.includes("--apply");
  const limit = Math.max(1, Number(argValue("limit") ?? "25") || 25);
  const offset = Math.max(0, Number(argValue("offset") ?? "0") || 0);
  const outPath =
    clean(argValue("out")) ||
    path.resolve(process.cwd(), "tmp", `auto_link_missing_tournament_venues_${stamp()}.csv`);

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const reportCols = [
    "tournament_id",
    "tournament_name",
    "tournament_state",
    "tournament_city",
    "tournament_start_date",
    "tournament_url",
    "inline_venue",
    "inline_address",
    "resolved_street",
    "resolved_city",
    "resolved_state",
    "resolved_zip",
    "venue_id",
    "venue_created",
    "tournament_venues_linked",
    "note",
  ];
  fs.writeFileSync(outPath, `${reportCols.join(",")}\n`, "utf8");

  const pageSize = 500;
  let pageOffset = 0;
  let missingSeen = 0;
  const picked = [];

  while (picked.length < limit) {
    const { data, error } = await fetchTournamentPage(supabase, pageOffset, pageOffset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []).filter((r) => r?.id);
    if (!page.length) break;

    const ids = page.map((r) => String(r.id)).filter(Boolean);
    const linked = await loadLinkedTournamentIds(supabase, ids);

    for (const t of page) {
      if (linked.has(String(t.id))) continue;
      const idx = missingSeen;
      missingSeen += 1;
      if (idx < offset) continue;
      picked.push(t);
      if (picked.length >= limit) break;
    }

    pageOffset += pageSize;
  }

  let linkedCount = 0;
  for (const t of picked) {
    const tournamentId = String(t.id);
    const tournamentName = clean(t.name) ?? clean(t.slug) ?? tournamentId;
    const inlineVenue = clean(t.venue);
    const inlineAddress = clean(t.address);
    const tournamentCity = clean(t.city);
    const tournamentState = clean(t.state)?.toUpperCase() ?? null;
    const tournamentZip = clean(t.zip);
    const tournamentStartDate = clean(t.start_date);
    const tournamentUrl = clean(t.official_website_url) ?? clean(t.source_url);

    let venueId = null;
    let venueCreated = false;
    let linked = false;
    let note = "";

    const parsed = inlineAddress ? parseFullAddress(inlineAddress) : null;
    const resolvedStreet = parsed?.street ?? null;
    const resolvedCity = parsed?.city ?? tournamentCity ?? null;
    const resolvedState = parsed?.state ?? tournamentState ?? null;
    const resolvedZip = parsed?.zip ?? tournamentZip ?? null;

    if (!inlineVenue) {
      note = "skip:no_inline_venue";
    } else if (!resolvedCity || !resolvedState) {
      note = "skip:no_city_state";
    } else {
      // Prefer linking to an existing venue when possible (safer than creating junk venues).
      const found = await findExistingVenueByNameCityState(supabase, {
        name: inlineVenue,
        city: resolvedCity,
        state: resolvedState,
      });
      if (found.match?.id) {
        venueId = String(found.match.id);
        note = `match:${found.note}`;
      } else if (parsed?.street) {
        note = found.note ? `no_existing:${found.note}` : "no_existing";
        const venuePayload = {
          name: inlineVenue,
          address: parsed.street,
          city: resolvedCity,
          state: resolvedState,
          zip: resolvedZip,
          sport: clean(t.sport),
        };
        if (!APPLY) {
          venueId = "(dry_run_create)";
          linked = false;
          venueCreated = false;
          note = `dry_run:create_from_address:${note}`;
        } else {
          const { data: upserted, error: upsertErr } = await supabase
            .from("venues")
            .upsert(venuePayload, { onConflict: "name,address,city,state" })
            .select("id")
            .maybeSingle();
          if (upsertErr) {
            note = `error:venue_upsert:${upsertErr.message}`;
          } else {
            venueId = upserted?.id ? String(upserted.id) : null;
            venueCreated = Boolean(venueId);
          }
        }
      } else {
        note = `skip:no_address:${found.note}`;
      }

      if (venueId && venueId !== "(dry_run_create)" && venueId !== "(dry_run)") {
        if (!APPLY) {
          linked = false;
          if (!note) note = "dry_run";
        } else {
          const { error: linkErr } = await supabase
            .from("tournament_venues")
            .upsert([{ tournament_id: tournamentId, venue_id: venueId }], { onConflict: "tournament_id,venue_id" });
          if (linkErr) {
            note = `error:link:${linkErr.message}`;
          } else {
            linked = true;
            linkedCount += 1;
          }
        }
      }
    }

    const row = [
      tournamentId,
      tournamentName,
      tournamentState,
      tournamentCity,
      tournamentStartDate,
      tournamentUrl,
      inlineVenue,
      inlineAddress,
      resolvedStreet,
      resolvedCity,
      resolvedState,
      resolvedZip,
      venueId,
      venueCreated ? "1" : "0",
      linked ? "1" : "0",
      note,
    ].map(csv);
    fs.appendFileSync(outPath, row.join(",") + "\n", "utf8");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        applied: APPLY,
        outPath,
        pickedMissingTournaments: picked.length,
        linked: linkedCount,
        offset,
        limit,
        note: APPLY ? undefined : "Dry run only (add --apply to write venue + tournament_venues rows).",
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("[auto-link-missing-tournament-venues] fatal:", err?.message ?? err);
  process.exit(1);
});
