import { createClient } from "@supabase/supabase-js";
import { load } from "cheerio";

const PAGE_URL = "https://www.fargobasketball.com/basketball/youth-tournaments";

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

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
  const t = clean(text);
  if (!t) return null;
  const m = t.match(/^([A-Z]+)\s+(\d{4})$/i);
  if (!m) return null;
  return { month: m[1], year: Number(m[2]) };
}

function parseDatePrefix(args: { month: string; year: number; prefix: string }): { start_date: string; end_date: string } {
  const month = monthNumber(args.month);
  const year = args.year;
  const normalized = clean(args.prefix)?.toUpperCase() ?? "";

  // Examples:
  // "MARCH 28" / "APRIL 10-12" / "APRIL 6, 13, 20, 27" / "MAY 4, 11, 18"
  const dayPart = normalized.replace(/^[A-Z]+\s+/, "");
  const days = Array.from(dayPart.matchAll(/\b(\d{1,2})\b/g)).map((m) => Number(m[1]));
  if (!days.length) throw new Error(`Could not parse days from: ${args.prefix}`);

  const startDay = days[0];
  const endDay = days[days.length - 1];
  return { start_date: isoDate(year, month, startDay), end_date: isoDate(year, month, endDay) };
}

function parseLocation(text: string): { city: string; state: string } | null {
  const t = clean(text);
  if (!t) return null;
  const m = t.match(/^\-\s*([^,]+),\s*([A-Z]{2})\./);
  if (!m) return null;
  return { city: clean(m[1]) ?? "", state: clean(m[2]) ?? "" };
}

function parseTournamentNameFromStrong(strongText: string): string | null {
  const t = clean(strongText);
  if (!t) return null;
  // Strong text looks like: "MARCH 28: CAC 3ON3 JAMBOREE [3-ON-3]"
  const afterDate = t.includes(":") ? t.split(":").slice(1).join(":") : t;
  return clean(afterDate);
}

function extractGamesPlayedAt(text: string): string | null {
  const t = clean(text);
  if (!t) return null;
  const idx = t.toLowerCase().indexOf("games played at");
  if (idx === -1) return null;
  const after = t.slice(idx);

  // We want the full "games played at ..." clause, but we can't just stop at the first "."
  // because venues sometimes include abbreviations like "W.E.".
  const start = after.match(/games played at\s+/i);
  if (!start) return null;
  const body = after.slice(start.index! + start[0].length);

  const stopWords = new Set([
    "First",
    "All",
    "Within",
    "Athletes",
    "Any",
    "Awards",
    "Brackets",
    "Concessions",
    "Certified",
    "Inclement",
    "It",
    "Max",
    "Send",
    "Teams",
    "The",
    "Tournament",
  ]);

  for (let i = 0; i < body.length; i++) {
    if (body[i] !== ".") continue;
    const rest = body.slice(i + 1).replace(/^\s+/, "");
    if (!rest.length) return clean(body.slice(0, i));
    const nextWord = clean(rest.split(/\s+/)[0]) ?? "";
    if (stopWords.has(nextWord)) return clean(body.slice(0, i));
  }

  return clean(body);
}

function splitVenueNames(gamesPlayedAt: string): string[] {
  const raw = clean(gamesPlayedAt);
  if (!raw) return [];
  // Normalize some common separators.
  const normalized = raw
    .replace(/\s+&\s+/g, " and ")
    .replace(/\s+\/\s+/g, ", ")
    .replace(/\s*\((?:[^)]+)\)\s*/g, (m) => m); // keep parentheticals (often helps identify venue).

  // Split on " and " and commas, but keep phrases like "City, ST" intact (this string shouldn't contain those).
  const parts = normalized
    .split(/\s+and\s+|,\s+/g)
    .map((p) => clean(p))
    .filter((p): p is string => Boolean(p));

  // Filter out non-venues that we can't reasonably create as a single venue row.
  return parts
    .filter((p) => !/^(local|multiple|additional)\b/i.test(p))
    .map((p) => p.replace(/^the\s+/i, "").trim())
    .filter((p) => p.length > 1);
}

