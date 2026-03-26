import { createClient } from "@supabase/supabase-js";
import { load } from "cheerio";

const APPLY = process.argv.includes("--apply");

const PAGE_URL = "https://www.fargobasketball.com/basketball/youth-tournaments";

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}.`);
  return v;
}

type ParsedAddr = {
  address1: string | null;
  city: string;
  state: string;
  zip: string | null;
};

function parseUsAddressLoose(value: string): ParsedAddr {
  const raw = cleanText(value);
  const m = raw.match(/^(.+?),\s*([^,]+?),\s*([A-Za-z]{2})(?:\s+(\d{5})(?:-\d{4})?)?\s*$/);
  if (!m) throw new Error(`Could not parse address: ${value}`);
  const address1Raw = cleanText(m[1]);
  const city = cleanText(m[2]);
  const state = cleanText(m[3]).toUpperCase();
  const zip = m[4] ? cleanText(m[4]) : null;
  const streetLike = /^[0-9][0-9A-Za-z-]*\s+/.test(address1Raw);
  return { address1: streetLike ? address1Raw : address1Raw || null, city, state, zip };
}

type VenueSeed = {
  key: string;
  name: string;
  sport: string;
  fullAddress: string; // "Street, City, ST ZIP"
  venueUrl?: string | null;
};

const VENUES: VenueSeed[] = [
  {
    key: "lewy_lee_fieldhouse",
    name: "Lewy Lee Fieldhouse",
    sport: "basketball",
    fullAddress: "330 3rd St NE, Mayville, ND 58257",
  },
  {
    key: "hillsboro_event_center",
    name: "Hillsboro Event Center",
    sport: "basketball",
    fullAddress: "128 4th St SE, Hillsboro, ND 58045",
  },
  {
    key: "fargo_basketball_academy",
    name: "Fargo Basketball Academy",
    sport: "basketball",
    fullAddress: "5409 53rd Ave S, Fargo, ND 58104",
  },
  {
    key: "betty_engelstad_sioux_center",
    name: "Betty Engelstad Sioux Center",
    sport: "basketball",
    fullAddress: "1 Ralph Engelstad Arena Dr, Grand Forks, ND 58203",
  },
  {
    key: "alerus_center",
    name: "Alerus Center",
    sport: "basketball",
    fullAddress: "1200 S 42nd St, Grand Forks, ND 58201",
  },
  {
    key: "choice_health_and_fitness",
    name: "Choice Health & Fitness",
    sport: "basketball",
    fullAddress: "4401 S 11th St, Grand Forks, ND 58201",
  },
  {
    key: "und_wellness_center",
    name: "UND Wellness Center",
    sport: "basketball",
    fullAddress: "801 Princeton St, Grand Forks, ND 58202",
  },
  {
    key: "we_osmon_fieldhouse",
    name: "W.E. Osmon Fieldhouse (The Bubble)",
    sport: "basketball",
    fullAddress: "780 8th Ave SW, Valley City, ND 58072",
  },
  {
    key: "empire_sports_complex",
    name: "Empire Sports Complex",
    sport: "basketball",
    fullAddress: "4170 24th Ave N, Fargo, ND 58102",
  },
  {
    key: "liberty_middle_school",
    name: "Liberty Middle School",
    sport: "basketball",
    fullAddress: "801 36th Ave E, West Fargo, ND 58078",
  },
];

const VENUE_BY_KEY = new Map(VENUES.map((v) => [v.key, v]));

// Override the venue mapping per tournament name to avoid fragile text splitting.
const TOURNAMENT_VENUE_KEYS: Record<string, string[]> = {
  "CAC 3ON3 JAMBOREE [3-ON-3]": ["lewy_lee_fieldhouse"],
  "MIDDLE SCHOOL MADNESS [3-ON-3]": ["hillsboro_event_center"],
  "SPRING SHOOTOUT [2-ON-2]": ["fargo_basketball_academy"],
  "APRIL CONTINUOUS 3v3v3 LEAGUE [3-ON-3-ON-3]": ["fargo_basketball_academy"],
  "GRAND FORKS FAST BREAK CLUB JUNIOR GRAND AM TOURNAMENT [5-ON-5]": [
    "betty_engelstad_sioux_center",
    "alerus_center",
    "choice_health_and_fitness",
    "und_wellness_center",
  ],
  "VCSU 3 on 3 SPRING TOURNAMENT [3-ON-3]": ["we_osmon_fieldhouse"],
  "MAY CONTINUOUS 3v3v3 LEAGUE [3-ON-3-ON-3]": ["fargo_basketball_academy"],
  "THE FARGO HARDWOOD INVITATION [5-ON-5]": ["empire_sports_complex", "liberty_middle_school"],
  // "THE 'JESSE' MEMORIAL BASKETBALL TOURNAMENT [5-ON-5]" has no venue listed on the source page.
};

type ParsedTournament = {
  name: string;
  city: string;
  state: "ND";
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  official_website_url: string | null;
  source_url: string;
};

function monthNumber(month: string) {
  const key = month.trim().toLowerCase();
  const map: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  const out = map[key];
  if (!out) throw new Error(`Unknown month: ${month}`);
  return out;
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseMonthHeading(text: string): { month: string; year: number } | null {
  const t = cleanOrNull(text);
  if (!t) return null;
  const m = t.match(/^([A-Z]+)\s+(\d{4})$/i);
  if (!m) return null;
  return { month: m[1], year: Number(m[2]) };
}

function parseDatePrefix(args: { month: string; year: number; prefix: string }): { start_date: string; end_date: string } {
  const month = monthNumber(args.month);
  const year = args.year;
  const normalized = cleanText(args.prefix).toUpperCase();

  const dayPart = normalized.replace(/^[A-Z]+\s+/, "");
  const days = Array.from(dayPart.matchAll(/\b(\d{1,2})\b/g)).map((m) => Number(m[1]));
  if (!days.length) throw new Error(`Could not parse days from: ${args.prefix}`);

  const startDay = days[0];
  const endDay = days[days.length - 1];
  return { start_date: isoDate(year, month, startDay), end_date: isoDate(year, month, endDay) };
}

function parseTournamentNameFromStrong(strongText: string): string | null {
  const t = cleanOrNull(strongText);
  if (!t) return null;
  const afterDate = t.includes(":") ? t.split(":").slice(1).join(":") : t;
  return cleanOrNull(afterDate);
}

function parseLocationFromFirstText(firstTextNode: string): { city: string; state: string } | null {
  const t = cleanOrNull(firstTextNode);
  if (!t) return null;
  const m = t.match(/^\-\s*([^,]+),\s*([A-Z]{2})\./);
  if (!m) return null;
  return { city: cleanText(m[1]), state: cleanText(m[2]).toUpperCase() };
}

async function fetchPageHtml() {
  const res = await fetch(PAGE_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch page: ${res.status} ${res.statusText}`);
  return await res.text();
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

