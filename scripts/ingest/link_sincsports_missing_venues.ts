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
  reason: "missing_url" | "fetch_empty" | "no_fields_section" | "no_venues_found" | "error";
  detail?: string;
};

const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 5000;
const SPORT_ARG = process.argv.find((arg) => arg.startsWith("--sport="));
const SPORT_FILTER = SPORT_ARG ? clean(SPORT_ARG.split("=")[1]) : null;

// Matches the SincSports tournament details pages we commonly store.
function isSincSportsTournamentUrl(value: string | null | undefined) {
  // We often store: details.aspx, TTContent.aspx, TTMore.aspx, TTSchedules.aspx...
  return /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?sincsports\.com\/(?:details|TTContent|TTMore|TTSchedules)\.aspx\?/i.test(
    String(value ?? "")
  );
}

const ALLOWED_VENUE_SPORTS = new Set([
  "soccer",
  "baseball",
  "lacrosse",
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
      headers: { "user-agent": "RI-SincSports-VenueLinker/1.0" },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(contentType)) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function looksLikeVenueName(text: string) {
  const t = normalize(text);
  if (!t) return false;
  // Filter out age group / labels that show up as <strong> blocks in the FIELDS section.
  if (/\b(u\d+|older|younger|boys|girls|all)\b/.test(t)) return false;
  if (/\bfields?\b/.test(t)) return false;
  if (/\bparking\b/.test(t)) return false;
  if (/\breferee\b/.test(t)) return false;
  if (/\bsubject to change\b/.test(t)) return false;
  if (t.length < 4) return false;
  return true;
}

function parseCityStateZip(line: string): { city: string; state: string; zip: string | null } | null {
  const v = clean(line);
  if (!v) return null;
  const m = v.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  if (!m) return null;
  const city = clean(m[1]);
  const state = (clean(m[2]) ?? "").toUpperCase();
  const zip = clean(m[3]) ?? null;
  if (!city || !state) return null;
  return { city, state, zip };
}

function toDetailsUrl(url: string): string | null {
  // Convert any stored SincSports tournament URL into a stable details page URL.
  // Example inputs:
  // - https://soccer.sincsports.com/details.aspx?tid=FSAINTCUP&tab=1
  // - https://soccer.sincsports.com/TTMore.aspx?tid=BATTOB&tab=1...
  // - https://soccer.sincsports.com/TTContent.aspx?tid=GULFC&tab=1
  try {
    const u = new URL(url);
    const tid = clean(u.searchParams.get("tid"));
    if (!tid) return null;
    return `${u.protocol}//${u.host}/details.aspx?tid=${encodeURIComponent(tid)}&tab=1`;
  } catch {
    return null;
  }
}

function parseFieldsVenues($: cheerio.CheerioAPI): { venues: ParsedVenue[]; hasFieldsSection: boolean } {
  // The fields section is typically a "cat" div that contains an h1 with text "FIELDS".
  const fieldRoot = $("div.cat").filter((_, el) => normalize($(el).text()).includes("fields"));
  if (!fieldRoot.length) return { venues: [], hasFieldsSection: false };

  // Prefer the first root that actually contains the "FIELDS" heading.
  const root =
    fieldRoot
      .toArray()
      .map((el) => $(el))
      .find((node) => normalize(node.find("h1").first().text()).includes("fields")) ?? fieldRoot.first();

  // Walk the root in document order and associate address pairs to the closest prior venue-ish <strong> text.
  let currentName: string | null = null;
  const addressLines: string[] = [];
  const out: ParsedVenue[] = [];

  // Address anchors are marked by Apple's "data detectors" on many pages.
  const walker = root.find("*").toArray();
  for (const el of walker) {
    const node = $(el);

    // Capture possible venue names.
    if (el.tagName && el.tagName.toLowerCase() === "strong") {
      const t = clean(node.text());
      if (t && looksLikeVenueName(t)) currentName = t;
    }

    // Address line candidates.
    if (el.tagName && el.tagName.toLowerCase() === "a") {
      const typ = (node.attr("x-apple-data-detectors-type") ?? "").toLowerCase();
      const text = clean(node.text());
      if (typ === "address" && text) {
        addressLines.push(text);
      }
    }
  }

  // Some pages have the address lines but do not include the x-apple attributes.
  // Fall back to scanning for lines that look like street + city/state/zip within the root text blocks.
  if (!addressLines.length) {
    const raw = root.text().split(/\n/).map((s) => s.trim()).filter(Boolean);
    for (const line of raw) {
      if (parseCityStateZip(line)) addressLines.push(line);
    }
  }

  // If we didn't see any address lines in the whole section, bail.
  if (!addressLines.length) return { venues: [], hasFieldsSection: true };

  // Re-walk with a state machine so we can associate each (street, cityStateZip) pair to the correct venue name.
  currentName = null;
  let street: string | null = null;
  let cityStateZip: { city: string; state: string; zip: string | null } | null = null;

  for (const el of walker) {
    const node = $(el);

    if (el.tagName && el.tagName.toLowerCase() === "strong") {
      const t = clean(node.text());
      if (t && looksLikeVenueName(t)) currentName = t;
    }

    if (el.tagName && el.tagName.toLowerCase() === "a") {
      const typ = (node.attr("x-apple-data-detectors-type") ?? "").toLowerCase();
      const text = clean(node.text());
      if (typ === "address" && text) {
        const parsedCity = parseCityStateZip(text);
        if (parsedCity) {
          cityStateZip = parsedCity;
        } else {
          street = text;
        }

        if (currentName && street && cityStateZip) {
          out.push({
            name: currentName,
            address: street,
            city: cityStateZip.city,
            state: cityStateZip.state,
            zip: cityStateZip.zip,
            venue_url: null,
          });
          street = null;
          cityStateZip = null;
        }
      }
    }
  }

  // Dedupe by unique key.
  const seen = new Set<string>();
  const deduped: ParsedVenue[] = [];
  for (const v of out) {
    const key = [normalize(v.name), normalize(v.address), normalize(v.city), normalize(v.state), normalize(v.zip ?? "")].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(v);
  }

  return { venues: deduped, hasFieldsSection: true };
}

function parseLocationsVenues($: cheerio.CheerioAPI): { venues: ParsedVenue[]; hasLocationsSection: boolean } {
  // Many soccer.sincsports pages have an h2/h3 "Locations" block with <p><strong>Venue</strong><br/>...</p>.
  const headers = $("h1,h2,h3,h4").filter((_, el) => normalize($(el).text()) === "locations");
  if (!headers.length) return { venues: [], hasLocationsSection: false };

  const out: ParsedVenue[] = [];
  for (const el of headers.toArray()) {
    const header = $(el);
    const root = header.next().length ? header.next() : header.parent();

    root.find("p").each((_, pEl) => {
      const p = $(pEl);
      const strong = clean(p.find("strong").first().text());
      if (!strong || !looksLikeVenueName(strong)) return;

      const clone = p.clone();
      clone.find("strong").remove();
      const rawHtml = clone.html() ?? "";
      const withNewlines = rawHtml.replace(/<br\s*\/?\s*>/gi, "\n");
      const text = cheerio.load(`<div>${withNewlines}</div>`).text();

      const lines = text
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => !/^\(.*\)$/.test(s)) // (Fields 1-16)
        .filter((s) => !/\bfields?\b/i.test(s))
        .filter((s) => !/https?:\/\//i.test(s));

      // Find the last "City, ST ZIP" line; pick the closest prior street-ish line.
      let cityLineIdx = -1;
      let csz: { city: string; state: string; zip: string | null } | null = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        const parsed = parseCityStateZip(lines[i]);
        if (parsed) {
          cityLineIdx = i;
          csz = parsed;
          break;
        }
      }
      if (!csz || cityLineIdx < 0) return;

      let street: string | null = null;
      for (let i = cityLineIdx - 1; i >= 0; i--) {
        const ln = clean(lines[i]);
        if (!ln) continue;
        // Avoid generic marketing lines.
        if (/\\bthings to do\\b/i.test(ln) || /\\blearn more\\b/i.test(ln)) continue;
        street = ln;
        break;
      }
      if (!street) return;

      // Street lines are often plain text without commas; keep as-is.
      out.push({
        name: strong,
        address: street,
        city: csz.city,
        state: csz.state,
        zip: csz.zip,
        venue_url: null,
      });
    });
  }

  const seen = new Set<string>();
  const deduped: ParsedVenue[] = [];
  for (const v of out) {
    const key = [normalize(v.name), normalize(v.address), normalize(v.city), normalize(v.state), normalize(v.zip ?? "")].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(v);
  }

  return { venues: deduped, hasLocationsSection: true };
}

