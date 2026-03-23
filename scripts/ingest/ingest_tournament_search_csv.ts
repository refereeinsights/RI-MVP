import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type CsvRow = Record<string, string>;

type TournamentGroup = {
  key: string;
  tournament_id: string | null;
  tournament_name: string;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  official_url: string | null;
  source_url: string | null;
  organizer_name: string | null;
  director_email: string | null;
  director_phone: string | null;
  venues: Array<{ venue_name: string | null; venue_address: string | null; venue_url: string | null }>;
};

type TournamentDbRow = {
  id: string;
  slug: string | null;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  official_website_url: string | null;
  source_url: string | null;
  tournament_director: string | null;
  tournament_director_email: string | null;
  tournament_director_phone: string | null;
};

type VenueDbRow = {
  id: string;
  name: string | null;
  address: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue_url: string | null;
  sport: string | null;
};

const APPLY = process.argv.includes("--apply");

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}.`);
  return v;
}

function cleanText(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

function cleanOrNull(value: unknown) {
  const v = cleanText(value);
  return v.length ? v : null;
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeState(value: string | null | undefined) {
  const raw = cleanText(value).toUpperCase();
  if (!raw) return null;
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return null;
}

function extractFirstUrl(value: string | null | undefined) {
  const raw = cleanText(value);
  if (!raw) return null;
  // Handles accidental markdown/CSV paste like:
  // [https://example.com,...](https://example.com,...)
  const m = raw.match(/https?:\/\/[^\s\])",]+/i);
  return m ? m[0] : null;
}

function normalizeUrl(value: string | null | undefined) {
  const v = extractFirstUrl(value) ?? cleanText(value);
  if (!v) return null;
  try {
    const u = new URL(v);
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return v.replace(/\/$/, "");
  }
}

function urlDomain(url: string | null) {
  const v = cleanText(url);
  if (!v) return null;
  try {
    return new URL(v).hostname;
  } catch {
    return null;
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function mergeValue<T>(existing: T | null | undefined, next: T | null | undefined) {
  if (existing == null) return next ?? null;
  if (typeof existing === "string" && existing.trim().length === 0) return next ?? null;
  return existing;
}

function splitMulti(value: string | null | undefined) {
  const raw = cleanText(value);
  if (!raw) return [];
  return raw
    .split(/;|\s+\/\s+|\n/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Minimal CSV parser that handles quotes/double-quotes.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\"") {
      const next = line[i + 1];
      if (inQuotes && next === "\"") {
        cur += "\"";
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  const headerNorm = header.map(normalizeHeader);

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    while (cols.length < header.length) cols.push("");
    const row: CsvRow = {};
    for (let c = 0; c < header.length; c++) {
      const key = headerNorm[c] || `col_${c}`;
      row[key] = cols[c] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function pick(row: CsvRow, ...keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim().length) return v;
  }
  return "";
}

type ParsedAddr = {
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

function parseUsAddressLoose(value: string | null | undefined): ParsedAddr | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/^(.+?),\s*([^,]+?),\s*([A-Za-z]{2})(?:\s+(\d{5})(?:-\d{4})?)?\s*$/);
  if (!m) return null;
  const part1 = m[1].trim();
  const city = m[2].trim();
  const state = m[3].toUpperCase();
  const zip = m[4] ? m[4] : null;
  const streetLike = /^[0-9][0-9A-Za-z-]*\s+/.test(part1);
  return { address1: streetLike ? part1 : null, city, state, zip };
}

function buildGroups(rows: CsvRow[]): TournamentGroup[] {
  const groups = new Map<string, TournamentGroup>();

  for (const row of rows) {
    const tournament_id = cleanOrNull(pick(row, "tournament_id", "id"));
    const tournament_name = cleanOrNull(pick(row, "tournament_name", "tournament", "name", "tournament_name_text"));
    if (!tournament_name) continue;

    const sport = cleanOrNull(pick(row, "sport"));
    const city = cleanOrNull(pick(row, "city"));
    const state = normalizeState(cleanOrNull(pick(row, "state")) ?? "") ?? null;
    const start_date = cleanOrNull(pick(row, "start_date", "start", "startdate"));
    const end_date = cleanOrNull(pick(row, "end_date", "end", "enddate"));
    const official_url = normalizeUrl(
      cleanOrNull(pick(row, "tournament_url", "tournament_link", "official_url", "official_website_url", "official")) ?? ""
    );
    const source_url = normalizeUrl(cleanOrNull(pick(row, "source_url", "source")) ?? "") ?? official_url;

    const organizer_name = cleanOrNull(
      pick(row, "organizer_name", "organizer", "tournament_director", "director", "organizer_guess")
    );
    const director_email = cleanOrNull(pick(row, "director_email", "tournament_director_email", "email"));
    const director_phone = cleanOrNull(pick(row, "director_phone", "tournament_director_phone", "phone"));

    const venue_name_raw = cleanOrNull(pick(row, "venue_name", "venue", "venues", "city_venue_name", "city_venue"));
    const venue_address_raw = cleanOrNull(
      pick(row, "venue_address", "address", "venue_addresses", "venue_address_text", "addresses")
    );
    const venue_url_raw = normalizeUrl(
      cleanOrNull(pick(row, "venue_url", "venue_website_url", "venue_link", "facility_url", "map_url")) ?? ""
    );

    const venue_names = venue_name_raw
      ? (venue_name_raw.includes(";") || venue_name_raw.includes("\n") || venue_name_raw.includes(" / ")
          ? splitMulti(venue_name_raw)
          : venue_name_raw.split(",").map((s) => s.trim()).filter(Boolean))
      : [];
    const venue_addrs = splitMulti(venue_address_raw);
    const venue_urls = splitMulti(venue_url_raw);
    const venues: Array<{ venue_name: string | null; venue_address: string | null; venue_url: string | null }> = [];
    if (venue_names.length && venue_addrs.length && venue_names.length === venue_addrs.length) {
      for (let i = 0; i < venue_names.length; i++) {
        venues.push({ venue_name: venue_names[i] ?? null, venue_address: venue_addrs[i] ?? null, venue_url: venue_urls[i] ?? null });
      }
    } else if (venue_names.length && venue_urls.length && venue_names.length === venue_urls.length) {
      for (let i = 0; i < venue_names.length; i++) {
        venues.push({ venue_name: venue_names[i] ?? null, venue_address: null, venue_url: venue_urls[i] ?? null });
      }
    } else if (venue_names.length || venue_addrs.length) {
      venues.push({ venue_name: venue_name_raw, venue_address: venue_address_raw, venue_url: venue_url_raw });
    } else if (venue_urls.length) {
      venues.push({ venue_name: venue_name_raw, venue_address: null, venue_url: venue_url_raw });
    }

    const key =
      tournament_id ??
      official_url ??
      source_url ??
      [normalize(tournament_name), normalize(city), normalize(state), start_date ?? "", end_date ?? "", normalize(sport)].join("|");

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        tournament_id,
        tournament_name,
        sport,
        city,
        state,
        start_date,
        end_date,
        official_url,
        source_url,
        organizer_name,
        director_email,
        director_phone,
        venues,
      });
      continue;
    }

    existing.tournament_id = existing.tournament_id ?? tournament_id;
    existing.sport = existing.sport ?? sport;
    existing.city = existing.city ?? city;
    existing.state = existing.state ?? state;
    existing.start_date = existing.start_date ?? start_date;
    existing.end_date = existing.end_date ?? end_date;
    existing.official_url = existing.official_url ?? official_url;
    existing.source_url = existing.source_url ?? source_url;
    existing.organizer_name = existing.organizer_name ?? organizer_name;
    existing.director_email = existing.director_email ?? director_email;
    existing.director_phone = existing.director_phone ?? director_phone;
    existing.venues.push(...venues);
  }

  return Array.from(groups.values());
}

async function uniqueSlug(supabase: any, base: string) {
  const root = slugify(base) || `tournament-${Date.now()}`;
  let slug = root;
  for (let index = 2; index < 200; index += 1) {
    const { data, error } = await supabase.from("tournaments").select("id").eq("slug", slug).maybeSingle();
    if (error) throw error;
    if (!data?.id) return slug;
    slug = `${root}-${index}`;
  }
  throw new Error(`Could not find unique slug for ${base}`);
}

async function findTournamentMatch(supabase: any, group: TournamentGroup): Promise<TournamentDbRow | null> {
  if (group.tournament_id) {
    const { data, error } = await supabase
      .from("tournaments")
      .select(
        "id,slug,name,sport,city,state,start_date,end_date,official_website_url,source_url,tournament_director,tournament_director_email,tournament_director_phone"
      )
      .eq("id", group.tournament_id)
      .maybeSingle();
    if (error) throw error;
    return (data as TournamentDbRow | null) ?? null;
  }

  const url = group.official_url ?? group.source_url ?? null;
  if (url) {
    const { data, error } = await supabase
      .from("tournaments")
      .select(
        "id,slug,name,sport,city,state,start_date,end_date,official_website_url,source_url,tournament_director,tournament_director_email,tournament_director_phone"
      )
      .or(`official_website_url.eq.${url},source_url.eq.${url}`)
      .limit(5);
    if (error) throw error;
    const arr = (data ?? []) as TournamentDbRow[];
    if (arr.length) return arr[0] ?? null;
  }

  // Fallback fuzzy match.
  let q = supabase
    .from("tournaments")
    .select("id,slug,name,sport,city,state,start_date,end_date,official_website_url,source_url")
    .ilike("name", `%${group.tournament_name}%`)
    .limit(50);
  if (group.state) q = q.eq("state", group.state);
  if (group.city) q = q.ilike("city", `%${group.city}%`);

  const { data, error } = await q;
  if (error) throw error;
  const candidates = ((data ?? []) as TournamentDbRow[]).map((row) => {
    let score = 0;
    if (normalize(row.name) === normalize(group.tournament_name)) score += 10;
    if (normalize(row.city) === normalize(group.city)) score += 3;
    if ((row.state ?? "").toUpperCase() === (group.state ?? "").toUpperCase()) score += 2;
    if ((row.start_date ?? "") === (group.start_date ?? "")) score += 3;
    if ((row.end_date ?? "") === (group.end_date ?? "")) score += 2;
    return { row, score };
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] && candidates[0].score >= 10 ? candidates[0].row : null;
}

async function findVenueMatchByAddress(
  supabase: any,
  params: { address1: string; city: string; state: string }
): Promise<VenueDbRow | null> {
  const { data, error } = await supabase
    .from("venues")
    .select("id,name,address,address1,city,state,zip,venue_url,sport")
    .eq("state", params.state)
    // City casing isn't consistent across sources; filter loosely then match in JS.
    .ilike("city", params.city)
    .limit(200);
  if (error) throw error;
  const addrNorm = normalize(params.address1);
  const candidates = (data ?? []) as VenueDbRow[];
  return (
    candidates.find((v) => normalize(v.address1 || v.address) === addrNorm && normalize(v.city) === normalize(params.city)) ??
    candidates.find((v) => normalize(v.address) === addrNorm && normalize(v.city) === normalize(params.city)) ??
    null
  );
}

async function findVenueMatchByUrl(supabase: any, venueUrl: string): Promise<VenueDbRow | null> {
  const normalizedUrl = normalizeUrl(venueUrl);
  if (!normalizedUrl) return null;
  const { data, error } = await supabase
    .from("venues")
    .select("id,name,address,address1,city,state,zip,venue_url,sport")
    .eq("venue_url", normalizedUrl)
    .maybeSingle();
  if (error) throw error;
  return (data as VenueDbRow | null) ?? null;
}

async function hasExactVenueNameInState(supabase: any, params: { name: string; state: string }) {
  const target = normalize(params.name);
  if (!target) return false;
  const { data, error } = await supabase
    .from("venues")
    .select("id,name")
    .eq("state", params.state)
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as Array<{ name: string | null }>).some((row) => normalize(row.name) === target);
}

async function upsertTournament(supabase: any, group: TournamentGroup, summary: any) {
  const existing = await findTournamentMatch(supabase, group);
  const status = cleanText(argValue("status") ?? "draft");
  const source = cleanText(argValue("source") ?? "external_crawl");
  const sub_type = cleanText(argValue("sub_type") ?? "internet");

  const effectiveStart = group.start_date ?? group.end_date ?? null;
  const effectiveEnd = group.end_date ?? group.start_date ?? null;

  const requiredMissing: string[] = [];
  if (!cleanText(group.tournament_name)) requiredMissing.push("tournament_name");
  if (!cleanText(group.official_url)) requiredMissing.push("tournament_url");
  if (!cleanText(effectiveStart) && !cleanText(effectiveEnd)) requiredMissing.push("start_date/end_date");
  if (!cleanText(group.sport)) requiredMissing.push("sport");
  if (!cleanText(group.state)) requiredMissing.push("state");

  const basePayload: any = {
    name: group.tournament_name,
    sport: group.sport,
    city: group.city,
    state: group.state,
    start_date: effectiveStart,
    end_date: effectiveEnd,
    official_website_url: group.official_url,
    source_url: group.source_url ?? group.official_url,
    source_domain: urlDomain(group.source_url ?? group.official_url ?? null),
    tournament_director: group.organizer_name,
    tournament_director_email: group.director_email,
    tournament_director_phone: group.director_phone,
    sub_type,
    source,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    summary.tournamentsMatched += 1;
    if (!APPLY || !hasFlag("update-existing")) return { id: existing.id, created: false };

    const updatePayload: any = {};
    for (const [key, value] of Object.entries(basePayload)) {
      if (value == null) continue;
      updatePayload[key] = mergeValue((existing as any)[key], value as any);
    }
    const changed = Object.entries(updatePayload).some(([k, v]) => v !== (existing as any)[k]);
    if (!changed) return { id: existing.id, created: false };

    const { error } = await supabase.from("tournaments").update(updatePayload).eq("id", existing.id);
    if (error) throw error;
    summary.tournamentsUpdated += 1;
    return { id: existing.id, created: false };
  }

  if (requiredMissing.length) {
    summary.tournamentsSkipped += 1;
    throw new Error(`Missing required fields for create: ${requiredMissing.join(", ")}`);
  }

  summary.tournamentsCreated += 1;
  if (!APPLY) return { id: `DRY_RUN_${slugify(group.tournament_name)}`, created: true };

  const slug = await uniqueSlug(supabase, `${group.tournament_name}-${group.city ?? ""}-${group.state ?? ""}`);
  const insertPayload: any = {
    ...basePayload,
    slug,
    status,
    is_canonical: true,
    created_at: new Date().toISOString(),
  };
  if (group.tournament_id) insertPayload.id = group.tournament_id;

  const { data, error } = await supabase.from("tournaments").insert(insertPayload).select("id").single();
  if (error || !data?.id) throw error ?? new Error(`Failed to insert tournament ${group.tournament_name}`);
  return { id: String(data.id), created: true };
}

async function upsertVenueAndLink(
  supabase: any,
  tournamentId: string,
  group: TournamentGroup,
  venue: { venue_name: string | null; venue_address: string | null; venue_url: string | null },
  summary: any
) {
  const renameOnMatch = hasFlag("rename-by-address");

  const venueName = cleanOrNull(venue.venue_name);
  const venueAddrText = cleanOrNull(venue.venue_address);
  const venueUrl = normalizeUrl(cleanOrNull(venue.venue_url) ?? "") ?? null;
  if (!venueName && !venueAddrText && !venueUrl) {
    summary.venuesSkipped += 1;
    return;
  }

  // Highest confidence: exact venue_url match.
  let existing: VenueDbRow | null = null;
  if (venueUrl) {
    existing = await findVenueMatchByUrl(supabase, venueUrl);
  }

  // Next: address match (requires city/state anchor).
  const parsed = parseUsAddressLoose(venueAddrText ?? "");
  const address1 = parsed?.address1 ?? null;
  const city = parsed?.city ?? group.city ?? null;
  const state = parsed?.state ?? group.state ?? null;
  const zip = parsed?.zip ?? null;

  // If venue fields are empty (consecutive commas in CSV), do not link to a venue.
  // Also: when we only have a venue_name with no URL/address anchor, skip linking.
  if (!venueUrl && !address1) {
    summary.venuesSkipped += 1;
    return;
  }

  if (!existing?.id && address1 && city && state) {
    existing = await findVenueMatchByAddress(supabase, { address1, city, state });
  }

  // Only create a new venue when we can do so safely:
  // - with a parseable address+city+state, OR
  // - with a venue_url + state + venue_name, and no exact-name match already in that state.
  const canCreateFromAddress = !!(address1 && city && state);
  const canCreateFromUrlOnly = !!(venueUrl && state && venueName);

  if (!existing?.id && !canCreateFromAddress && !canCreateFromUrlOnly) {
    summary.venuesSkipped += 1;
    return;
  }

  let venueId: string;
  if (existing?.id) {
    venueId = existing.id;
    summary.venuesMatched += 1;

    if (APPLY) {
      const nextName = venueName;
      const shouldRename =
        !!nextName &&
        nextName.trim().length > 0 &&
        normalize(existing.name) !== normalize(nextName) &&
        (renameOnMatch || !cleanText(existing.name));
      if (shouldRename) {
        const { error } = await supabase
          .from("venues")
          .update({ name: nextName, updated_at: new Date().toISOString() })
          .eq("id", venueId);
        if (error) throw error;
        summary.venuesUpdated += 1;
      }

      if (venueUrl && !cleanText(existing.venue_url)) {
        const { error } = await supabase
          .from("venues")
          .update({ venue_url: venueUrl, updated_at: new Date().toISOString() })
          .eq("id", venueId);
        if (error) throw error;
        summary.venuesUpdated += 1;
      }
    }
  } else {
    if (APPLY && canCreateFromUrlOnly) {
      const existsName = await hasExactVenueNameInState(supabase, { name: venueName!, state: state! });
      if (existsName) {
        summary.venuesSkipped += 1;
        return;
      }
    }

    summary.venuesCreated += 1;
    if (!APPLY) {
      venueId = `DRY_RUN_${slugify(venueName ?? address1 ?? venueUrl ?? "venue")}`;
    } else {
      const insertPayload: any = {
        name: venueName ?? address1 ?? venueUrl,
        address1: address1 ?? null,
        address: address1 ?? null,
        city: city ?? null,
        state: state ?? null,
        zip: zip ?? null,
        venue_url: venueUrl ?? null,
        sport: group.sport ?? null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("venues").insert(insertPayload).select("id").single();
      if (error || !data?.id) throw error ?? new Error(`Failed to insert venue ${venueName ?? address1 ?? venueUrl}`);
      venueId = String(data.id);
    }
  }

  if (!APPLY) {
    summary.linksUpserted += 1;
    return;
  }

  const { error: linkError } = await supabase
    .from("tournament_venues")
    .upsert({ tournament_id: tournamentId, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
  if (linkError) throw linkError;
  summary.linksUpserted += 1;
}

async function main() {
  const filePath = argValue("file") || argValue("path");
  if (!filePath) {
    throw new Error(
      [
        "Usage:",
        "  npx tsx scripts/ingest/ingest_tournament_search_csv.ts --file=... [--apply]",
        "",
        "Optional flags:",
        "  --apply                 Actually write to Supabase (default is dry-run)",
        "  --update-existing       Fill blank tournament fields on matches",
        "  --rename-by-address     If a venue match is found and name differs, rename venue",
        "                          (also fills missing venue_url on matched venues)",
        "  --status=draft|published  Default draft",
        "  --source=external_crawl   Default external_crawl",
        "  --sub_type=internet       Default internet",
      ].join("\n")
    );
  }

  const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const rows = parseCsv(fs.readFileSync(absPath, "utf8"));
  const groups = buildGroups(rows);
  if (!groups.length) {
    console.log("No tournaments found in CSV.");
    return;
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const summary: any = {
    tournamentsCreated: 0,
    tournamentsMatched: 0,
    tournamentsUpdated: 0,
    tournamentsSkipped: 0,
    venuesCreated: 0,
    venuesMatched: 0,
    venuesUpdated: 0,
    venuesSkipped: 0,
    linksUpserted: 0,
    failures: [] as Array<{ key: string; message: string }>,
  };

  console.log(`${APPLY ? "[APPLY]" : "[DRY-RUN]"} Processing ${groups.length} tournament group(s) from ${absPath}`);

  for (const group of groups) {
    try {
      const tournament = await upsertTournament(supabase, group, summary);
      const venues = group.venues.length ? group.venues : [{ venue_name: null, venue_address: null, venue_url: null }];
      for (const v of venues) {
        if (!v.venue_name && !v.venue_address && !v.venue_url) continue;
        await upsertVenueAndLink(supabase, tournament.id, group, v, summary);
      }
      console.log(`[ok] ${group.tournament_name} -> ${tournament.created ? "created" : "matched"}`);
    } catch (err: any) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err
            ? JSON.stringify(err)
            : String(err);
      summary.failures.push({ key: group.key, message });
      console.error(`[fail] ${group.tournament_name}: ${message}`);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
