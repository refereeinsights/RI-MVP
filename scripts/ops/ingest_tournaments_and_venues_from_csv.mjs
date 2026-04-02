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

function stripMarkdownLinks(line) {
  // Turns: [text](url) -> text
  return String(line ?? "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1];
        if (next === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

function buildSlug(name, state, startDate) {
  const raw = `${name}-${state}-${startDate}`
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140);
  return raw || `tournament-${Date.now()}`;
}

function parseFullAddress(addr) {
  const normalized = String(addr ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  // "3501 High Resort Blvd, Rio Rancho, NM 87124"
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

function sourceDomain(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isGenericTournamentListingUrl(url) {
  const u = clean(url);
  if (!u) return false;
  try {
    const parsed = new URL(u);
    const path = parsed.pathname.replace(/\/+$/, "");
    // Common "directory" / landing pages used by many distinct tournaments.
    if (!path || path === "") return true;
    if (path === "/events") return true;
    if (path === "/event") return true;
    if (path === "/tournaments") return true;
    if (path === "/programs/tournaments") return true;
    return false;
  } catch {
    return false;
  }
}

async function findExistingTournament(supabase, args) {
  const sourceEventId = clean(args.source_event_id);
  if (sourceEventId) {
    const bySourceEventId = await supabase
      .from("tournaments")
      .select("id,slug,name,source_event_id,official_website_url,source_url,start_date,state")
      .eq("source_event_id", sourceEventId)
      .limit(5);
    if (bySourceEventId.error) throw bySourceEventId.error;
    const rows = (bySourceEventId.data ?? []).filter((r) => r?.id);
    if (rows.length === 1) return { tournament: rows[0], note: "source_event_id" };
  }

  const slug = clean(args.slug);
  if (slug) {
    const bySlug = await supabase.from("tournaments").select("id,slug,name").eq("slug", slug).maybeSingle();
    if (bySlug.error) throw bySlug.error;
    if (bySlug.data?.id) return { tournament: bySlug.data, note: "slug" };
  }

  const name = clean(args.name);
  const state = clean(args.state)?.toUpperCase() ?? null;
  const startDate = clean(args.start_date);
  const url = clean(args.official_website_url);

  if (name && state && startDate) {
    const byKey = await supabase
      .from("tournaments")
      .select("id,name,state,start_date,official_website_url,source_url")
      .eq("state", state)
      .eq("start_date", startDate)
      .ilike("name", name)
      .limit(5);
    if (byKey.error) throw byKey.error;
    const rows = (byKey.data ?? []).filter((r) => r?.id);
    if (rows.length === 1) return { tournament: rows[0], note: "name_state_start_date" };
  }

  if (url) {
    if (isGenericTournamentListingUrl(url)) {
      return { tournament: null, note: "generic_url_skip" };
    }
    const byUrl = await supabase
      .from("tournaments")
      .select("id,name,official_website_url,source_url,start_date,state")
      .or(`official_website_url.eq.${url},source_url.eq.${url}`)
      .limit(5);
    if (byUrl.error) throw byUrl.error;
    const rows = (byUrl.data ?? []).filter((r) => r?.id);
    if (rows.length === 1) {
      const hit = rows[0];
      // Some sites use a single "tournaments" landing page as the URL for many events.
      // Avoid incorrectly merging distinct tournaments that share a generic URL.
      const sameStart = startDate && String(hit.start_date ?? "") === startDate;
      const sameName = name && String(hit.name ?? "").toLowerCase().trim() === name.toLowerCase().trim();
      if (sameStart || sameName) return { tournament: hit, note: "url" };
    }
  }

  return { tournament: null, note: "no_match" };
}

async function findExistingVenueFlexible(supabase, args) {
  const name = clean(args.name);
  const address = clean(args.address);
  const city = clean(args.city);
  const state = clean(args.state)?.toUpperCase() ?? null;

  if (address && city && state && name) {
    const run = async (field) => {
      const resp = await supabase
        .from("venues")
        .select("id")
        .eq("state", state)
        .eq("city", city)
        .eq(field, address)
        .ilike("name", name)
        .limit(5);
      if (resp.error) throw resp.error;
      return (resp.data ?? []).filter((r) => r?.id);
    };

    const rows = await run("address");
    if (rows.length === 1) return { venueId: String(rows[0].id), note: "match_address_city_state_name" };
    if (rows.length > 1) return { venueId: String(rows[0].id), note: "match_address_city_state_name_multi" };

    const rowsAlt = await run("address1");
    if (rowsAlt.length === 1) return { venueId: String(rowsAlt[0].id), note: "match_address1_city_state_name" };
    if (rowsAlt.length > 1) return { venueId: String(rowsAlt[0].id), note: "match_address1_city_state_name_multi" };
  }

  if (address && city && state) {
    const run = async (field) => {
      const resp = await supabase
        .from("venues")
        .select("id")
        .eq("state", state)
        .eq("city", city)
        .eq(field, address)
        .limit(5);
      if (resp.error) throw resp.error;
      return (resp.data ?? []).filter((r) => r?.id);
    };

    const rows = await run("address");
    if (rows.length === 1) return { venueId: String(rows[0].id), note: "match_address_city_state" };
    if (rows.length > 1) return { venueId: String(rows[0].id), note: "match_address_city_state_multi" };

    const rowsAlt = await run("address1");
    if (rowsAlt.length === 1) return { venueId: String(rowsAlt[0].id), note: "match_address1_city_state" };
    if (rowsAlt.length > 1) return { venueId: String(rowsAlt[0].id), note: "match_address1_city_state_multi" };
  }

  if (name && city && state) {
    const resp = await supabase
      .from("venues")
      .select("id")
      .eq("state", state)
      .eq("city", city)
      .ilike("name", name)
      .limit(5);
    if (resp.error) throw resp.error;
    const rows = (resp.data ?? []).filter((r) => r?.id);
    if (rows.length === 1) return { venueId: String(rows[0].id), note: "match_name_city_state" };
    if (rows.length > 1) return { venueId: String(rows[0].id), note: "match_name_city_state_multi" };
  }

  return { venueId: null, note: "no_match" };
}

async function ensureVenueFlexible(supabase, args, apply) {
  const name = clean(args.name);
  const state = clean(args.state)?.toUpperCase() ?? null;
  const city = clean(args.city);
  const addressRaw = clean(args.address);

  if (!name || !state) return { venueId: null, note: "missing_name_or_state" };

  const existing = await findExistingVenueFlexible(supabase, { name, address: addressRaw, city, state });
  if (existing.venueId || !apply) return existing;

  const payload = {
    name,
    address: addressRaw,
    city,
    state,
    zip: clean(args.zip),
    sport: clean(args.sport),
    venue_url: clean(args.venue_url),
    updated_at: new Date().toISOString(),
  };
  const inserted = await supabase.from("venues").insert(payload).select("id").single();
  if (inserted.error) throw inserted.error;
  return { venueId: String(inserted.data.id), note: "created" };
}

async function findOrCreateVenue(supabase, args) {
  const name = clean(args.name);
  const addrText = clean(args.address);
  const parsed = parseFullAddress(addrText);

  if (!name || !parsed?.state) return { venueId: null, note: "missing_name_or_address" };

  const exact = await supabase
    .from("venues")
    .select("id,name,address,city,state,zip")
    .eq("state", parsed.state)
    .eq("city", parsed.city)
    .eq("address", parsed.street)
    .ilike("name", name)
    .limit(5);
  if (exact.error) throw exact.error;
  const rows = (exact.data ?? []).filter((r) => r?.id);
  if (rows.length === 1) return { venueId: String(rows[0].id), note: "match_exact" };
  if (rows.length > 1) return { venueId: null, note: "ambiguous_exact" };

  const stateOnly = await supabase
    .from("venues")
    .select("id,name,address,city,state,zip")
    .eq("state", parsed.state)
    .ilike("name", name)
    .limit(5);
  if (stateOnly.error) throw stateOnly.error;
  const stateRows = (stateOnly.data ?? []).filter((r) => r?.id);
  if (stateRows.length === 1) return { venueId: String(stateRows[0].id), note: "match_name_state_single" };
  if (stateRows.length > 1) return { venueId: null, note: "ambiguous_name_state" };

  const payload = {
    name,
    address: parsed.street,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
  };
  const inserted = await supabase.from("venues").insert(payload).select("id").single();
  if (inserted.error) throw inserted.error;
  return { venueId: String(inserted.data.id), note: "created" };
}

async function findVenueMatchOnly(supabase, args) {
  const name = clean(args.name);
  const addrText = clean(args.address);
  const parsed = parseFullAddress(addrText);

  if (!name || !parsed?.state) return { venueId: null, note: "missing_name_or_address" };

  const exact = await supabase
    .from("venues")
    .select("id,name,address,city,state,zip")
    .eq("state", parsed.state)
    .eq("city", parsed.city)
    .eq("address", parsed.street)
    .ilike("name", name)
    .limit(5);
  if (exact.error) throw exact.error;
  const rows = (exact.data ?? []).filter((r) => r?.id);
  if (rows.length === 1) return { venueId: String(rows[0].id), note: "match_exact" };
  if (rows.length > 1) return { venueId: null, note: "ambiguous_exact" };

  const stateOnly = await supabase
    .from("venues")
    .select("id,name,address,city,state,zip")
    .eq("state", parsed.state)
    .ilike("name", name)
    .limit(5);
  if (stateOnly.error) throw stateOnly.error;
  const stateRows = (stateOnly.data ?? []).filter((r) => r?.id);
  if (stateRows.length === 1) return { venueId: String(stateRows[0].id), note: "match_name_state_single" };
  if (stateRows.length > 1) return { venueId: null, note: "ambiguous_name_state" };

  return { venueId: null, note: "no_match" };
}

async function ensureVenue(supabase, args, apply) {
  if (!apply) return await findVenueMatchOnly(supabase, args);
  return await findOrCreateVenue(supabase, args);
}

async function ensureTournament(supabase, args, apply) {
  const { tournament: existingTournament, note: tournamentNote } = await findExistingTournament(supabase, args);
  if (!apply) {
    return {
      tournamentId: existingTournament?.id ? String(existingTournament.id) : null,
      tournamentNote,
      created: false,
      updated: false,
    };
  }

  const tournamentId = existingTournament?.id ? String(existingTournament.id) : null;
  if (tournamentId) {
    const upd = await supabase.from("tournaments").update(args.updatePatch ?? args.patch).eq("id", tournamentId);
    if (upd.error) throw upd.error;
    return { tournamentId, tournamentNote, created: false, updated: true };
  }

  if (args.allowCreate === false) {
    return { tournamentId: null, tournamentNote: `${tournamentNote}|skip_create`, created: false, updated: false };
  }

  const payload = {
    ...(args.createPatch ?? args.patch),
    slug: args.slug,
    created_at: new Date().toISOString(),
  };
  const inserted = await supabase.from("tournaments").insert(payload).select("id").single();
  if (inserted.error) throw inserted.error;
  return { tournamentId: String(inserted.data.id), tournamentNote, created: true, updated: false };
}

async function main() {
  loadEnvLocal();

  const APPLY = process.argv.includes("--apply");
  const NO_CREATE_TOURNAMENTS = process.argv.includes("--no-create-tournaments");
  const inputPath = clean(argValue("input"));
  const outPath =
    clean(argValue("out")) || path.resolve(process.cwd(), "tmp", `ingest_tournaments_and_venues_${stamp()}.csv`);
  const status = clean(argValue("status")) ?? "published";
  const canonicalRaw = clean(argValue("canonical")) ?? "true";
  const isCanonical = canonicalRaw === "1" || canonicalRaw.toLowerCase() === "true" || canonicalRaw.toLowerCase() === "yes";

  if (!inputPath) throw new Error("Missing required arg: --input=<path-to-csv>");

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const rawCsv = fs.readFileSync(inputPath, "utf8");
  const lines = rawCsv
    .split(/\r?\n/)
    .map((l) => stripMarkdownLinks(l).trim())
    .filter((l) => l.length > 0);
  if (!lines.length) throw new Error(`empty_input:${inputPath}`);

  const headerRaw = parseCsvLine(lines[0]).map((h) => clean(h) ?? "");
  const headers = headerRaw.map((h) => normalizeHeader(h));
  const idx = (name) => headers.indexOf(normalizeHeader(name));
  const hasNewFeed =
    idx("tournament_external_id") >= 0 &&
    idx("tournament_name") >= 0 &&
    idx("sport") >= 0 &&
    idx("state") >= 0 &&
    idx("start_date") >= 0 &&
    idx("tournament_url") >= 0 &&
    idx("venue_name") >= 0;

  const hasTournamentUuidVenueFeed =
    idx("tournament_uuid") >= 0 &&
    idx("venue_name") >= 0 &&
    idx("venue_state") >= 0;

  const hasLegacyFeed =
    headers.length >= 9 &&
    headers[0] === "tournament_name" &&
    headers[1] === "sport" &&
    headers[2] === "state" &&
    headers[3] === "start_date" &&
    headers[4] === "end_date" &&
    headers[5] === "website_url" &&
    headers[6] === "director_email" &&
    headers[7] === "venue_name" &&
    headers[8] === "venue_address";

  if (!hasTournamentUuidVenueFeed && !hasNewFeed && !hasLegacyFeed) {
    throw new Error(`unexpected_header: got=${headers.join("|")}`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const reportCols = [
    "row",
    "tournament_id",
    "tournament_name",
    "tournament_slug",
    "tournament_note",
    "tournament_url",
    "venue_id",
    "venue_note",
    "linked",
    "note",
  ];
  fs.writeFileSync(outPath, `${reportCols.join(",")}\n`, "utf8");

  let createdTournaments = 0;
  let updatedTournaments = 0;
  let createdVenues = 0;
  let linked = 0;

  if (hasTournamentUuidVenueFeed) {
    for (let i = 1; i < lines.length; i++) {
      const rowNum = i;
      const fields = parseCsvLine(lines[i]);
      const get = (name) => (idx(name) >= 0 ? clean(fields[idx(name)]) : null);

      const tournament_uuid = get("tournament_uuid");
      const tournament_name = get("tournament_name");
      const venue_name = get("venue_name");
      const venue_address = get("venue_address");
      const venue_city = get("venue_city");
      const venue_state = clean(get("venue_state"))?.toUpperCase() ?? null;
      const venue_zip = get("venue_zip");

      if (!tournament_uuid || !venue_name || !venue_state) {
        fs.appendFileSync(
          outPath,
          [rowNum, tournament_uuid ?? "", tournament_name ?? "", "", "", "", "", "", "", "missing_required_fields"]
            .map(csv)
            .join(",") + "\n"
        );
        continue;
      }

      const { data: tournamentRow, error: tournamentErr } = await supabase
        .from("tournaments")
        .select("id,slug,name")
        .eq("id", tournament_uuid)
        .maybeSingle();

      if (tournamentErr || !tournamentRow?.id) {
        fs.appendFileSync(
          outPath,
          [rowNum, tournament_uuid, tournament_name ?? "", "", "tournament_not_found", "", "", "", "", tournamentErr ? tournamentErr.message : "tournament_not_found"]
            .map(csv)
            .join(",") + "\n"
        );
        continue;
      }

      const tournamentId = String(tournamentRow.id);
      const slug = tournamentRow.slug ?? "";
      const tournamentNote = "match_tournament_id";
      // We only have one venue per row, but keep dedupe in case of repeats.
      const venueRes = await ensureVenueFlexible(
        supabase,
        { name: venue_name, address: venue_address, city: venue_city, state: venue_state, zip: venue_zip },
        APPLY
      );
      const venueId = venueRes.venueId;
      const venueNote = venueRes.note;
      if (venueNote === "created") createdVenues += 1;

      let didLink = false;
      if (APPLY && tournamentId && venueId) {
        const linkRes = await supabase
          .from("tournament_venues")
          .upsert([{ tournament_id: tournamentId, venue_id: venueId }], { onConflict: "tournament_id,venue_id" });
        if (linkRes.error) throw linkRes.error;
        linked += 1;
        didLink = true;
      }

      fs.appendFileSync(
        outPath,
        [
          rowNum,
          tournamentId,
          tournamentRow.name ?? tournament_name ?? "",
          slug,
          tournamentNote,
          "",
          venueId ?? "",
          venueNote,
          didLink ? "1" : "0",
          APPLY ? "" : "dry_run",
        ]
          .map(csv)
          .join(",") + "\n"
      );
    }
  } else if (hasNewFeed) {
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const rowNum = i;
      const fields = parseCsvLine(lines[i]);
      const get = (name) => (idx(name) >= 0 ? clean(fields[idx(name)]) : null);

      const tournament_external_id = get("tournament_external_id");
      const tournament_name = get("tournament_name");
      const sport = get("sport");
      const state = clean(get("state"))?.toUpperCase() ?? null;
      const tournament_city = get("tournament_city");
      const start_date = get("start_date");
      const end_date = get("end_date");
      const tournament_url = get("tournament_url");
      const director_email = get("director_email");

      const venue_name = get("venue_name");
      const venue_normalized_name = get("venue_normalized_name");
      const venue_address = get("venue_address");
      const venue_city = get("venue_city");
      const venue_state = clean(get("venue_state"))?.toUpperCase() ?? null;

      // For this feed, `tournament_url` can be missing; and `start_date` can be missing for update-only records.
      if (!tournament_name || !sport || !state) {
        fs.appendFileSync(
          outPath,
          [rowNum, "", tournament_name ?? "", "", "", tournament_url ?? "", "", "", "", "missing_required_fields"].map(csv).join(",") + "\n"
        );
        continue;
      }

      rows.push({
        rowNum,
        tournament_external_id,
        tournament_name,
        sport,
        state,
        tournament_city,
        start_date,
        end_date,
        tournament_url,
        director_email,
        venue_name,
        venue_normalized_name,
        venue_address,
        venue_city,
        venue_state,
      });
    }

    const byTournament = new Map();
    for (const r of rows) {
      const key = r.tournament_external_id || `${r.tournament_name}|${r.state}|${r.start_date}|${r.tournament_url}`;
      const existing = byTournament.get(key) ?? { key, rows: [] };
      existing.rows.push(r);
      byTournament.set(key, existing);
    }

    for (const group of byTournament.values()) {
      const first = group.rows[0];
      const tournament_name = first.tournament_name;
      const sport = first.sport;
      const state = first.state;
      const start_date = first.start_date;
      const end_date = first.end_date;
      const tournament_url = first.tournament_url;
      const director_email = first.director_email;
      const city = first.tournament_city ?? null;
      const sourceEventId = first.tournament_external_id ?? null;

      const allowCreate = !NO_CREATE_TOURNAMENTS && Boolean(start_date);
      const slug = allowCreate ? buildSlug(tournament_name, state, start_date) : null;
      const officialUrl = tournament_url && !isGenericTournamentListingUrl(tournament_url) ? tournament_url : null;

      const assignIf = (target, field, value) => {
        if (value === null || value === undefined) return;
        if (typeof value === "string" && value.trim() === "") return;
        target[field] = value;
      };

      // For updates: only apply fields we actually have data for (avoid wiping existing values with nulls).
      const tournamentUpdatePatch = { updated_at: new Date().toISOString() };
      assignIf(tournamentUpdatePatch, "name", tournament_name);
      assignIf(tournamentUpdatePatch, "sport", sport);
      assignIf(tournamentUpdatePatch, "city", city);
      assignIf(tournamentUpdatePatch, "state", state);
      assignIf(tournamentUpdatePatch, "start_date", start_date);
      assignIf(tournamentUpdatePatch, "end_date", end_date);
      if (officialUrl) assignIf(tournamentUpdatePatch, "official_website_url", officialUrl);
      assignIf(tournamentUpdatePatch, "source_url", tournament_url);
      assignIf(tournamentUpdatePatch, "source_domain", tournament_url ? sourceDomain(tournament_url) : null);
      assignIf(tournamentUpdatePatch, "sub_type", "website");
      assignIf(tournamentUpdatePatch, "source", "external_crawl");
      if (sourceEventId) assignIf(tournamentUpdatePatch, "source_event_id", sourceEventId);
      if (director_email) assignIf(tournamentUpdatePatch, "tournament_director_email", director_email);

      // For creates: include ingest-config fields.
      const tournamentCreatePatch = {
        ...tournamentUpdatePatch,
        status,
        is_canonical: isCanonical,
        source_event_id: sourceEventId ?? tournament_url ?? slug,
      };
      if (!tournamentCreatePatch.official_website_url) tournamentCreatePatch.official_website_url = officialUrl;

      const tournamentArgs = {
        slug,
        name: tournament_name,
        state,
        start_date,
        official_website_url: officialUrl,
        source_event_id: sourceEventId,
        allowCreate,
        patch: tournamentCreatePatch,
        createPatch: tournamentCreatePatch,
        updatePatch: tournamentUpdatePatch,
      };

      const { tournamentId, tournamentNote, created: tCreated, updated: tUpdated } = await ensureTournament(supabase, tournamentArgs, APPLY);
      if (tCreated) createdTournaments += 1;
      if (tUpdated) updatedTournaments += 1;
      const canLink = Boolean(tournamentId);
      const venueApply = APPLY && canLink;

      const uniqueVenues = new Map();
      for (const r of group.rows) {
        const vn = r.venue_name;
        if (!vn) continue;
        const key = r.venue_normalized_name || `${vn}|${r.venue_city ?? ""}|${r.venue_state ?? ""}|${r.venue_address ?? ""}`;
        if (!uniqueVenues.has(key)) uniqueVenues.set(key, r);
      }

      for (const r of uniqueVenues.values()) {
        const venue_name = r.venue_name;
        if (!venue_name) continue;
        const parsed = parseFullAddress(r.venue_address);
        const venueState = (parsed?.state ?? r.venue_state ?? state)?.toUpperCase() ?? state;
        const venueCity = parsed?.city ?? r.venue_city ?? city;
        const venueZip = parsed?.zip ?? null;
        const venueStreet = parsed?.street ?? clean(r.venue_address);

        const venueRes = await ensureVenueFlexible(
          supabase,
          { name: venue_name, address: venueStreet, city: venueCity, state: venueState, zip: venueZip, sport },
          venueApply
        );
        const venueId = venueRes.venueId;
        const venueNote = venueRes.note;
        if (venueNote === "created") createdVenues += 1;

        let didLink = false;
        if (venueApply && tournamentId && venueId) {
          const linkRes = await supabase
            .from("tournament_venues")
            .upsert([{ tournament_id: tournamentId, venue_id: venueId }], { onConflict: "tournament_id,venue_id" });
          if (linkRes.error) throw linkRes.error;
          linked += 1;
          didLink = true;
        }

        fs.appendFileSync(
          outPath,
          [
            r.rowNum,
            tournamentId ?? "",
            tournament_name,
            slug,
            tournamentNote,
            tournament_url ?? "",
            venueId ?? "",
            venueNote,
            didLink ? "1" : "0",
            APPLY ? "" : "dry_run",
          ]
            .map(csv)
            .join(",") + "\n"
        );
      }
    }
  } else {
    const expectedLen = 9;
    for (let i = 1; i < lines.length; i++) {
      const rowNum = i;
      let fields = parseCsvLine(lines[i]);
      if (fields.length > expectedLen) {
        // Forgiving parse: allow commas in `tournament_name` even if it's not quoted.
        const extra = fields.length - expectedLen;
        const mergedName = fields.slice(0, extra + 1).join(",").trim();
        fields = [mergedName, ...fields.slice(extra + 1)];
      }
      if (fields.length < expectedLen) {
        fs.appendFileSync(outPath, `${[rowNum, "", "", "", "", "", "", "", "", "too_few_columns"].map(csv).join(",")}\n`);
        continue;
      }

      const tournament_name = clean(fields[0]);
      const sport = clean(fields[1]);
      const state = clean(fields[2])?.toUpperCase() ?? null;
      const start_date = clean(fields[3]);
      const end_date = clean(fields[4]);
      const website_url = clean(fields[5]);
      const director_email = clean(fields[6]);
      const venue_name = clean(fields[7]);
      const venue_address = clean(fields[8]);

      if (!tournament_name || !sport || !state || !start_date) {
        fs.appendFileSync(
          outPath,
          `${[rowNum, "", tournament_name ?? "", "", "", website_url ?? "", "", "", "", "missing_required_fields"].map(csv).join(",")}\n`
        );
        continue;
      }

      const slug = buildSlug(tournament_name, state, start_date);
      const parsedVenue = parseFullAddress(venue_address);
      const city = parsedVenue?.city ?? null;
      const zip = parsedVenue?.zip ?? null;

      const tournamentPatch = {
        name: tournament_name,
        sport,
        city,
        state,
        zip,
        start_date,
        end_date,
        official_website_url: website_url,
        source_url: website_url,
        source_domain: website_url ? sourceDomain(website_url) : null,
        sub_type: "website",
        source: "manual",
        status,
        is_canonical: isCanonical,
        tournament_director_email: director_email,
        updated_at: new Date().toISOString(),
        // Keep legacy single-venue fields populated where we can.
        venue: venue_name,
        address: venue_address,
      };

      const tournamentArgs = {
        slug,
        name: tournament_name,
        state,
        start_date,
        official_website_url: website_url,
        allowCreate: !NO_CREATE_TOURNAMENTS,
        patch: tournamentPatch,
      };
      const { tournamentId, tournamentNote, created: tCreated, updated: tUpdated } = await ensureTournament(
        supabase,
        tournamentArgs,
        APPLY
      );
      if (tCreated) createdTournaments += 1;
      if (tUpdated) updatedTournaments += 1;

      let venueId = null;
      let venueNote = "";
      let didLink = false;
      if (venue_name && venue_address) {
        const canLink = Boolean(tournamentId);
        const venueApply = APPLY && canLink;
        const parsedVenue = parseFullAddress(venue_address);
        if (parsedVenue?.street && parsedVenue?.city && parsedVenue?.state) {
          const venueRes = await ensureVenueFlexible(
            supabase,
            {
              name: venue_name,
              address: parsedVenue.street,
              city: parsedVenue.city,
              state: parsedVenue.state,
              zip: parsedVenue.zip,
              sport,
            },
            venueApply
          );
          venueId = venueRes.venueId;
          venueNote = venueRes.note;
          if (venueNote === "created") createdVenues += 1;
        } else {
          venueId = null;
          venueNote = "missing_name_or_address";
        }

        if (venueApply && tournamentId && venueId) {
          const linkRes = await supabase
            .from("tournament_venues")
            .upsert([{ tournament_id: tournamentId, venue_id: venueId }], { onConflict: "tournament_id,venue_id" });
          if (linkRes.error) throw linkRes.error;
          linked += 1;
          didLink = true;
        }
      } else if (venue_name && !venue_address) {
        venueNote = "missing_venue_address";
      } else if (!venue_name && venue_address) {
        venueNote = "missing_venue_name";
      } else {
        venueNote = "no_venue";
      }

      const note = APPLY ? "" : "dry_run";
      fs.appendFileSync(
        outPath,
        [
          rowNum,
          tournamentId ?? "",
          tournament_name,
          slug,
          tournamentNote,
          website_url ?? "",
          venueId ?? "",
          venueNote,
          didLink ? "1" : "0",
          note,
        ]
          .map(csv)
          .join(",") + "\n"
      );
    }
  }

  console.log(`[ingest_csv] report=${outPath}`);
  console.log(`[ingest_csv] apply=${APPLY} created_tournaments=${createdTournaments} updated_tournaments=${updatedTournaments} created_venues=${createdVenues} linked=${linked}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
