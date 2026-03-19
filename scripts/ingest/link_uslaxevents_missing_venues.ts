import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  source_url: string | null;
  official_website_url: string | null;
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
};

type ParsedVenue = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  venue_url: string | null;
};

type Unresolved = {
  tournament_id: string;
  tournament_name: string | null;
  url: string | null;
  reason: "missing_url" | "fetch_empty" | "no_locations" | "unparseable_address" | "error";
  detail?: string;
};

const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 5000;

const ALLOWED_VENUE_SPORTS = new Set([
  "lacrosse",
  "soccer",
  "baseball",
  "basketball",
  "hockey",
  "volleyball",
  "futsal",
]);

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeZip(value: string | null | undefined) {
  const v = clean(value);
  if (!v) return "";
  const m = v.match(/\d{5}/);
  return m ? m[0] : "";
}

async function fetchHtml(url: string) {
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-cache",
      headers: { "user-agent": "RI-USLaxEvents-VenueLinker/1.0" },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(contentType)) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function isUsLaxEventsUrl(value: string | null | undefined) {
  return /(?:^https?:\/\/)?(?:www\.)?uslaxevents\.com\//i.test(String(value ?? ""));
}

function parseStreetCityStateZip(input: string): { address: string; city: string; state: string; zip: string | null } | null {
  const v = clean(input);
  if (!v) return null;

  // Typical format: "1615 Business Loop 70 W, Columbia, MO 65202"
  const m1 = v.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  if (m1) {
    const address = clean(m1[1]);
    const city = clean(m1[2]);
    const state = (clean(m1[3]) ?? "").toUpperCase();
    const zip = clean(m1[4]) ?? null;
    if (address && city && state) return { address, city, state, zip };
  }

  // Some pages omit the comma between street and city:
  // "4217 W50th Street Mauston, WI 53948"
  const m2 = v.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  if (!m2) return null;
  const left = clean(m2[1]);
  const state = (clean(m2[2]) ?? "").toUpperCase();
  const zip = clean(m2[3]) ?? null;
  if (!left || !state) return null;

  const suffixes = [
    "street",
    "st",
    "avenue",
    "ave",
    "road",
    "rd",
    "boulevard",
    "blvd",
    "drive",
    "dr",
    "lane",
    "ln",
    "court",
    "ct",
    "place",
    "pl",
    "parkway",
    "pkwy",
    "circle",
    "cir",
    "way",
    "highway",
    "hwy",
    "center",
    "ctr",
    "trail",
    "trl",
    "terrace",
    "ter",
    "loop",
  ];
  const suffixRe = new RegExp(`\\b(${suffixes.join("|")})\\b`, "gi");
  let last: RegExpExecArray | null = null;
  while (true) {
    const m = suffixRe.exec(left);
    if (!m) break;
    last = m;
  }

  if (last) {
    const end = last.index + last[0].length;
    const address = clean(left.slice(0, end));
    const city = clean(left.slice(end));
    if (address && city) return { address, city, state, zip };
  }
  return null;
}

