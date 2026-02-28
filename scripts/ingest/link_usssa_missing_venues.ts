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
  name: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue_url: string | null;
};

const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 5000;
const SPORT_ARG = process.argv.find((arg) => arg.startsWith("--sport="));
const SPORT_FILTER = SPORT_ARG ? clean(SPORT_ARG.split("=")[1]) : null;
const CHUNK = 250;
const ALLOWED_VENUE_SPORTS = new Set([
  "soccer",
  "baseball",
  "lacrosse",
  "basketball",
  "hockey",
  "volleyball",
  "futsal",
]);

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsssaEventUrl(value: string | null | undefined) {
  return /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?usssa\.com\/event\//i.test(String(value ?? ""));
}

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function normalizeZip(value: string | null | undefined) {
  const v = clean(value);
  if (!v) return "";
  const m = v.match(/\d{5}/);
  return m ? m[0] : "";
}

function normalizeStreet(value: string | null | undefined) {
  return normalize(value)
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|circle|cir|parkway|pkwy|place|pl|terrace|ter|trail|trl|highway|hwy|way)\b/g, " ")
    .replace(/\b(suite|ste|unit|apt|building|bldg)\b.*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseAddressParts(
  input: string,
  fallbackCity: string | null,
  fallbackState: string | null
): { address: string; city: string | null; state: string | null; zip: string | null } | null {
  const raw = input.replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const stripped = raw.replace(/\s*,\s*US(A)?$/i, "").trim();
  const m = stripped.match(
    /^(.*?),\s*([^,]+),\s*([A-Z]{2})\s*,?\s*(\d{5}(?:-\d{4})?)(?:\s*,\s*[A-Z]{2})?$/i
  );
  if (m) {
    return {
      address: clean(m[1]) ?? stripped,
      city: clean(m[2]),
      state: (clean(m[3]) ?? "").toUpperCase() || null,
      zip: clean(m[4]),
    };
  }
  const simple = stripped.match(/^(.*?),\s*([^,]+),\s*([A-Z]{2})$/i);
  if (simple) {
    return {
      address: clean(simple[1]) ?? stripped,
      city: clean(simple[2]),
      state: (clean(simple[3]) ?? "").toUpperCase() || null,
      zip: null,
    };
  }
  if (fallbackCity || fallbackState) {
    return {
      address: stripped,
      city: fallbackCity,
      state: fallbackState ? fallbackState.toUpperCase() : null,
      zip: null,
    };
  }
  return null;
}

function extractMapsAddress(url: string): string | null {
  try {
    const parsed = new URL(url);
    const query = parsed.searchParams.get("query");
    if (!query) return null;
    return decodeURIComponent(query).replace(/\+/g, " ").trim();
  } catch {
    return null;
  }
}

function parseJsonLdVenues(
  $: cheerio.CheerioAPI,
  fallbackCity: string | null,
  fallbackState: string | null
): ParsedVenue[] {
  const out: ParsedVenue[] = [];
  $("script[type='application/ld+json']").each((_idx, el) => {
    const raw = ($(el).html() || "").trim();
    if (!raw) return;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      const loc = item?.location;
      if (!loc || typeof loc !== "object") continue;
      const name = clean(loc.name);
      const addrObj = loc.address && typeof loc.address === "object" ? loc.address : null;
      const full =
        clean(
          [
            addrObj?.streetAddress,
            [addrObj?.addressLocality, addrObj?.addressRegion].filter(Boolean).join(", "),
            addrObj?.postalCode,
          ]
            .filter(Boolean)
            .join(", ")
        ) ?? null;
      if (!full) continue;
      const parsedAddress = parseAddressParts(full, fallbackCity, fallbackState);
      if (!parsedAddress) continue;
      out.push({
        name,
        address: parsedAddress.address,
        city: parsedAddress.city,
        state: parsedAddress.state,
        zip: parsedAddress.zip,
        venue_url: null,
      });
    }
  });
  return out;
}

