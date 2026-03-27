import { createClient } from "@supabase/supabase-js";
import { makeVenueSlug } from "../../apps/referee/lib/venues/slug";
import * as cheerio from "cheerio";

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  source_url: string | null;
  official_website_url: string | null;
  tournament_association: string | null;
  skip_venue_discovery?: boolean | null;
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
  source_url: string | null;
};

const APPLY = process.argv.includes("--apply");
const USE_RPC = process.argv.includes("--use-rpc");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1])) : 1500;
const OFFSET_ARG = process.argv.find((arg) => arg.startsWith("--offset="));
const OFFSET = OFFSET_ARG ? Math.max(0, Number(OFFSET_ARG.split("=")[1])) : 0;
const INCLUDE_JUNK_LINKED = process.argv.includes("--include-junk-linked");
const CHUNK_SIZE = 200;
const MAX_DISCOVERY_PAGES = 8;
const MAX_VENUES_PER_TOURNAMENT = 5;
const MAX_PDF_BYTES = 4_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const BLOCKED_VENUE_IDS = new Set(
  String(process.env.VENUE_LINK_BLOCKLIST_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function normalizedState(value: string | null | undefined) {
  const s = String(value ?? "").trim().toUpperCase();
  return s || null;
}

function statesConflict(tournamentState: string | null | undefined, venueState: string | null | undefined) {
  const t = normalizedState(tournamentState);
  const v = normalizedState(venueState);
  if (!t || !v) return false;
  return t !== v;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeJunkVenueName(name: string | null | undefined) {
  const n = clean(name);
  if (!n) return false;
  return (
    /\b(born\s*\d{4}|\d{1,2}u\b|girls?\d{1,2}u|boys?\d{1,2}u|program|coach:|size\s*\d+)\b/i.test(n) ||
    /\b(minutes?|mins?)\b/i.test(n) ||
    /\b(apply by|check[-\s]?in|register|registration|deadline|format|scope|price|cost|entry fee|team fee)\b/i.test(n) ||
    /^(unknown|tbd|n\/a|null|none|-+)$/i.test(n) ||
    /^(\d{1,2}u|\d{4}\/\d{4}|born\s+\d{4}(?:\/\d{4})*|\d+\s*min\.?.*)$/i.test(n)
  );
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

function looksLikeStreetAddress(address: string | null | undefined) {
  const a = clean(address);
  if (!a) return false;
  if (/^(unknown|tbd|n\/a|null|none|-+)$/i.test(a)) return false;
  if (!/^\d{1,6}\s+/.test(a)) return false;
  if (/\b(min|mins|minutes)\b/i.test(a)) return false;
  if (/\b(size\s*\d+|coach:|girls?\d{1,2}u|boys?\d{1,2}u|\d{1,2}u)\b/i.test(a)) return false;
  if (/\b(apply by|check[-\s]?in|register|registration|deadline|scope|format|entry fee|team fee)\b/i.test(a)) return false;
  if (!/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct|circle|cir|parkway|pkwy|place|pl|terrace|ter|trail|trl|highway|hwy)\b/i.test(a)) {
    return false;
  }
  return true;
}

function parseAddress(
  rawInput: string,
  fallbackCity: string | null,
  fallbackState: string | null
): { address: string; city: string | null; state: string | null; zip: string | null } | null {
  const raw = clean(rawInput);
  if (!raw) return null;
  const stripped = raw.replace(/\s*,\s*(USA|US|United States)\s*$/i, "").trim();

  const full = stripped.match(
    /^(.*?),\s*([^,]+),\s*([A-Z]{2})\s*,?\s*(\d{5}(?:-\d{4})?)(?:\s*,\s*[A-Z]{2})?$/i
  );
  if (full) {
    return {
      address: clean(full[1]) ?? stripped,
      city: clean(full[2]),
      state: (clean(full[3]) ?? "").toUpperCase() || null,
      zip: clean(full[4]),
    };
  }

  const short = stripped.match(/^(.*?),\s*([^,]+),\s*([A-Z]{2})$/i);
  if (short) {
    return {
      address: clean(short[1]) ?? stripped,
      city: clean(short[2]),
      state: (clean(short[3]) ?? "").toUpperCase() || null,
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

function extractAddressCandidates(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ");
  const pattern =
    /\b\d{1,6}\s+[A-Za-z0-9.\-#'\s]{2,120},\s*[A-Za-z.\-'\s]{2,80},\s*[A-Z]{2}\s*,?\s*\d{5}(?:-\d{4})?\b/g;
  return Array.from(new Set(Array.from(normalized.matchAll(pattern)).map((m) => m[0].trim())));
}

function extractPdfTextHints(bytes: Uint8Array): string {
  // Lightweight fallback: many PDFs still expose readable text tokens even when structured streams vary.
  const raw = Buffer.from(bytes).toString("latin1");
  return raw
    .replace(/\\\([nrtbf\\()]/g, " ")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseVenueCandidatesFromPdf(
  pdfUrl: string,
  bytes: Uint8Array,
  fallbackCity: string | null,
  fallbackState: string | null
): ParsedVenue[] {
  const text = extractPdfTextHints(bytes);
  const addresses = extractAddressCandidates(text);
  const out: ParsedVenue[] = [];
  const seen = new Set<string>();
  for (const addressText of addresses) {
    const parsed = parseAddress(addressText, fallbackCity, fallbackState);
    if (!parsed) continue;
    const key = [normalize(parsed.address), normalize(parsed.city), normalize(parsed.state), normalize(parsed.zip)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: null,
      address: parsed.address,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      venue_url: pdfUrl,
      source_url: pdfUrl,
    });
  }
  return out;
}

function parseVenueCandidatesFromPage(
  pageUrl: string,
  html: string,
  fallbackCity: string | null,
  fallbackState: string | null
): ParsedVenue[] {
  const $ = cheerio.load(html);
  const out: ParsedVenue[] = [];
  const seen = new Set<string>();

  const tryPush = (venue: ParsedVenue) => {
    const key = [
      normalize(venue.name),
      normalize(venue.address),
      normalize(venue.city),
      normalize(venue.state),
      normalize(venue.zip),
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(venue);
  };

  $("table tr").each((_idx, row) => {
    const tds = $(row).find("td");
    if (tds.length < 2) return;
    const name = clean($(tds[0]).text());
    const addressText = clean($(tds[1]).text());
    const href = clean($(tds[2]).find("a[href]").attr("href"));
    if (!addressText) return;
    const parsed = parseAddress(addressText, fallbackCity, fallbackState);
    if (!parsed) return;
    tryPush({
      name,
      address: parsed.address,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      venue_url: href ? new URL(href, pageUrl).toString() : pageUrl,
      source_url: pageUrl,
    });
  });

  $("li,p,div").each((_idx, el) => {
    const text = clean($(el).text());
    if (!text) return;
    const addresses = extractAddressCandidates(text);
    if (!addresses.length) return;
    const strong = clean($(el).find("strong,b,h2,h3,h4").first().text());
    for (const addressText of addresses) {
      const parsed = parseAddress(addressText, fallbackCity, fallbackState);
      if (!parsed) continue;
      const localMap = clean($(el).find("a[href*='google.com/maps'],a[href*='maps.apple'],a[href*='waze.com']").first().attr("href"));
      tryPush({
        name: strong,
        address: parsed.address,
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
        venue_url: localMap ? new URL(localMap, pageUrl).toString() : pageUrl,
        source_url: pageUrl,
      });
    }
  });

  return out;
}

function discoverVenuePages(baseUrl: string, html: string): string[] {
  const $ = cheerio.load(html);
  const out = new Set<string>();

  $("a[href]").each((_idx, el) => {
    const href = clean($(el).attr("href"));
    if (!href) return;
    const linkText = clean($(el).text()) ?? "";
    const blob = `${href} ${linkText}`.toLowerCase();
    if (!/(venue|venues|field|fields|park|complex|location|locations|map|maps|directions)/.test(blob)) return;
    try {
      const absolute = new URL(href, baseUrl).toString();
      if (!/^https?:\/\//i.test(absolute)) return;
      out.add(absolute);
    } catch {
      return;
    }
  });

  out.add(baseUrl);
  return Array.from(out).slice(0, MAX_DISCOVERY_PAGES);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-cache",
      headers: { "user-agent": "RI-AYSO-VenueLinker/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(type)) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchPdfBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-cache",
      headers: { "user-agent": "RI-AYSO-VenueLinker/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/application\/pdf/i.test(type) && !/\.pdf($|\?)/i.test(url)) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_PDF_BYTES) return null;
    return new Uint8Array(ab);
  } catch {
    return null;
  }
}

function isLikelyUsefulUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (!/^https?:\/\//.test(lower)) return false;
  if (/(facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|tiktok\.com|linkedin\.com)/.test(lower))
    return false;
  return /(ayso|tournament|event|soccer|club|fields|venues|facility|park|complex|sports)/.test(lower);
}

function decodeDuckUrl(href: string): string | null {
  try {
    const u = new URL(href, "https://duckduckgo.com");
    if (u.pathname === "/l/") {
      const uddg = u.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
    if (/^https?:\/\//i.test(href)) return href;
    return null;
  } catch {
    return null;
  }
}

async function discoverCandidateUrls(tournament: TournamentRow): Promise<string[]> {
  const sport = clean(tournament.sport) ?? "sports";
  const queries = [
    `${tournament.name ?? ""} ${tournament.city ?? ""} ${tournament.state ?? ""} ${sport} tournament fields`,
    `${tournament.name ?? ""} ${tournament.city ?? ""} ${tournament.state ?? ""} venues`,
  ]
    .map((q) => q.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out = new Set<string>();

  for (const query of queries) {
    try {
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        cache: "no-cache",
        headers: { "user-agent": "RI-VenueLinker/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      $("a.result__a, a[href*='/l/?uddg=']").each((_idx, el) => {
        const href = clean($(el).attr("href"));
        if (!href) return;
        const decoded = decodeDuckUrl(href);
        if (!decoded) return;
        if (!isLikelyUsefulUrl(decoded)) return;
        out.add(decoded);
      });
      if (out.size >= 8) break;
    } catch {
      continue;
    }
  }
  return Array.from(out).slice(0, 8);
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

  let rpcTotalCount: number | null = null;
  let tournaments: TournamentRow[] = [];
  let linkedVenueIdsByTournament = new Map<string, string[]>();

  if (USE_RPC) {
    // Preferred paging: use the DB RPC that directly returns published canonical tournaments
    // missing venue links. This avoids PostgREST row caps when scanning the backlog.
    const { data: missingRowsRaw, error: missingErr } = await (supabase as any).rpc(
      "list_missing_venue_link_tournaments",
      {
        p_limit: LIMIT,
        p_offset: OFFSET,
        p_state: null,
        p_q: null,
      }
    );
    if (missingErr) throw missingErr;
    const missingRows = (missingRowsRaw ?? []) as Array<{
      id: string;
      name: string | null;
      city: string | null;
      state: string | null;
      source_url: string | null;
      official_website_url: string | null;
      total_count?: number | null;
    }>;
    rpcTotalCount = Number(missingRows[0]?.total_count ?? 0) || 0;

    const ids = missingRows.map((r) => r.id).filter(Boolean);
    if (!ids.length) {
      console.log(
        JSON.stringify(
          {
            mode: APPLY ? "apply" : "dry-run",
            missing_total: rpcTotalCount,
            offset: OFFSET,
            limit: LIMIT,
            tournaments_in_chunk: 0,
            pages_scanned: 0,
            tournaments_with_venue_data: 0,
            linked_existing: 0,
            created_venues: 0,
            tournament_venue_links_upserted: 0,
            source_discovery_hits: 0,
            failures: 0,
          },
          null,
          2
        )
      );
      return;
    }

    // Hydrate sport + association (RPC does not return sport).
    const { data: tournamentMetaRaw, error: metaErr } = await supabase
      .from("tournaments" as any)
      .select("id,sport,tournament_association")
      .in("id", ids);
    if (metaErr) throw metaErr;
    const metaById = new Map(
      ((tournamentMetaRaw ?? []) as Array<{ id: string; sport?: string | null; tournament_association?: string | null }>).map(
        (r) => [r.id, r]
      )
    );

    tournaments = missingRows.map((r) => {
      const meta = metaById.get(r.id);
      return {
        id: r.id,
        name: r.name,
        sport: meta?.sport ?? null,
        city: r.city,
        state: r.state,
        source_url: r.source_url,
        official_website_url: r.official_website_url,
        tournament_association: meta?.tournament_association ?? null,
      } satisfies TournamentRow;
    });

    // In USE_RPC mode all tournaments are missing venue links by definition.
    linkedVenueIdsByTournament = new Map();
  } else {
    const { data: tournamentsRaw, error: tournamentErr } = await supabase
      .from("tournaments" as any)
      .select("id,name,sport,city,state,source_url,official_website_url,tournament_association,status,is_canonical,skip_venue_discovery")
      .eq("status", "published")
      .eq("is_canonical", true)
      .or("tournament_association.is.null,tournament_association.neq.AYSO")
      .not("name", "ilike", "%AYSO%")
      .order("updated_at", { ascending: false })
      .limit(5000);
    if (tournamentErr) throw tournamentErr;
    tournaments = ((tournamentsRaw ?? []) as TournamentRow[]).filter((t) => !Boolean((t as any).skip_venue_discovery));

    const tIds = tournaments.map((t) => t.id);
    const linkedTournaments = new Set<string>();
    linkedVenueIdsByTournament = new Map<string, string[]>();
    for (let i = 0; i < tIds.length; i += CHUNK_SIZE) {
      const chunk = tIds.slice(i, i + CHUNK_SIZE);
      if (!chunk.length) continue;
      const { data: linksRaw, error: linksErr } = await supabase
        .from("tournament_venues" as any)
        .select("tournament_id,venue_id")
        .in("tournament_id", chunk);
      if (linksErr) throw linksErr;
      for (const row of (linksRaw ?? []) as Array<{ tournament_id: string | null; venue_id?: string | null }>) {
        if (!row.tournament_id) continue;
        linkedTournaments.add(row.tournament_id);
        if (row.venue_id) {
          const existing = linkedVenueIdsByTournament.get(row.tournament_id) ?? [];
          existing.push(row.venue_id);
          linkedVenueIdsByTournament.set(row.tournament_id, existing);
        }
      }
    }
  }

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

  const byAddrCityState = new Map<string, VenueRow[]>();
  const byNameCityState = new Map<string, VenueRow[]>();
  const byAddrStateZip = new Map<string, VenueRow[]>();
  const byStreetStateZip = new Map<string, VenueRow[]>();
  const byStreetCityState = new Map<string, VenueRow[]>();
  const venueById = new Map<string, VenueRow>();
  const addToMap = (map: Map<string, VenueRow[]>, key: string, row: VenueRow) => {
    if (!key) return;
    map.set(key, [...(map.get(key) ?? []), row]);
  };
  const indexVenue = (v: VenueRow) => {
    if (v.id) venueById.set(v.id, v);
    const addr = clean(v.address1) ?? clean(v.address);
    const zip = normalizeZip(v.zip);
    const street = normalizeStreet(addr);
    if (addr && v.city && v.state) {
      addToMap(byAddrCityState, [normalize(addr), normalize(v.city), normalize(v.state)].join("|"), v);
    }
    if (v.name && v.city && v.state) {
      addToMap(byNameCityState, [normalize(v.name), normalize(v.city), normalize(v.state)].join("|"), v);
    }
    if (addr && v.state && zip) {
      addToMap(byAddrStateZip, [normalize(addr), normalize(v.state), zip].join("|"), v);
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

  const hasValidLinkedVenue = (tournamentId: string) => {
    const linkedVenueIds = linkedVenueIdsByTournament.get(tournamentId) ?? [];
    for (const venueId of linkedVenueIds) {
      const venue = venueById.get(venueId);
      if (!venue) continue;
      const addr = clean(venue.address1) ?? clean(venue.address);
      const safeName = looksLikeJunkVenueName(venue.name) ? null : clean(venue.name);
      if (!addr || !looksLikeStreetAddress(addr)) continue;
      if (safeName || addr) return true;
    }
    return false;
  };

  const missingAll = USE_RPC
    ? tournaments
    : tournaments.filter((t) => {
        // When not using the RPC we infer missing by checking tournament_venues rows.
        // (In USE_RPC mode the DB already returned only missing-link tournaments.)
        const linkedVenueIds = linkedVenueIdsByTournament.get(t.id) ?? [];
        const hasAnyLink = linkedVenueIds.length > 0;
        if (!hasAnyLink) return true;
        if (!INCLUDE_JUNK_LINKED) return false;
        return !hasValidLinkedVenue(t.id);
      });
  const targets = USE_RPC ? tournaments : missingAll.slice(OFFSET, OFFSET + LIMIT);

  let pagesScanned = 0;
  let tournamentsWithVenueData = 0;
  let linkedExisting = 0;
  let created = 0;
  let linksUpserted = 0;
  let failures = 0;
  let discoveryHits = 0;
  let skippedJunkName = 0;
  let skippedBadAddress = 0;
  let skippedMissingLocality = 0;
  let skippedDuplicateInTournament = 0;
  let skippedStateMismatch = 0;
  let skippedBlockedVenue = 0;

  for (const t of targets) {
    try {
      const baseUrl = clean(t.official_website_url) ?? clean(t.source_url);
      if (!baseUrl) continue;
      const baseHtml = await fetchHtml(baseUrl);
      if (!baseHtml) continue;

      const pages = discoverVenuePages(baseUrl, baseHtml);
      const parsedAll: ParsedVenue[] = [];

      for (const pageUrl of pages) {
        if (/\.pdf($|\?)/i.test(pageUrl)) {
          const pdfBytes = await fetchPdfBytes(pageUrl);
          if (!pdfBytes) continue;
          pagesScanned += 1;
          parsedAll.push(...parseVenueCandidatesFromPdf(pageUrl, pdfBytes, t.city, t.state));
          continue;
        }
        const html = pageUrl === baseUrl ? baseHtml : await fetchHtml(pageUrl);
        if (!html) continue;
        pagesScanned += 1;
        parsedAll.push(...parseVenueCandidatesFromPage(pageUrl, html, t.city, t.state));
      }

      if (!parsedAll.length) {
        const discoveredUrls = await discoverCandidateUrls(t);
        if (discoveredUrls.length) discoveryHits += 1;
        for (const discovered of discoveredUrls) {
          const html = await fetchHtml(discovered);
          if (!html) continue;
          pagesScanned += 1;
          const discoveredPages = discoverVenuePages(discovered, html);
          for (const pageUrl of discoveredPages) {
            if (/\.pdf($|\?)/i.test(pageUrl)) {
              const pdfBytes = await fetchPdfBytes(pageUrl);
              if (!pdfBytes) continue;
              const parsedFromPdf = parseVenueCandidatesFromPdf(pageUrl, pdfBytes, t.city, t.state);
              parsedAll.push(...parsedFromPdf);
              continue;
            }
            const subHtml = pageUrl === discovered ? html : await fetchHtml(pageUrl);
            if (!subHtml) continue;
            const parsedFromPage = parseVenueCandidatesFromPage(pageUrl, subHtml, t.city, t.state);
            parsedAll.push(...parsedFromPage);
          }
          if (parsedAll.length) {
            if (APPLY && !clean(t.official_website_url) && !clean(t.source_url)) {
              await supabase
                .from("tournaments" as any)
                .update({ official_website_url: discovered })
                .eq("id", t.id);
            }
            break;
          }
        }
      }

      if (!parsedAll.length) continue;
      tournamentsWithVenueData += 1;

      const seenPerTournament = new Set<string>();
      let linksThisTournament = 0;
      for (const pv of parsedAll) {
        if (linksThisTournament >= MAX_VENUES_PER_TOURNAMENT) break;
        const city = clean(pv.city) ?? clean(t.city);
        const state = clean(pv.state)?.toUpperCase() ?? clean(t.state)?.toUpperCase() ?? null;
        const addr = clean(pv.address);
        const zip = normalizeZip(pv.zip);
        const street = normalizeStreet(addr);
        const rawName = clean(pv.name);
        const safeName = looksLikeJunkVenueName(rawName) ? null : rawName;
        if (rawName && !safeName) skippedJunkName += 1;
        if (!addr || !city || !state) {
          skippedMissingLocality += 1;
          continue;
        }
        if (!looksLikeStreetAddress(addr)) {
          skippedBadAddress += 1;
          continue;
        }

        const dedupeKey = [normalize(addr), normalize(city), normalize(state)].join("|");
        if (seenPerTournament.has(dedupeKey)) {
          skippedDuplicateInTournament += 1;
          continue;
        }
        seenPerTournament.add(dedupeKey);

        const addrKey = [normalize(addr), normalize(city), normalize(state)].join("|");
        const nameKey = [normalize(safeName), normalize(city), normalize(state)].join("|");
        const addrZipKey = zip ? [normalize(addr), normalize(state), zip].join("|") : "";
        const streetZipKey = zip ? [street, normalize(state), zip].join("|") : "";
        const streetCityKey = [street, normalize(city), normalize(state)].join("|");
        const matchCandidates: VenueRow[] = [
          ...(byAddrCityState.get(addrKey) ?? []),
          ...(safeName ? byNameCityState.get(nameKey) ?? [] : []),
          ...(addrZipKey ? byAddrStateZip.get(addrZipKey) ?? [] : []),
          ...(streetZipKey ? byStreetStateZip.get(streetZipKey) ?? [] : []),
          ...(street ? byStreetCityState.get(streetCityKey) ?? [] : []),
        ];
        const uniqueCandidates = Array.from(new Map(matchCandidates.map((v) => [v.id, v])).values());
        let venue = pickBestVenue(uniqueCandidates);
        let wasExisting = Boolean(venue);

        if (!venue && APPLY) {
          // Avoid inserting address-only "venues" when we couldn't extract a real venue name.
          if (!safeName) continue;
          const payload: Record<string, unknown> = {
            name: safeName,
            address: addr,
            address1: addr,
            city,
            state,
            zip: clean(pv.zip),
            sport: clean(t.sport),
            venue_url: clean(pv.venue_url),
            seo_slug: makeVenueSlug(safeName ?? addr, city, state),
          };
          const { data: insertedRaw, error: insertErr } = await supabase
            .from("venues" as any)
            .insert(payload)
            .select("id,name,address,address1,city,state,zip,venue_url")
            .single();
          if (insertErr) {
            // When multiple tournaments share the same venue page/address we may race the unique
            // constraint on (name,address,city,state). If that happens, re-select the existing row.
            if (String((insertErr as any)?.code ?? "") === "23505") {
              const venueName = String(payload.name ?? "").trim();
              const { data: existingRows, error: selectErr } = await supabase
                .from("venues" as any)
                .select("id,name,address,address1,city,state,zip,venue_url")
                .eq("name", venueName)
                .eq("address", addr)
                .eq("city", city)
                .eq("state", state)
                .limit(2);
              if (selectErr) throw selectErr;
              const rows = (existingRows ?? []).filter((r: any) => r?.id);
              if (rows.length === 1) {
                venue = rows[0] as VenueRow;
                indexVenue(venue);
                wasExisting = true;
              } else {
                throw insertErr;
              }
            } else {
              throw insertErr;
            }
          } else {
            venue = insertedRaw as VenueRow;
            indexVenue(venue);
            created += 1;
            wasExisting = false;
          }
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
          if (!APPLY) created += 1;
          continue;
        }
        if (BLOCKED_VENUE_IDS.has(venue.id)) {
          skippedBlockedVenue += 1;
          continue;
        }
        if (statesConflict(t.state, venue.state)) {
          skippedStateMismatch += 1;
          continue;
        }
        if (wasExisting) linkedExisting += 1;

        if (APPLY) {
          const { error: linkErr } = await supabase
            .from("tournament_venues" as any)
            .upsert({ tournament_id: t.id, venue_id: venue.id }, { onConflict: "tournament_id,venue_id" });
          if (linkErr) throw linkErr;
          linksUpserted += 1;
          linksThisTournament += 1;
        } else {
          linksUpserted += 1;
          linksThisTournament += 1;
        }
      }

    } catch (error) {
      failures += 1;
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
          ? error
          : (() => {
              try {
                return JSON.stringify(error);
              } catch {
                return String(error);
              }
            })();
      console.error(`[link_missing_venues_deep] ${t.id} failed: ${message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        tournaments_scanned: tournaments.length,
        missing_total: USE_RPC ? rpcTotalCount : null,
        non_ayso_without_linked_venue_total: USE_RPC ? null : missingAll.length,
        non_ayso_without_linked_venue_in_chunk: targets.length,
        offset: OFFSET,
        limit: LIMIT,
        include_junk_linked: INCLUDE_JUNK_LINKED,
        pages_scanned: pagesScanned,
        tournaments_with_venue_data: tournamentsWithVenueData,
        linked_existing: linkedExisting,
        created_venues: created,
        tournament_venue_links_upserted: linksUpserted,
        source_discovery_hits: discoveryHits,
        failures,
        skipped_junk_name: skippedJunkName,
        skipped_bad_address: skippedBadAddress,
        skipped_missing_locality: skippedMissingLocality,
        skipped_duplicate_in_tournament: skippedDuplicateInTournament,
        skipped_state_mismatch: skippedStateMismatch,
        skipped_blocked_venue: skippedBlockedVenue,
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
