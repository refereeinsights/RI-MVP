import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type InputRow = {
  tournament_name: string;
  sport: string;
  state: string;
  venue_name: string;
  venue_address: string;
  start_date: string;
  end_date: string;
  official_url: string;
  tournament_director: string;
  director_email: string;
  director_phone: string;
  notes: string;
};

type TournamentGroup = {
  tournamentName: string;
  sport: string | null;
  startDate: string | null;
  endDate: string | null;
  officialWebsiteUrl: string | null;
  tournamentDirectorContact: string | null;
  tournamentDirectorEmail: string | null;
  tournamentDirectorPhone: string | null;
  state: string | null;
  summary: string | null;
  venues: Array<{
    name: string | null;
    address1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    venueUrl: string | null;
  }>;
};

type VenueRow = {
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

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}.`);
  return v;
}

function clean(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  return v.length ? v : null;
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSport(value: string | null | undefined) {
  const v = normalize(value);
  return v || null;
}

function normalizeState(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return null;
}

function normalizeUrl(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    u.hash = "";
    // Keep query params; many tournament sites use them.
    return u.toString().replace(/\/$/, "");
  } catch {
    return v.replace(/\/$/, "");
  }
}

function splitSlash(value: string | null | undefined) {
  return (value ?? "")
    .split(" / ")
    .map((s) => s.trim())
    .filter(Boolean);
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

  // "Street, City, ST 12345" OR "Place, City, ST" (no zip) OR "Street, City, ST" (no zip)
  const m = raw.match(/^(.+?),\s*([^,]+?),\s*([A-Za-z]{2})(?:\s+(\d{5})(?:-\d{4})?)?\s*$/);
  if (!m) return null;

  const part1 = m[1].trim();
  const city = m[2].trim();
  const state = m[3].toUpperCase();
  const zip = m[4] ? m[4] : null;

  // Only treat it as a street address if it looks like one.
  const streetLike = /^[0-9][0-9A-Za-z-]*\s+/.test(part1);
  return { address1: streetLike ? part1 : null, city, state, zip };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(content: string): InputRow[] {
  const lines = content.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith("Tournament Name,"));
  if (headerIdx === -1) throw new Error('Could not find header row starting with "Tournament Name,"');

  const header = parseCsvLine(lines[headerIdx]);
  const idx = (name: string) => header.indexOf(name);

  const nameIdx = idx("Tournament Name");
  const sportIdx = idx("Sport");
  const stateIdx = idx("State");
  const venueNameIdx = idx("City / Venue Name");
  const venueAddrIdx = idx("Venue Address");
  const startIdx = idx("Start Date");
  const endIdx = idx("End Date");
  const urlIdx = idx("Official URL");
  const directorIdx = idx("Tournament Director");
  const directorEmailIdx = idx("Director Email");
  const directorPhoneIdx = idx("Director Phone");
  const notesIdx = idx("Notes");

  if (
    [nameIdx, sportIdx, stateIdx, venueNameIdx, venueAddrIdx, startIdx, endIdx, urlIdx, directorIdx, directorEmailIdx, directorPhoneIdx, notesIdx].some(
      (v) => v < 0
    )
  ) {
    throw new Error("CSV header is missing one or more required columns.");
  }

  const rows: InputRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cols = parseCsvLine(line);
    // Defensive: pad short lines.
    while (cols.length < header.length) cols.push("");

    rows.push({
      tournament_name: cols[nameIdx] ?? "",
      sport: cols[sportIdx] ?? "",
      state: cols[stateIdx] ?? "",
      venue_name: cols[venueNameIdx] ?? "",
      venue_address: cols[venueAddrIdx] ?? "",
      start_date: cols[startIdx] ?? "",
      end_date: cols[endIdx] ?? "",
      official_url: cols[urlIdx] ?? "",
      tournament_director: cols[directorIdx] ?? "",
      director_email: cols[directorEmailIdx] ?? "",
      director_phone: cols[directorPhoneIdx] ?? "",
      notes: cols[notesIdx] ?? "",
    });
  }
  return rows;
}

function buildVenuePairs(row: InputRow): Array<{ name: string; address: string }> {
  const names = splitSlash(row.venue_name);
  const addrs = splitSlash(row.venue_address);

  if (names.length === 0 || addrs.length === 0) return [];

  if (names.length === addrs.length) {
    return names.map((n, i) => ({ name: n, address: addrs[i] ?? "" })).filter((p) => p.name && p.address);
  }

  // If we have 1 name but multiple addresses, use the address "place name" as the venue name when it's not a street address.
  if (names.length === 1 && addrs.length > 1) {
    const fallback = names[0]!;
    return addrs
      .map((a) => {
        const parsed = parseUsAddressLoose(a);
        const firstToken = a.split(",")[0]?.trim() || "";
        const streetLike = parsed?.address1 != null;
        const name = streetLike ? fallback : firstToken || fallback;
        return { name, address: a };
      })
      .filter((p) => p.name && p.address);
  }

  // If we have multiple venue names but only one address, keep it as a single composite venue (avoid guessing multiple distinct locations).
  if (names.length > 1 && addrs.length === 1) {
    return [{ name: names.join(" / "), address: addrs[0]! }];
  }

  // Fallback: treat it as one venue row.
  return [{ name: row.venue_name, address: row.venue_address }].filter((p) => p.name && p.address);
}

function buildGroups(rows: InputRow[]): TournamentGroup[] {
  const grouped = new Map<string, TournamentGroup>();

  for (const r of rows) {
    const tournamentName = clean(r.tournament_name);
    if (!tournamentName) continue;

    const sport = normalizeSport(r.sport);
    const state = normalizeState(r.state);
    const startDate = clean(r.start_date);
    const endDate = clean(r.end_date);
    const officialWebsiteUrl = normalizeUrl(r.official_url);
    const director = clean(r.tournament_director);
    const directorEmail = clean(r.director_email);
    const directorPhone = clean(r.director_phone);
    const summary = clean(r.notes);

    const key = [officialWebsiteUrl ?? "", tournamentName, startDate ?? "", endDate ?? "", sport ?? ""].join("|");
    if (!grouped.has(key)) {
      grouped.set(key, {
        tournamentName,
        sport,
        startDate,
        endDate,
        officialWebsiteUrl,
        tournamentDirectorContact: director,
        tournamentDirectorEmail: directorEmail,
        tournamentDirectorPhone: directorPhone,
        state,
        summary,
        venues: [],
      });
    } else {
      const g = grouped.get(key)!;
      g.tournamentDirectorContact = g.tournamentDirectorContact ?? director;
      g.tournamentDirectorEmail = g.tournamentDirectorEmail ?? directorEmail;
      g.tournamentDirectorPhone = g.tournamentDirectorPhone ?? directorPhone;
      g.summary = g.summary ?? summary;
      g.state = g.state ?? state;
      g.sport = g.sport ?? sport;
      g.startDate = g.startDate ?? startDate;
      g.endDate = g.endDate ?? endDate;
      g.officialWebsiteUrl = g.officialWebsiteUrl ?? officialWebsiteUrl;
    }

    const g = grouped.get(key)!;
    for (const pair of buildVenuePairs(r)) {
      const parsed = parseUsAddressLoose(pair.address);
      if (!parsed?.city || !parsed.state) {
        // If we cannot reliably parse city/state, still keep the name (match by name+state is too risky).
        continue;
      }
      g.venues.push({
        name: clean(pair.name),
        address1: parsed.address1,
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
        venueUrl: null,
      });
    }
  }

  return [...grouped.values()];
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function uniqueSlug(supabase: any, baseSlug: string) {
  const root = slugify(baseSlug) || `tournament-${Date.now()}`;
  let slug = root;
  for (let index = 2; index < 100; index += 1) {
    const { data } = await supabase.from("tournaments").select("id").eq("slug", slug).maybeSingle();
    if (!data?.id) return slug;
    slug = `${root}-${index}`;
  }
  throw new Error(`Could not find unique slug for ${baseSlug}`);
}

function pickFirstVenue(venues: TournamentGroup["venues"]) {
  return venues.find((v) => v && (v.address1 || v.city || v.state)) ?? null;
}

async function findTournamentMatch(supabase: any, group: TournamentGroup) {
  if (group.officialWebsiteUrl) {
    const { data } = await supabase
      .from("tournaments")
      .select("id,slug,name,city,state,start_date,end_date,official_website_url,source_url,summary,tournament_director,tournament_director_email,tournament_director_phone")
      .or(`official_website_url.eq.${group.officialWebsiteUrl},source_url.eq.${group.officialWebsiteUrl}`)
      .limit(5);
    if (data?.length) return data[0];
  }

  const firstVenue = pickFirstVenue(group.venues);
  let query = supabase
    .from("tournaments")
    .select("id,slug,name,city,state,start_date,end_date,official_website_url,source_url,summary,tournament_director,tournament_director_email,tournament_director_phone")
    .ilike("name", `%${group.tournamentName}%`)
    .limit(20);

  if (firstVenue?.state) query = query.eq("state", firstVenue.state);
  if (firstVenue?.city) query = query.ilike("city", `%${firstVenue.city}%`);

  const { data } = await query;
  const candidates = (data ?? []).map((row: any) => {
    let score = 0;
    if (normalize(row.name) === normalize(group.tournamentName)) score += 10;
    if (normalize(row.city) === normalize(firstVenue?.city)) score += 3;
    if ((row.state ?? "").toUpperCase() === (firstVenue?.state ?? "").toUpperCase()) score += 2;
    if ((row.start_date ?? "") === (group.startDate ?? "")) score += 3;
    if ((row.end_date ?? "") === (group.endDate ?? "")) score += 2;
    return { row, score };
  });
  candidates.sort((a: any, b: any) => b.score - a.score);
  return candidates[0] && candidates[0].score >= 10 ? candidates[0].row : null;
}

function mergeValue<T>(existing: T | null | undefined, next: T | null | undefined) {
  if (existing == null || (typeof existing === "string" && !existing.trim())) return next ?? null;
  return existing;
}

async function findVenueMatch(supabase: any, venue: any) {
  if (!venue.name && !venue.address1) return null;
  let query = supabase.from("venues").select("id,name,address,address1,city,state,zip,venue_url,sport").limit(100);
  if (venue.city) query = query.eq("city", venue.city);
  if (venue.state) query = query.eq("state", venue.state);
  const { data } = await query;
  const exact = (data ?? []).find((row: any) => {
    const nameMatch = venue.name && normalize(row.name) === normalize(venue.name);
    const addressMatch =
      venue.address1 &&
      (normalize(row.address1) === normalize(venue.address1) || normalize(row.address) === normalize(venue.address1));
    if (venue.address1) return !!nameMatch && !!addressMatch;
    return !!nameMatch && normalize(row.city) === normalize(venue.city) && normalize(row.state) === normalize(venue.state);
  });
  return exact ?? null;
}

async function upsertTournament(supabase: any, group: TournamentGroup, summary: any) {
  const firstVenue = pickFirstVenue(group.venues);
  const sourceDomain = group.officialWebsiteUrl ? new URL(group.officialWebsiteUrl).hostname : null;
  const basePayload: any = {
    name: group.tournamentName,
    sport: group.sport,
    start_date: group.startDate,
    end_date: group.endDate,
    official_website_url: group.officialWebsiteUrl,
    source_url: group.officialWebsiteUrl,
    source_domain: sourceDomain,
    tournament_director: group.tournamentDirectorContact,
    tournament_director_email: group.tournamentDirectorEmail,
    tournament_director_phone: group.tournamentDirectorPhone,
    state: firstVenue?.state ?? group.state ?? null,
    city: firstVenue?.city ?? null,
    zip: firstVenue?.zip ?? null,
    venue: firstVenue?.name ?? null,
    address: firstVenue?.address1 ?? null,
    summary: group.summary,
    sub_type: "website",
    source: "manual_research",
    status: "published",
    is_canonical: true,
    updated_at: new Date().toISOString(),
  };

  const existing = await findTournamentMatch(supabase, group);
  if (existing?.id) {
    if (!APPLY) {
      summary.tournamentsMatched += 1;
      return { id: existing.id, slug: existing.slug ?? null, created: false };
    }

    const updatePayload: any = {};
    for (const [key, value] of Object.entries(basePayload)) {
      if (typeof value === "undefined") continue;
      if (value == null) continue;

      // Only fill blanks for certain free-text fields.
      if (key === "summary") {
        updatePayload[key] = mergeValue(existing.summary, value as any);
        continue;
      }
      if (key === "tournament_director") {
        updatePayload[key] = mergeValue(existing.tournament_director, value as any);
        continue;
      }
      if (key === "tournament_director_email") {
        updatePayload[key] = mergeValue(existing.tournament_director_email, value as any);
        continue;
      }
      if (key === "tournament_director_phone") {
        updatePayload[key] = mergeValue(existing.tournament_director_phone, value as any);
        continue;
      }

      // For most fields, keep existing unless it's blank.
      updatePayload[key] = mergeValue((existing as any)[key], value as any);
    }

    const changed = Object.entries(updatePayload).some(([k, v]) => v !== (existing as any)[k]);
    if (!changed) {
      summary.tournamentsMatched += 1;
      return { id: existing.id, slug: existing.slug ?? null, created: false };
    }

    const { error } = await supabase.from("tournaments").update(updatePayload).eq("id", existing.id);
    if (error) throw error;
    summary.tournamentsUpdated += 1;
    return { id: existing.id, slug: existing.slug ?? null, created: false };
  }

  if (!APPLY) {
    summary.tournamentsCreated += 1;
    return { id: `DRY_RUN_${slugify(group.tournamentName)}`, slug: null, created: true };
  }

  const slug = await uniqueSlug(supabase, `${group.tournamentName}-${firstVenue?.city ?? ""}-${firstVenue?.state ?? ""}`);
  const insertPayload = {
    ...basePayload,
    slug,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("tournaments").insert(insertPayload).select("id,slug").single();
  if (error || !data?.id) throw error ?? new Error(`Failed to insert tournament ${group.tournamentName}`);
  summary.tournamentsCreated += 1;
  return { id: data.id, slug: data.slug ?? null, created: true };
}

async function upsertVenue(supabase: any, tournamentId: string, venue: any, sport: string | null, summary: any) {
  if (!venue.name && !venue.address1) {
    summary.venuesSkipped += 1;
    return null;
  }

  const existing = await findVenueMatch(supabase, venue);
  let venueId: string;

  if (existing?.id) {
    if (!APPLY) {
      summary.venuesMatched += 1;
      venueId = existing.id;
    } else {
      const updatePayload = {
        name: mergeValue(existing.name, venue.name),
        address1: mergeValue(existing.address1, venue.address1),
        address: mergeValue(existing.address1 ?? existing.address, venue.address1),
        city: mergeValue(existing.city, venue.city),
        state: mergeValue(existing.state, venue.state),
        zip: mergeValue(existing.zip, venue.zip),
        venue_url: mergeValue(existing.venue_url, venue.venueUrl),
        sport: mergeValue(existing.sport, sport),
      };
      const changed = Object.entries(updatePayload).some(([key, value]) => value !== (existing as any)[key]);
      if (changed) {
        const { error } = await supabase.from("venues").update(updatePayload).eq("id", existing.id);
        if (error) throw error;
        summary.venuesUpdated += 1;
      } else {
        summary.venuesMatched += 1;
      }
      venueId = existing.id;
    }
  } else {
    if (!APPLY) {
      summary.venuesCreated += 1;
      venueId = `DRY_RUN_${slugify(venue.name ?? venue.address1 ?? "venue")}`;
    } else {
      const insertPayload = {
        name: venue.name,
        address1: venue.address1,
        address: venue.address1,
        city: venue.city,
        state: venue.state,
        zip: venue.zip,
        venue_url: venue.venueUrl,
        sport,
      };
      const { data, error } = await supabase.from("venues").insert(insertPayload).select("id").single();
      if (error || !data?.id) throw error ?? new Error(`Failed to insert venue ${venue.name ?? venue.address1}`);
      summary.venuesCreated += 1;
      venueId = data.id;
    }
  }

  if (!APPLY) {
    summary.linksUpserted += 1;
    return venueId;
  }

  const { error: linkError } = await supabase
    .from("tournament_venues")
    .upsert({ tournament_id: tournamentId, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
  if (linkError) throw linkError;
  summary.linksUpserted += 1;
  return venueId;
}

async function main() {
  const filePath = argValue("file") || argValue("path");
  if (!filePath) {
    throw new Error("Usage: npx tsx scripts/ingest/import_tournaments_from_csv.ts --file=... [--apply]");
  }

  const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const content = fs.readFileSync(absPath, "utf8");
  const rows = parseCsv(content);
  const groups = buildGroups(rows);

  if (!groups.length) {
    console.log("No tournaments found in CSV.");
    return;
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log(`${APPLY ? "[APPLY]" : "[DRY-RUN]"} Importing ${groups.length} tournament group(s) from ${absPath}`);

  const summary: any = {
    tournamentsCreated: 0,
    tournamentsUpdated: 0,
    tournamentsMatched: 0,
    venuesCreated: 0,
    venuesUpdated: 0,
    venuesMatched: 0,
    venuesSkipped: 0,
    linksUpserted: 0,
    failures: [] as Array<{ tournament: string; message: string }>,
  };

  for (const group of groups) {
    try {
      const tournament = await upsertTournament(supabase, group, summary);
      for (const venue of group.venues) {
        await upsertVenue(supabase, tournament.id, venue, group.sport, summary);
      }
      console.log(`[ok] ${group.tournamentName} -> ${tournament.created ? "created" : "updated/matched"} (${group.venues.length} venue row(s))`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null
            ? JSON.stringify(error)
            : String(error);
      summary.failures.push({ tournament: group.tournamentName, message });
      console.error(`[fail] ${group.tournamentName}: ${message}`);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