function parseTableVenues(
  $: cheerio.CheerioAPI,
  fallbackCity: string | null,
  fallbackState: string | null
): ParsedVenue[] {
  const out: ParsedVenue[] = [];
  $("table tr").each((_idx, row) => {
    const tds = $(row).find("td");
    if (tds.length < 2) return;
    const name = clean($(tds[0]).text());
    const addressText = clean($(tds[1]).text());
    const link = clean($(tds[2]).find("a[href]").attr("href"));
    if (!addressText) return;
    const parsedAddress = parseAddressParts(addressText, fallbackCity, fallbackState);
    if (!parsedAddress) return;
    out.push({
      name,
      address: parsedAddress.address,
      city: parsedAddress.city,
      state: parsedAddress.state,
      zip: parsedAddress.zip,
      venue_url: link,
    });
  });
  return out;
}

function parseDataMapLocations(
  $: cheerio.CheerioAPI,
  fallbackCity: string | null,
  fallbackState: string | null
): ParsedVenue[] {
  const out: ParsedVenue[] = [];
  $("[data-map-locations]").each((_idx, el) => {
    const raw = $(el).attr("data-map-locations");
    if (!raw) return;
    const decoded = decodeHtmlEntities(raw);
    let arr: any[] = [];
    try {
      const parsed = JSON.parse(decoded);
      arr = Array.isArray(parsed) ? parsed : [];
    } catch {
      return;
    }
    for (const item of arr) {
      const info = item?.infoWindow ?? {};
      const title = clean(info.title);
      const addressText = clean(info.address);
      const link = clean(info.link);
      if (!addressText) continue;
      const parsedAddress = parseAddressParts(addressText, fallbackCity, fallbackState);
      if (!parsedAddress) continue;
      out.push({
        name: title,
        address: parsedAddress.address,
        city: parsedAddress.city,
        state: parsedAddress.state,
        zip: parsedAddress.zip,
        venue_url: link,
      });
    }
  });
  return out;
}

function parseMapLinksOnly(
  $: cheerio.CheerioAPI,
  fallbackCity: string | null,
  fallbackState: string | null
): ParsedVenue[] {
  const out: ParsedVenue[] = [];
  $("a[href*='google.com/maps/search']").each((_idx, el) => {
    const href = clean($(el).attr("href"));
    if (!href) return;
    const mapAddress = extractMapsAddress(href);
    if (!mapAddress) return;
    const parsedAddress = parseAddressParts(mapAddress, fallbackCity, fallbackState);
    if (!parsedAddress) return;
    const container = $(el).closest("tr,li,div");
    const containerText = clean(container.text());
    let name: string | null = null;
    if (containerText) {
      const before = containerText.split("Open in Maps")[0]?.trim() ?? "";
      const maybe = clean(before.split(",")[0] ?? "");
      if (maybe && !/\d/.test(maybe)) name = maybe;
    }
    out.push({
      name,
      address: parsedAddress.address,
      city: parsedAddress.city,
      state: parsedAddress.state,
      zip: parsedAddress.zip,
      venue_url: href,
    });
  });
  return out;
}