async function fetchPageHtml() {
  const res = await fetch(PAGE_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch page: ${res.status} ${res.statusText}`);
  return await res.text();
}

function addDays(iso: string, deltaDays: number) {
  const [y, m, d] = iso.split("-").map((v) => Number(v));
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

async function main() {
  const APPLY = process.argv.includes("--apply");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const html = await fetchPageHtml();
  const $ = load(html);

  const body = $(".mainbody");
  if (!body.length) throw new Error("Could not locate .mainbody");

  const ndTournaments: Array<{
    month: string;
    year: number;
    start_date: string;
    end_date: string;
    name: string;
    city: string;
    state: string;
    gamesPlayedAt: string | null;
    venueNames: string[];
    source_url: string;
    register_urls: string[];
    raw: string;
  }> = [];

  body.find("h3").each((_, h3) => {
    const heading = parseMonthHeading($(h3).text());
    if (!heading) return;
    const ul = $(h3).nextAll("ul").first();
    if (!ul.length) return;

    ul.find("li").each((__, li) => {
      const rawText = clean($(li).text()) ?? "";
      const strongText = clean($(li).find("strong").first().text()) ?? "";

      const firstTextNode =
        $(li)
          .contents()
          .toArray()
          .map((node) => (node.type === "text" ? clean((node.data as any) ?? "") : null))
          .filter((v): v is string => Boolean(v))
          .find((v) => v.startsWith("-")) ?? null;

      const loc = parseLocation(firstTextNode ?? "");
      if (!loc) return;
      if (loc.state !== "ND") return;

      const prefix = strongText.includes(":") ? strongText.split(":")[0] : strongText;
      const dates = parseDatePrefix({ month: heading.month, year: heading.year, prefix });

      const name = parseTournamentNameFromStrong(strongText);
      if (!name) return;

      const gamesPlayedAt = extractGamesPlayedAt(rawText);
      const venueNames = gamesPlayedAt ? splitVenueNames(gamesPlayedAt) : [];
      const register_urls = $(li)
        .find('a[href^="http"]')
        .map((___, a) => String($(a).attr("href") ?? ""))
        .get()
        .filter((href) => href.startsWith("http"));

      ndTournaments.push({
        month: heading.month,
        year: heading.year,
        ...dates,
        name,
        city: loc.city,
        state: loc.state,
        gamesPlayedAt,
        venueNames,
        source_url: PAGE_URL,
        register_urls,
        raw: rawText,
      });
    });
  });

  console.log(`Parsed ND tournaments: ${ndTournaments.length}`);
  console.log("---");

  for (const t of ndTournaments) {
    const nameKey = t.name
      .replace(/\[[^\]]+\]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const dateStartMin = addDays(t.start_date, -14);
    const dateStartMax = addDays(t.start_date, 14);

    let tournament: any | null = null;

    if (t.register_urls.length) {
      const { data, error } = await supabase
        .from("tournaments" as any)
        .select("id,slug,name,city,state,start_date,end_date,status,source_url,official_website_url")
        .in("official_website_url", t.register_urls)
        .limit(5);
      if (error) throw new Error(error.message);
      tournament = (data ?? [])[0] ?? null;
    }

    if (!tournament) {
      const { data: tournamentCandidates, error: tourErr } = await supabase
        .from("tournaments" as any)
        .select("id,slug,name,city,state,start_date,end_date,status,source_url,official_website_url")
        .eq("state", "ND")
        .eq("city", t.city)
        .gte("start_date", dateStartMin)
        .lte("start_date", dateStartMax)
        .ilike("name", `%${nameKey.slice(0, 40)}%`)
        .limit(10);
      if (tourErr) throw new Error(tourErr.message);
      tournament = (tournamentCandidates ?? [])[0] ?? null;
    }

    console.log(`${t.month} ${t.start_date}–${t.end_date} | ${t.name} | ${t.city}, ${t.state}`);
    console.log(`source: ${t.source_url}`);
    console.log(`games played at: ${t.gamesPlayedAt ?? "(none found)"}`);

    if (!tournament) {
      console.log("tournament: MISSING");
      if (t.venueNames.length) {
        const found: Array<{ id: string; name: string; city: string | null; address: string | null }> = [];
        const missing: string[] = [];
        for (const venueName of t.venueNames) {
          const { data: venueHits, error: venueErr } = await supabase
            .from("venues" as any)
            .select("id,name,address,city,state,zip")
            .eq("state", "ND")
            .ilike("name", `%${venueName}%`)
            .limit(10);
          if (venueErr) throw new Error(venueErr.message);
          const existing = (venueHits ?? [])[0] ?? null;
          if (!existing) missing.push(venueName);
          else found.push({ id: existing.id, name: existing.name, city: existing.city ?? null, address: existing.address ?? null });
        }
        console.log(`venues found in DB (by name): ${found.length}`);
        for (const v of found) console.log(`  - FOUND ${v.name} (${v.city ?? "?"}, ND) id=${v.id} addr=${v.address ?? "(missing address)"}`);
        console.log(`venues missing in DB: ${missing.length}`);
        for (const v of missing) console.log(`  - MISSING ${v}`);
      } else {
        console.log("venues: (none parsed from 'games played at')");
      }
      console.log("---");
      continue;
    }

    console.log(`tournament: FOUND id=${tournament.id} slug=${tournament.slug ?? "(null)"} status=${tournament.status ?? "(null)"}`);

    const { data: linked, error: linkErr } = await supabase
      .from("tournament_venues" as any)
      .select("venue_id, venues(id,name,address,city,state,zip)")
      .eq("tournament_id", tournament.id)
      .limit(2000);
    if (linkErr) throw new Error(linkErr.message);

    const linkedVenues = (linked ?? []) as any[];
    const linkedByName = new Map<string, any>();
    for (const row of linkedVenues) {
      const v = (row as any).venues;
      const key = clean(v?.name)?.toLowerCase() ?? "";
      if (key && !linkedByName.has(key)) linkedByName.set(key, v);
    }

    if (!t.venueNames.length) {
      console.log(`venues linked: ${linkedVenues.length}`);
      console.log("---");
      continue;
    }

    const missingVenueNames: string[] = [];
    const unknownVenueIds: string[] = [];

    for (const venueName of t.venueNames) {
      const alreadyLinked = linkedByName.has(venueName.toLowerCase());
      if (alreadyLinked) continue;

      const { data: venueHits, error: venueErr } = await supabase
        .from("venues" as any)
        .select("id,name,address,city,state,zip")
        .eq("state", "ND")
        .ilike("name", `%${venueName}%`)
        .limit(10);
      if (venueErr) throw new Error(venueErr.message);

      const existing = (venueHits ?? [])[0] ?? null;
      if (!existing) {
        missingVenueNames.push(venueName);
        continue;
      }

      unknownVenueIds.push(existing.id);

      if (APPLY) {
        const { error: insErr } = await supabase.from("tournament_venues" as any).upsert(
          {
            tournament_id: tournament.id,
            venue_id: existing.id,
          },
          { onConflict: "tournament_id,venue_id" }
        );
        if (insErr) throw new Error(insErr.message);
      }
    }

    console.log(`venues linked (current): ${linkedVenues.length}`);
    if (unknownVenueIds.length) {
      console.log(`venues to link (existing rows): ${unknownVenueIds.length}${APPLY ? " (linked)" : ""}`);
    }
    if (missingVenueNames.length) {
      console.log(`venues missing in DB: ${missingVenueNames.length}`);
      for (const v of missingVenueNames) console.log(`  - ${v}`);
    }

    console.log("---");
  }
}

main().catch((error) => {
  console.error("[audit-fargo-basketball-nd-venues] fatal", error);
  process.exit(1);
});