function dedupeParsedVenues(list: ParsedVenue[]) {
  const seen = new Set<string>();
  const out: ParsedVenue[] = [];
  for (const v of list) {
    const key = [normalize(v.name), normalize(v.address), normalize(v.city), normalize(v.state), normalize(v.zip ?? "")].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function absolutizeUrl(baseUrl: string, href: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function findFieldLocationPages($: cheerio.CheerioAPI, baseUrl: string) {
  // Many events publish venues on an "Information" subpage like:
  //   /TTMore.aspx?tid=BATTOB&tab=4&sub=0&Qual=MISC&Seq=3  (Field Location)
  const urls = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = clean($(el).attr("href"));
    if (!href) return;
    if (!/TTMore\.aspx\?/i.test(href)) return;
    if (!/[?&]tab=4\b/i.test(href)) return; // field location / misc info tab
    const abs = absolutizeUrl(baseUrl, href);
    if (!abs) return;
    // Keep this scoped to the same host (avoid cross-site links).
    try {
      const u = new URL(abs);
      const b = new URL(baseUrl);
      if (u.host !== b.host) return;
    } catch {
      return;
    }
    urls.add(abs);
  });
  return Array.from(urls);
}

function parseFieldLocationPage($: cheerio.CheerioAPI): ParsedVenue[] {
  // These pages are usually free-form HTML with <br/> separators.
  const container =
    $("#ctl00_ContentPlaceHolder1_TblUpdate").first().length
      ? $("#ctl00_ContentPlaceHolder1_TblUpdate").first()
      : $("#ctl00_ContentPlaceHolder1_pnlMain").first().length
        ? $("#ctl00_ContentPlaceHolder1_pnlMain").first()
        : $("body");

  const rawHtml = container.html() ?? "";
  const withNewlines = rawHtml.replace(/<br\s*\/?\s*>/gi, "\n");
  const text = cheerio.load(`<div>${withNewlines}</div>`).text();
  const lines = text
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/https?:\/\//i.test(s));

  const out: ParsedVenue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const csz = parseCityStateZip(lines[i]);
    if (!csz) continue;
    const street = clean(lines[i - 1] ?? "");
    const name = clean(lines[i - 2] ?? "");
    if (!street || !name) continue;
    if (!looksLikeVenueName(name)) continue;
    // Basic street sanity: require at least one digit so we don't create junk like "Kennewick, WA".
    if (!/\d/.test(street)) continue;
    out.push({ name, address: street, city: csz.city, state: csz.state, zip: csz.zip, venue_url: null });
  }

  return dedupeParsedVenues(out);
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
    // Focus on the soccer subdomain first. Other sports live on other subdomains.
    .or("source_url.ilike.%soccer.sincsports.com/%,official_website_url.ilike.%soccer.sincsports.com/%")
    .order("updated_at", { ascending: false })
    .limit(LIMIT);
  if (tournamentErr) throw tournamentErr;
  const tournaments = ((tournamentsRaw ?? []) as TournamentRow[]).filter((t) =>
    SPORT_FILTER ? clean(t.sport) === SPORT_FILTER : true
  );

  const ids = tournaments.map((t) => t.id).filter(Boolean);
  const linkedSet = new Set<string>();
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data: linked, error } = await supabase
      .from("tournament_venues" as any)
      .select("tournament_id")
      .in("tournament_id", chunk);
    if (error) throw error;
    for (const row of (linked ?? []) as Array<{ tournament_id: string | null }>) {
      const tid = String(row.tournament_id ?? "");
      if (tid) linkedSet.add(tid);
    }
  }
  const targets = tournaments.filter((t) => !linkedSet.has(t.id));

  // Lightweight cache to reduce lookups for the same address.
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

  let scanned = 0;
  let withFields = 0;
  let withVenueData = 0;
  let createdVenues = 0;
  let linkedExistingVenues = 0;
  let linkedCreatedVenues = 0;
  let linksInserted = 0;
  let failures = 0;
  const unresolved: Unresolved[] = [];

  for (const t of targets) {
    scanned += 1;
    const storedUrl =
      (isSincSportsTournamentUrl(t.official_website_url) ? t.official_website_url : null) ??
      (isSincSportsTournamentUrl(t.source_url) ? t.source_url : null);
    const url = storedUrl ? toDetailsUrl(storedUrl) : null;
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
      const parsedFields = parseFieldsVenues($);
      const parsedLocs = parsedFields.venues.length ? null : parseLocationsVenues($);

      let venues = parsedFields.venues.length ? parsedFields.venues : parsedLocs?.venues ?? [];
      const hasSection = parsedFields.hasFieldsSection || (parsedLocs?.hasLocationsSection ?? false);

      // If details.aspx doesn't expose venues, try the linked Field Location info pages.
      if (!venues.length) {
        const fieldPages = findFieldLocationPages($, url).slice(0, 5);
        for (const fp of fieldPages) {
          const fpHtml = await fetchHtml(fp);
          if (!fpHtml) continue;
          const $$ = cheerio.load(fpHtml);
          const extra = parseFieldLocationPage($$);
          if (extra.length) venues = dedupeParsedVenues(venues.concat(extra));
        }
      }

      const hasAnyVenueSection = hasSection || venues.length > 0;
      if (!hasAnyVenueSection) {
        unresolved.push({ tournament_id: t.id, tournament_name: t.name, url, reason: "no_fields_section" });
        continue;
      }
      withFields += 1;

      if (!venues.length) {
        unresolved.push({ tournament_id: t.id, tournament_name: t.name, url, reason: "no_venues_found" });
        continue;
      }
      withVenueData += 1;

      for (const pv of venues) {
        let createdThisVenue = false;
        let venue = await findVenueByAddressCityState({ address: pv.address, city: pv.city, state: pv.state });

        if (!venue && APPLY) {
          const payload: Record<string, unknown> = {
            name: pv.name,
            address: pv.address,
            address1: pv.address,
            city: pv.city,
            state: pv.state,
            zip: pv.zip ? normalizeZip(pv.zip) : null,
            sport: ALLOWED_VENUE_SPORTS.has(clean(t.sport) ?? "") ? clean(t.sport) : null,
            venue_url: pv.venue_url,
          };

          const existingByUnique = await findVenueByUniqueKey({
            name: pv.name,
            address: pv.address,
            city: pv.city,
            state: pv.state,
          });
          if (existingByUnique) {
            venue = existingByUnique;
          } else {
            const { data: insertRaw, error: insertErr } = await supabase
              .from("venues" as any)
              .insert(payload)
              .select("id,name,address,address1,city,state,zip,venue_url")
              .single();
            if (insertErr) {
              if ((insertErr as any).code === "23505") {
                const existingAfter = await findVenueByUniqueKey({
                  name: pv.name,
                  address: pv.address,
                  city: pv.city,
                  state: pv.state,
                });
                if (existingAfter) venue = existingAfter;
                else throw insertErr;
              } else {
                throw insertErr;
              }
            } else {
              venue = insertRaw as VenueRow;
              indexVenue(venue);
              createdVenues += 1;
              createdThisVenue = true;
            }
          }
        }

        if (!venue) {
          // Dry-run estimate
          linksInserted += 1;
          createdVenues += 1;
          linkedCreatedVenues += 1;
          continue;
        }

        if (APPLY) {
          const { error: linkErr } = await supabase
            .from("tournament_venues" as any)
            .upsert({ tournament_id: t.id, venue_id: venue.id }, { onConflict: "tournament_id,venue_id" });
          if (linkErr) throw linkErr;
          linksInserted += 1;
          if (createdThisVenue) linkedCreatedVenues += 1;
          else linkedExistingVenues += 1;
        } else {
          linksInserted += 1;
          linkedExistingVenues += 1;
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
      unresolved.push({ tournament_id: t.id, tournament_name: t.name, url, reason: "error", detail: msg });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        sport_filter: SPORT_FILTER,
        sincsports_tournaments_scanned: tournaments.length,
        sincsports_without_linked_venue: targets.length,
        pages_scanned: scanned,
        pages_with_fields_section: withFields,
        pages_with_venue_data: withVenueData,
        created_venues: createdVenues,
        linked_existing_venues: linkedExistingVenues,
        linked_created_venues: linkedCreatedVenues,
        tournament_venue_links_upserted: linksInserted,
        failures,
        unresolved_total: unresolved.length,
        unresolved: unresolved.slice(0, 50),
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