function parseUsLaxEventsVenues($: cheerio.CheerioAPI): ParsedVenue[] {
  const out: ParsedVenue[] = [];

  // Pages commonly embed one-or-more blocks like:
  // <div class="tourny-wrapper">
  //   <div class="row">
  //     <div class="col-md-4"><h6 class="sub-heading">Location</h6><h6>Cosmo Park</h6></div>
  //     <div class="col-md-4"><h6 class="sub-heading">Address</h6><h6>1615..., City, ST 00000</h6></div>
  //     <div class="col-md-4"><h6 class="sub-heading">Directions</h6><a href="...">View Map</a></div>
  //   </div>
  // </div>
  $(".tourny-wrapper .row").each((_, row) => {
    const r = $(row);
    let name: string | null = null;
    let addressLine: string | null = null;
    let venueUrl: string | null = null;

    r.find("h6").each((__, h) => {
      const el = $(h);
      const cls = String(el.attr("class") ?? "");
      const text = clean(el.text());
      if (!text) return;
      if (cls.includes("sub-heading")) return;

      // Heuristic: the first non-sub-heading h6 is the location name,
      // the second is the address line.
      if (!name) {
        name = text;
        return;
      }
      if (!addressLine) addressLine = text;
    });

    const link = clean(r.find("a[href]").first().attr("href"));
    if (link) venueUrl = link;

    if (!name || !addressLine) return;
    const parsed = parseStreetCityStateZip(addressLine);
    if (!parsed) {
      out.push({
        name,
        address: addressLine,
        city: "",
        state: "",
        zip: null,
        venue_url: venueUrl,
      });
      return;
    }
    out.push({
      name,
      address: parsed.address,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      venue_url: venueUrl,
    });
  });

  const seen = new Set<string>();
  const deduped: ParsedVenue[] = [];
  for (const v of out) {
    const key = [normalize(v.name), normalize(v.address), normalize(v.city), normalize(v.state), normalize(v.zip ?? "")].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(v);
  }
  return deduped;
}