async function findTournamentMatch(supabase: any, t: ParsedTournament) {
  if (t.official_website_url) {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id,slug,name,city,state,start_date,end_date,status,official_website_url,source_url")
      .eq("official_website_url", t.official_website_url)
      .limit(5);
    if (error) throw error;
    const rows = (data ?? []) as any[];
    if (rows.length) {
      const scored = rows
        .map((row) => {
          let score = 0;
          if (normalize(row.name) === normalize(t.name)) score += 10;
          else if (normalize(row.name).includes(normalize(t.name)) || normalize(t.name).includes(normalize(row.name))) score += 6;
          if (normalize(row.city) === normalize(t.city)) score += 3;
          if ((row.state ?? "").toUpperCase() === t.state) score += 2;
          if ((row.start_date ?? "") === t.start_date) score += 5;
          if ((row.end_date ?? "") === t.end_date) score += 2;
          return { row, score };
        })
        .sort((a, b) => b.score - a.score);
      if (scored[0] && scored[0].score >= 12) return scored[0].row;
    }
  }

  const { data, error } = await supabase
    .from("tournaments")
    .select("id,slug,name,city,state,start_date,end_date,status,official_website_url,source_url")
    .eq("state", t.state)
    .eq("city", t.city)
    .eq("start_date", t.start_date)
    .ilike("name", `%${t.name.slice(0, 40)}%`)
    .limit(10);
  if (error) throw error;
  const candidates = ((data ?? []) as any[]).map((row) => {
    let score = 0;
    if (normalize(row.name) === normalize(t.name)) score += 10;
    if (normalize(row.city) === normalize(t.city)) score += 3;
    if ((row.state ?? "").toUpperCase() === t.state) score += 2;
    if ((row.start_date ?? "") === t.start_date) score += 3;
    if ((row.end_date ?? "") === t.end_date) score += 2;
    return { row, score };
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] && candidates[0].score >= 12 ? candidates[0].row : null;
}

async function upsertTournament(supabase: any, t: ParsedTournament) {
  const existing = await findTournamentMatch(supabase, t);

  const basePayload: any = {
    name: t.name,
    sport: "basketball",
    state: "ND",
    city: t.city,
    start_date: t.start_date,
    end_date: t.end_date,
    official_website_url: t.official_website_url,
    source_url: t.source_url,
    status: "draft",
    is_canonical: true,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    if (!APPLY) return { id: existing.id as string, slug: existing.slug ?? null, created: false };

    const updatePayload: any = {};
    for (const [key, value] of Object.entries(basePayload)) {
      if (typeof value === "undefined") continue;
      if (value == null) continue;
      updatePayload[key] = mergeValue((existing as any)[key], value as any);
    }
    const changed = Object.entries(updatePayload).some(([k, v]) => v !== (existing as any)[k]);
    if (changed) {
      const { error } = await supabase.from("tournaments").update(updatePayload).eq("id", existing.id);
      if (error) throw error;
    }
    return { id: existing.id as string, slug: existing.slug ?? null, created: false };
  }

  if (!APPLY) return { id: `DRY_RUN_${slugify(t.name)}`, slug: null, created: true };

  const slug = await uniqueSlug(supabase, `${t.name}-${t.city}-ND-${t.start_date.slice(0, 4)}`);
  const insertPayload = { ...basePayload, slug, created_at: new Date().toISOString() };
  const { data, error } = await supabase.from("tournaments").insert(insertPayload).select("id,slug").single();
  if (error || !data?.id) throw error ?? new Error(`Failed to insert tournament ${t.name}`);
  return { id: data.id as string, slug: data.slug ?? null, created: true };
}

async function findVenueMatch(supabase: any, venue: { name: string; address1: string | null; city: string; state: string }) {
  const nameKey = venue.name.slice(0, 60);
  const { data, error } = await supabase
    .from("venues")
    .select("id,name,address,address1,city,state,zip,venue_url,sport")
    .eq("state", venue.state)
    .ilike("name", `%${nameKey}%`)
    .limit(50);
  if (error) throw error;
  const candidates = (data ?? []) as any[];
  const scored = candidates
    .map((row) => {
      let score = 0;
      if (normalize(row.name) === normalize(venue.name)) score += 10;
      if (normalize(row.city) === normalize(venue.city)) score += 4;
      if ((row.state ?? "").toUpperCase() === venue.state.toUpperCase()) score += 2;
      if (venue.address1 && normalize(row.address1 || row.address) === normalize(venue.address1)) score += 6;
      return { row, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score >= (venue.address1 ? 12 : 14) ? scored[0].row : null;
}

async function upsertVenue(supabase: any, seed: VenueSeed) {
  const parsed = parseUsAddressLoose(seed.fullAddress);
  if (parsed.state !== "ND") throw new Error(`Venue is not ND: ${seed.name} (${seed.fullAddress})`);

  const existing = await findVenueMatch(supabase, { name: seed.name, address1: parsed.address1, city: parsed.city, state: parsed.state });

  const basePayload: any = {
    name: seed.name,
    address1: parsed.address1,
    address: parsed.address1,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    venue_url: seed.venueUrl ?? null,
    sport: seed.sport,
  };

  if (existing?.id) {
    if (!APPLY) return { id: existing.id as string, created: false };
    const updatePayload: any = {};
    for (const [key, value] of Object.entries(basePayload)) {
      if (typeof value === "undefined") continue;
      if (value == null) continue;
      updatePayload[key] = mergeValue((existing as any)[key], value as any);
    }
    const changed = Object.entries(updatePayload).some(([k, v]) => v !== (existing as any)[k]);
    if (changed) {
      const { error } = await supabase.from("venues").update(updatePayload).eq("id", existing.id);
      if (error) throw error;
    }
    return { id: existing.id as string, created: false };
  }

  if (!APPLY) return { id: `DRY_RUN_${slugify(seed.name)}`, created: true };

  const { data, error } = await supabase.from("venues").insert(basePayload).select("id").single();
  if (error || !data?.id) throw error ?? new Error(`Failed to insert venue ${seed.name}`);
  return { id: data.id as string, created: true };
}

async function linkTournamentVenue(supabase: any, tournamentId: string, venueId: string) {
  if (!APPLY) return;
  const { error } = await supabase
    .from("tournament_venues")
    .upsert({ tournament_id: tournamentId, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
  if (error) throw error;
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const html = await fetchPageHtml();
  const $ = load(html);
  const body = $(".mainbody");
  if (!body.length) throw new Error("Could not locate .mainbody");

  const tournaments: ParsedTournament[] = [];

  body.find("h3").each((_, h3) => {
    const heading = parseMonthHeading($(h3).text());
    if (!heading) return;
    const ul = $(h3).nextAll("ul").first();
    if (!ul.length) return;

    ul.find("li").each((__, li) => {
      const strongText = cleanText($(li).find("strong").first().text());
      const name = parseTournamentNameFromStrong(strongText);
      if (!name) return;

      const prefix = strongText.includes(":") ? strongText.split(":")[0] : strongText;
      const dates = parseDatePrefix({ month: heading.month, year: heading.year, prefix });

      const firstTextNode =
        $(li)
          .contents()
          .toArray()
          .map((node) => (node.type === "text" ? cleanOrNull((node.data as any) ?? "") : null))
          .filter((v): v is string => Boolean(v))
          .find((v) => v.startsWith("-")) ?? null;

      const loc = parseLocationFromFirstText(firstTextNode ?? "");
      if (!loc) return;
      if (loc.state.toUpperCase() !== "ND") return;

      const register_urls = $(li)
        .find('a[href^="http"]')
        .map((___, a) => String($(a).attr("href") ?? ""))
        .get()
        .filter((href) => href.startsWith("http"));

      tournaments.push({
        name,
        city: loc.city,
        state: "ND",
        start_date: dates.start_date,
        end_date: dates.end_date,
        official_website_url: register_urls[0] ?? null,
        source_url: PAGE_URL,
      });
    });
  });

  const ndTournaments = tournaments.filter((t) => t.state === "ND");
  console.log(`${APPLY ? "[APPLY]" : "[DRY-RUN]"} Parsed ND tournaments: ${ndTournaments.length}`);

  const venueIdsByKey = new Map<string, string>();
  for (const v of VENUES) {
    const { id, created } = await upsertVenue(supabase, v);
    venueIdsByKey.set(v.key, id);
    console.log(`[venue] ${v.name} -> ${created ? "created" : "matched/updated"} (${id})`);
  }

  for (const t of ndTournaments) {
    const { id: tournamentId, created } = await upsertTournament(supabase, t);
    console.log(`[tournament] ${t.name} (${t.city}, ND ${t.start_date}) -> ${created ? "created" : "matched/updated"} (${tournamentId})`);

    const venueKeys = TOURNAMENT_VENUE_KEYS[t.name] ?? [];
    if (!venueKeys.length) {
      console.log(`[link] ${t.name}: no venue mapping (skipping)`);
      continue;
    }

    for (const key of venueKeys) {
      const venueId = venueIdsByKey.get(key);
      const venueSeed = VENUE_BY_KEY.get(key);
      if (!venueId || !venueSeed) {
        console.log(`[link] ${t.name}: missing venue key ${key} (skipping)`);
        continue;
      }
      await linkTournamentVenue(supabase, tournamentId, venueId);
      console.log(`[link] ${t.name} -> ${venueSeed.name}`);
    }
  }
}

main().catch((error) => {
  console.error("[ingest-fargo-basketball-nd] fatal", error);
  process.exit(1);
});