function dedupeVenues(candidates: ParsedVenue[]): ParsedVenue[] {
  const out: ParsedVenue[] = [];
  const seen = new Set<string>();
  for (const v of candidates) {
    const key = [normalize(v.name), normalize(v.address), normalize(v.city), normalize(v.state), normalize(v.zip)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

async function fetchHtml(url: string) {
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-cache",
      headers: { "user-agent": "RI-USSSA-VenueLinker/1.0" },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(contentType)) return null;
    return await resp.text();
  } catch {
    return null;
  }
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
    .or(
      "source_url.ilike.%usssa.com/event/%,official_website_url.ilike.%usssa.com/event/%,source_url.ilike.%fastpitch.usssa.com/event/%,official_website_url.ilike.%fastpitch.usssa.com/event/%"
    )
    .order("updated_at", { ascending: false })
    .limit(LIMIT);
  if (tournamentErr) throw tournamentErr;
  const tournaments = ((tournamentsRaw ?? []) as TournamentRow[]).filter((t) =>
    SPORT_FILTER ? clean(t.sport) === SPORT_FILTER : true
  );

  const ids = tournaments.map((t) => t.id);
  const linked = new Set<string>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunkIds = ids.slice(i, i + CHUNK);
    if (!chunkIds.length) continue;
    const { data: linksRaw, error: linksErr } = await supabase
      .from("tournament_venues" as any)
      .select("tournament_id")
      .in("tournament_id", chunkIds);
    if (linksErr) throw linksErr;
    for (const row of (linksRaw ?? []) as Array<{ tournament_id: string | null }>) {
      if (row.tournament_id) linked.add(row.tournament_id);
    }
  }

  const targets = tournaments.filter((t) => !linked.has(t.id));

  const { data: venuesRaw, error: venuesErr } = await supabase
    .from("venues" as any)
    .select("id,name,address,address1,city,state,zip,venue_url")
    .limit(50000);
  if (venuesErr) throw venuesErr;
  const venues = (venuesRaw ?? []) as VenueRow[];
  const { data: owlRunVenueRows } = await supabase
    .from("owls_eye_runs" as any)
    .select("venue_id")
    .not("venue_id", "is", null)
    .limit(50000);
  const owlRunVenueIds = new Set(
    ((owlRunVenueRows ?? []) as Array<{ venue_id?: string | null }>)
      .map((r) => String(r.venue_id ?? ""))
      .filter(Boolean)
  );

  const byAddressCityState = new Map<string, VenueRow[]>();
  const byNameCityState = new Map<string, VenueRow[]>();
  const byAddressStateZip = new Map<string, VenueRow[]>();
  const byStreetStateZip = new Map<string, VenueRow[]>();
  const byStreetCityState = new Map<string, VenueRow[]>();
  const addToMap = (map: Map<string, VenueRow[]>, key: string, row: VenueRow) => {
    if (!key) return;
    map.set(key, [...(map.get(key) ?? []), row]);
  };
  const indexVenue = (v: VenueRow) => {
    const addr = clean(v.address1) ?? clean(v.address);
    const zip = normalizeZip(v.zip);
    const street = normalizeStreet(addr);
    if (addr && v.city && v.state) {
      addToMap(byAddressCityState, [normalize(addr), normalize(v.city), normalize(v.state)].join("|"), v);
    }
    if (v.name && v.city && v.state) {
      addToMap(byNameCityState, [normalize(v.name), normalize(v.city), normalize(v.state)].join("|"), v);
    }
    if (addr && v.state && zip) {
      addToMap(byAddressStateZip, [normalize(addr), normalize(v.state), zip].join("|"), v);
    }
    if (street && v.state && zip) {
      addToMap(byStreetStateZip, [street, normalize(v.state), zip].join("|"), v);
    }
    if (street && v.city && v.state) {
      addToMap(byStreetCityState, [street, normalize(v.city), normalize(v.state)].join("|"), v);
    }
  };
  venues.forEach(indexVenue);

  const pickBestVenue = (list: VenueRow[]) => {
    if (!list.length) return null;
    const ranked = [...list].sort((a, b) => {
      const aOwl = owlRunVenueIds.has(a.id) ? 1 : 0;
      const bOwl = owlRunVenueIds.has(b.id) ? 1 : 0;
      if (aOwl !== bOwl) return bOwl - aOwl;
      const aHasUrl = clean(a.venue_url) ? 1 : 0;
      const bHasUrl = clean(b.venue_url) ? 1 : 0;
      if (aHasUrl !== bHasUrl) return bHasUrl - aHasUrl;
      return 0;
    });
    return ranked[0] ?? null;
  };

  let scanned = 0;
  let withVenueData = 0;
  let linkedExisting = 0;
  let created = 0;
  let linksInserted = 0;
  let failures = 0;

  for (const t of targets) {
    scanned += 1;
    const url =
      (isUsssaEventUrl(t.official_website_url) ? t.official_website_url : null) ??
      (isUsssaEventUrl(t.source_url) ? t.source_url : null);
    if (!url) continue;

    try {
      const html = await fetchHtml(url);
      if (!html) continue;
      const $ = cheerio.load(html);
      const parsed = dedupeVenues([
        ...parseTableVenues($, t.city, t.state),
        ...parseDataMapLocations($, t.city, t.state),
        ...parseJsonLdVenues($, t.city, t.state),
        ...parseMapLinksOnly($, t.city, t.state),
      ]);
      if (!parsed.length) continue;
      withVenueData += 1;

      for (const pv of parsed) {
        const city = clean(pv.city) ?? clean(t.city);
        const state = clean(pv.state)?.toUpperCase() ?? clean(t.state)?.toUpperCase() ?? null;
        const address = clean(pv.address);
        const zip = normalizeZip(pv.zip);
        const street = normalizeStreet(address);
        if (!address || !city || !state) continue;

        const addrKey = [normalize(address), normalize(city), normalize(state)].join("|");
        const nameKey = [normalize(pv.name), normalize(city), normalize(state)].join("|");
        const addrZipKey = zip ? [normalize(address), normalize(state), zip].join("|") : "";
        const streetZipKey = zip ? [street, normalize(state), zip].join("|") : "";
        const streetCityKey = [street, normalize(city), normalize(state)].join("|");

        const matchCandidates: VenueRow[] = [
          ...(byAddressCityState.get(addrKey) ?? []),
          ...(pv.name ? byNameCityState.get(nameKey) ?? [] : []),
          ...(addrZipKey ? byAddressStateZip.get(addrZipKey) ?? [] : []),
          ...(streetZipKey ? byStreetStateZip.get(streetZipKey) ?? [] : []),
          ...(street ? byStreetCityState.get(streetCityKey) ?? [] : []),
        ];
        const uniqueCandidates = Array.from(new Map(matchCandidates.map((v) => [v.id, v])).values());
        let venue = pickBestVenue(uniqueCandidates);

        if (!venue && APPLY) {
          const payload: Record<string, unknown> = {
            name: clean(pv.name) ?? address,
            address,
            address1: address,
            city,
            state,
            zip: clean(pv.zip),
            // The current DB constraint does not yet allow `softball` on venues.
            sport: ALLOWED_VENUE_SPORTS.has(clean(t.sport) ?? "") ? clean(t.sport) : null,
            venue_url: clean(pv.venue_url),
          };
          const { data: insertRaw, error: insertErr } = await supabase
            .from("venues" as any)
            .insert(payload)
            .select("id,name,address,address1,city,state,zip,venue_url")
            .single();
          if (insertErr) throw insertErr;
          venue = insertRaw as VenueRow;
          indexVenue(venue);
          created += 1;
        } else if (venue && APPLY && !venue.venue_url && pv.venue_url) {
          const { data: updatedRaw, error: updateErr } = await supabase
            .from("venues" as any)
            .update({ venue_url: pv.venue_url })
            .eq("id", venue.id)
            .select("id,name,address,address1,city,state,zip,venue_url")
            .single();
          if (!updateErr && updatedRaw) {
            venue = updatedRaw as VenueRow;
            indexVenue(venue);
          }
        }

        if (!venue) {
          linkedExisting += 1; // dry-run estimated link
          continue;
        }

        if (APPLY) {
          const { error: linkErr } = await supabase
            .from("tournament_venues" as any)
            .upsert({ tournament_id: t.id, venue_id: venue.id }, { onConflict: "tournament_id,venue_id" });
          if (linkErr) throw linkErr;
          linksInserted += 1;
        } else {
          linksInserted += 1;
        }

        if (!APPLY) {
          if (uniqueCandidates.length > 0) linkedExisting += 1;
          else created += 1;
        } else if (uniqueCandidates.length > 0) {
          linkedExisting += 1;
        }
      }
    } catch (error) {
      failures += 1;
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null
            ? JSON.stringify(error)
            : String(error);
      console.error(`[link_usssa_missing_venues] ${t.id} failed: ${msg}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        sport_filter: SPORT_FILTER,
        usssa_tournaments_scanned: tournaments.length,
        usssa_without_linked_venue: targets.length,
        pages_scanned: scanned,
        pages_with_venue_data: withVenueData,
        linked_existing: linkedExisting,
        created_venues: created,
        tournament_venue_links_upserted: linksInserted,
        failures,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