async function run() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tournamentsRaw, error: tournamentErr } = await supabase
    .from("tournaments" as any)
    .select("id,name,sport,city,state,source_url,official_website_url,status,is_canonical")
    .eq("status", "published")
    .eq("is_canonical", true)
    .or("source_url.ilike.%uslaxevents.com%,official_website_url.ilike.%uslaxevents.com%")
    .order("updated_at", { ascending: false })
    .limit(LIMIT);
  if (tournamentErr) throw tournamentErr;
  const tournaments = (tournamentsRaw ?? []) as TournamentRow[];

  const eligible = tournaments.filter((t) => {
    const sport = clean(t.sport);
    if (sport && !ALLOWED_VENUE_SPORTS.has(sport)) return false;
    const url = clean(t.official_website_url) ?? clean(t.source_url);
    return !!url && isUsLaxEventsUrl(url);
  });

  const ids = eligible.map((t) => t.id).filter(Boolean);
  const linkedSet = new Set<string>();
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data: linked, error } = await supabase.from("tournament_venues" as any).select("tournament_id").in("tournament_id", chunk);
    if (error) throw error;
    for (const row of (linked ?? []) as Array<{ tournament_id: string | null }>) {
      const tid = String(row.tournament_id ?? "");
      if (tid) linkedSet.add(tid);
    }
  }
  const targets = eligible.filter((t) => !linkedSet.has(t.id));

  const byAddrCityState = new Map<string, VenueRow[]>();
  const indexVenue = (v: VenueRow) => {
    const address = clean(v.address) ?? "";
    const city = clean(v.city) ?? "";
    const state = (clean(v.state) ?? "").toUpperCase();
    if (!address || !city || !state) return;
    const key = [normalize(address), normalize(city), normalize(state)].join("|");
    const list = byAddrCityState.get(key) ?? [];
    if (!list.some((x) => x.id === v.id)) list.push(v);
    byAddrCityState.set(key, list);
  };

  const findVenueByUniqueKey = async (args: { name: string; address: string; city: string; state: string }): Promise<VenueRow | null> => {
    const { data, error } = await supabase
      .from("venues" as any)
      .select("id,name,address,address1,city,state,zip,venue_url")
      .eq("name", args.name)
      .eq("address", args.address)
      .eq("city", args.city)
      .eq("state", args.state)
      .maybeSingle();
    if (error && (error as any).code !== "PGRST116") throw error;
    const v = (data as VenueRow | null) ?? null;
    if (v) indexVenue(v);
    return v;
  };

  const findVenueByAddressCityState = async (args: { address: string; city: string; state: string }): Promise<VenueRow | null> => {
    const key = [normalize(args.address), normalize(args.city), normalize(args.state)].join("|");
    const cached = byAddrCityState.get(key);
    if (cached && cached.length) return cached[0] ?? null;
    const { data, error } = await supabase
      .from("venues" as any)
      .select("id,name,address,address1,city,state,zip,venue_url")
      .eq("address", args.address)
      .eq("city", args.city)
      .eq("state", args.state)
      .limit(5);
    if (error) throw error;
    const rows = (data ?? []) as VenueRow[];
    for (const v of rows) indexVenue(v);
    return rows[0] ?? null;
  };

  let scanned = 0;
  let pagesWithVenues = 0;
  let createdVenues = 0;
  let linkedExistingVenues = 0;
  let linkedCreatedVenues = 0;
  let linksInserted = 0;
  let failures = 0;
  const unresolved: Unresolved[] = [];

  for (const t of targets) {
    scanned += 1;
    const url = clean(t.official_website_url) ?? clean(t.source_url);
    if (!url) {
      unresolved.push({ tournament_id: t.id, tournament_name: t.name, url: null, reason: "missing_url" });
      continue;
    }

    try {
      const html = await fetchHtml(url);
      if (!html) {
        unresolved.push({ tournament_id: t.id, tournament_name: t.name, url, reason: "fetch_empty" });
        continue;
      }
      const $ = cheerio.load(html);
      const venues = parseUsLaxEventsVenues($);
      const parsed = venues.filter((v) => v.city && v.state);
      if (!venues.length) {
        unresolved.push({ tournament_id: t.id, tournament_name: t.name, url, reason: "no_locations" });
        continue;
      }
      const unparsed = venues.filter((v) => !v.city || !v.state);
      if (unparsed.length) {
        unresolved.push({
          tournament_id: t.id,
          tournament_name: t.name,
          url,
          reason: "unparseable_address",
          detail: `Unparseable locations: ${unparsed.map((x) => `${x.name} (${x.address})`).join("; ")}`.slice(0, 500),
        });
      }
      if (!parsed.length) continue;
      pagesWithVenues += 1;

      for (const v of parsed) {
        let created = false;
        let venue = await findVenueByUniqueKey({ name: v.name, address: v.address, city: v.city, state: v.state });
        if (!venue) venue = await findVenueByAddressCityState({ address: v.address, city: v.city, state: v.state });

        if (!venue) {
          if (!APPLY) continue;
          const { data: inserted, error } = await supabase
            .from("venues" as any)
            .insert({
              name: v.name,
              address: v.address,
              address1: v.address,
              city: v.city,
              state: v.state,
              zip: v.zip,
              venue_url: v.venue_url,
            })
            .select("id,name,address,address1,city,state,zip,venue_url")
            .single();
          if (error) throw error;
          venue = inserted as VenueRow;
          created = true;
          createdVenues += 1;
          indexVenue(venue);
        }

        if (!APPLY) continue;
        const { error: linkErr } = await supabase.from("tournament_venues" as any).insert({
          tournament_id: t.id,
          venue_id: venue.id,
        });
        if (linkErr) {
          const code = String((linkErr as any).code ?? "");
          if (code !== "23505") throw linkErr;
        } else {
          linksInserted += 1;
          if (created) linkedCreatedVenues += 1;
          else linkedExistingVenues += 1;
        }
      }
    } catch (err: any) {
      failures += 1;
      unresolved.push({
        tournament_id: t.id,
        tournament_name: t.name,
        url,
        reason: "error",
        detail: clean(err?.message) ?? String(err ?? "").slice(0, 300),
      });
    }
  }

  const summary = {
    apply: APPLY,
    limit: LIMIT,
    scanned,
    targets: targets.length,
    pages_with_venue_data: pagesWithVenues,
    created_venues: createdVenues,
    linked_existing_venues: linkedExistingVenues,
    linked_created_venues: linkedCreatedVenues,
    tournament_venue_links_inserted: linksInserted,
    failures,
    unresolved: unresolved.length,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (unresolved.length) {
    const rows = unresolved.slice(0, 50).map((u) => ({
      tournament_id: u.tournament_id,
      name: u.tournament_name ?? "",
      url: u.url ?? "",
      reason: u.reason,
      detail: u.detail ?? "",
    }));
    console.log("Unresolved sample (first 50):");
    console.table(rows);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
