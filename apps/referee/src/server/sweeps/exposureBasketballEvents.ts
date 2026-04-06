import * as cheerio from "cheerio";
import { request } from "undici";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import type { TournamentRow, TournamentStatus } from "@/lib/types/tournament";
import { normalizeSourceUrl } from "@/server/admin/sources";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ExposureDirectoryEvent = {
  Id: number;
  Name: string | null;
  StartDate: string | null;
  EndDate: string | null;
  City: string | null;
  StateRegionAbbr: string | null;
  OrganizationName?: string | null;
  OrganizationWebsite?: string | null;
  ContactName?: string | null;
  ContactEmail?: string | null;
  ContactPhone?: string | null;
  Slug?: string | null;
  Link?: string | null;
  Website?: string | null;
  ExternalRegistrationWebsite?: string | null;
  ExternalScheduleWebsite?: string | null;
  RegistrationLink?: string | null;
  ScheduleLink?: string | null;
  CalendarLink?: string | null;
  DateFormatted?: string | null;
  PriceFormatted?: string | null;
  GamesGuaranteed?: number | null;
  Featured?: boolean | null;
  ExposureCertified?: boolean | null;
};

type ExposureDirectoryResponse = {
  Results: ExposureDirectoryEvent[] | null;
  Page: number;
  PageSize: number;
  Total: number;
};

type ParsedVenue = {
  name: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue_url: string | null;
};

export type ExposureBasketballSweepResult = {
  imported_ids: string[];
  counts: {
    pages_fetched: number;
    found: number;
    imported: number;
    venues_found: number;
    venues_created: number;
    venues_matched: number;
    venue_links_created: number;
  };
  sample: Array<{
    id: number;
    name: string | null;
    state: string | null;
    city: string | null;
    start: string | null;
    end: string | null;
    url: string | null;
    director_email: string | null;
  }>;
};

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function asIsoDate(value: string | null | undefined) {
  const v = clean(value);
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeKey(input: string | null | undefined): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toCookieHeader(setCookieHeaders: string[]) {
  const map = new Map<string, string>();
  for (const raw of setCookieHeaders) {
    const first = String(raw || "").split(";")[0] || "";
    const idx = first.indexOf("=");
    if (idx <= 0) continue;
    const k = first.slice(0, idx).trim();
    const v = first.slice(idx + 1).trim();
    if (!k) continue;
    map.set(k, v);
  }
  if (!map.size) return null;
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function splitCombinedSetCookie(value: string): string[] {
  const raw = String(value || "").trim();
  if (!raw) return [];
  // Node/undici may coalesce multiple Set-Cookie headers into a single comma-delimited string.
  // A safe split is to only split on commas that start a new cookie pair (name=value),
  // avoiding the comma in Expires=Mon, 06 Apr...
  return raw
    .split(/,(?=[^;,=\s]+=[^;,]+)/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getSetCookieHeaders(resp: Response): string[] {
  const headersAny = resp.headers as any;
  if (typeof headersAny.getSetCookie === "function") {
    const arr = headersAny.getSetCookie();
    return Array.isArray(arr) ? arr : [];
  }
  if (typeof headersAny.raw === "function") {
    const raw = headersAny.raw();
    const arr = raw?.["set-cookie"];
    return Array.isArray(arr) ? arr : [];
  }
  const single = resp.headers.get("set-cookie");
  return single ? splitCombinedSetCookie(single) : [];
}

async function readUndiciBodyText(body: any): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function getUndiciSetCookieHeaders(headers: Record<string, any>): string[] {
  const raw = headers?.["set-cookie"];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") return splitCombinedSetCookie(raw);
  return [];
}

async function fetchTextWithCookies(url: string): Promise<{ html: string; cookie: string | null }> {
  try {
    const resp = await request(url, {
      method: "GET",
      headers: { "user-agent": "RI-Exposure-Sweep/1.0" },
      bodyTimeout: 12000,
      headersTimeout: 12000,
    });
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      return { html: "", cookie: null };
    }
    const html = await readUndiciBodyText(resp.body);
    const setCookies = getUndiciSetCookieHeaders(resp.headers as any);
    const cookie = toCookieHeader(setCookies);
    return { html, cookie };
  } catch {
    return { html: "", cookie: null };
  }
}

function parseDirectoryBootstrap(html: string): {
  tokenName: string | null;
  tokenValue: string | null;
  postPath: string | null;
  startDateString: string | null;
  sportType: string | null;
} {
  const tokenName = clean(html.match(/tokenName:\s*'([^']+)'/i)?.[1]) ?? null;
  const tokenValue = clean(html.match(/tokenValue:\s*'([^']+)'/i)?.[1]) ?? null;
  const postPath = clean(html.match(/url:\s*'([^']+)'/i)?.[1]) ?? null;
  const startDateString = clean(html.match(/StartDateString:\s*"([^"]+)"/i)?.[1]) ?? null;
  const sportType = clean(html.match(/sportType:\s*'([^']+)'/i)?.[1]) ?? null;
  return { tokenName, tokenValue, postPath, startDateString, sportType };
}

function buildFormBody(params: Record<string, string | number | null | undefined>) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    body.set(k, String(v));
  }
  return body.toString();
}

async function fetchDirectoryPage(params: {
  baseUrl: string;
  cookie: string | null;
  tokenName: string;
  tokenValue: string;
  postPath: string;
  page: number;
  sportType: string;
  startDateString: string | null;
}): Promise<ExposureDirectoryResponse | null> {
  try {
    const url = new URL(params.postPath, params.baseUrl).toString();
    const body = buildFormBody({
      Page: params.page,
      sportType: params.sportType,
      StartDateString: params.startDateString,
    });
    const resp = await request(url, {
      method: "POST",
      bodyTimeout: 12000,
      headersTimeout: 12000,
      headers: {
        "user-agent": "RI-Exposure-Sweep/1.0",
        "x-requested-with": "XMLHttpRequest",
        referer: params.baseUrl,
        origin: new URL(params.baseUrl).origin,
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        [params.tokenName]: params.tokenValue,
        ...(params.cookie ? { cookie: params.cookie } : {}),
      },
      body,
    });
    if (resp.statusCode < 200 || resp.statusCode >= 300) return null;
    const text = await readUndiciBodyText(resp.body);
    return JSON.parse(text) as ExposureDirectoryResponse;
  } catch {
    return null;
  }
}

function pickOfficialWebsiteUrl(event: ExposureDirectoryEvent, exposureEventUrl: string) {
  const candidates = [
    clean(event.ExternalScheduleWebsite),
    clean(event.ExternalRegistrationWebsite),
    clean(event.Website),
    clean(event.OrganizationWebsite),
  ].filter((v): v is string => Boolean(v));
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (!parsed.hostname.includes("exposureevents.com")) return parsed.toString();
    } catch {
      // ignore invalid urls
    }
  }
  // If everything is on Exposure, fall back to the event page itself.
  return exposureEventUrl;
}

function parseVenuesFromWidget(html: string, baseUrl: string): ParsedVenue[] {
  const $ = cheerio.load(html);
  const out: ParsedVenue[] = [];
  $(".vcard").each((_idx, el) => {
    const card = $(el);
    const name = clean(card.find(".org").first().text());
    const address1 = clean(card.find(".street-address").first().text());
    const city = clean(card.find(".locality").first().text());
    const state = clean(card.find(".region").first().text())?.toUpperCase() ?? null;
    const zip = clean(card.find(".postal-code").first().text());
    const venue_url =
      clean(card.find("a[title*='Directions']").attr("href")) ??
      clean(card.find("a[href*='google.com/maps']").attr("href")) ??
      null;
    if (!name && !address1) return;
    out.push({
      name,
      address1,
      city,
      state,
      zip,
      venue_url: venue_url ? new URL(venue_url, baseUrl).toString() : null,
    });
  });
  return out;
}

async function fetchVenuesForEvent(baseUrl: string, eventId: number): Promise<ParsedVenue[]> {
  try {
    const url = new URL(`/widgets/v1/venues?eventid=${eventId}&header=true&menu=true`, baseUrl).toString();
    const resp = await request(url, {
      method: "GET",
      headers: { "user-agent": "RI-Exposure-Sweep/1.0" },
      bodyTimeout: 12000,
      headersTimeout: 12000,
    });
    if (resp.statusCode < 200 || resp.statusCode >= 300) return [];
    const html = await readUndiciBodyText(resp.body);
    return parseVenuesFromWidget(html, baseUrl);
  } catch {
    return [];
  }
}

async function upsertVenueAndLink(params: {
  tournamentId: string;
  venue: ParsedVenue;
  counters: ExposureBasketballSweepResult["counts"];
}) {
  const v = params.venue;
  const name = clean(v.name);
  const address = clean(v.address1);
  const city = clean(v.city);
  const state = clean(v.state)?.toUpperCase() ?? null;
  if (!name || !address || !city || !state) return;

  const normalizedName = normalizeKey(name);
  const normalizedAddress = normalizeKey(address);
  const normalizedCity = normalizeKey(city);
  const normalizedZip = normalizeKey(v.zip);

  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from("venues" as any)
    .select("id,name,address,address1,city,state,zip,venue_url")
    .eq("city", city)
    .eq("state", state)
    .limit(300);
  if (lookupErr) throw lookupErr;
  const existingRows = ((existing as any) ?? []) as any[];
  const matched = existingRows.find((row: any) => {
    const rowName = normalizeKey(row?.name);
    const rowAddress = normalizeKey(row?.address1 || row?.address);
    const rowCity = normalizeKey(row?.city);
    const rowZip = normalizeKey(row?.zip);
    return (
      rowName === normalizedName &&
      rowAddress === normalizedAddress &&
      rowCity === normalizedCity &&
      (!normalizedZip || rowZip === normalizedZip)
    );
  });

  let venueId: string | null = matched?.id ?? null;
  if (!venueId) {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("venues" as any)
      .insert({
        name,
        address1: address,
        address,
        city,
        state,
        zip: clean(v.zip),
        venue_url: clean(v.venue_url),
      })
      .select("id")
      .single();
    if (insertErr) {
      // Another process may have inserted it; fall back to exact-match lookup.
      if ((insertErr as any)?.code === "23505") {
        const { data: existingExact, error: exactErr } = await supabaseAdmin
          .from("venues" as any)
          .select("id")
          .eq("name", name)
          .eq("address", address)
          .eq("city", city)
          .eq("state", state)
          .maybeSingle();
        if (exactErr && (exactErr as any)?.code !== "PGRST116") throw exactErr;
        venueId = (existingExact as any)?.id ?? null;
        if (venueId) params.counters.venues_matched += 1;
      } else {
        throw insertErr;
      }
    } else {
      venueId = (inserted as any)?.id ?? null;
      if (venueId) params.counters.venues_created += 1;
    }
  } else {
    params.counters.venues_matched += 1;
  }
  if (!venueId) return;

  if (!matched?.venue_url && clean(v.venue_url)) {
    await supabaseAdmin.from("venues" as any).update({ venue_url: clean(v.venue_url) }).eq("id", venueId);
  }

  const { error: linkErr } = await supabaseAdmin
    .from("tournament_venues" as any)
    .upsert({ tournament_id: params.tournamentId, venue_id: venueId, is_inferred: false }, { onConflict: "tournament_id,venue_id" });
  if (linkErr) throw linkErr;
  params.counters.venue_links_created += 1;
}

export function isExposureBasketballEventsDirectoryUrl(url: string) {
  try {
    const { canonical } = normalizeSourceUrl(url);
    const parsed = new URL(canonical);
    if (parsed.hostname !== "basketball.exposureevents.com") return false;
    return /^\/youth-basketball-events\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export async function sweepExposureBasketballEventsDirectory(params: {
  sourceUrl: string;
  status: TournamentStatus;
  writeDb?: boolean;
  maxPages?: number;
  maxEvents?: number;
  includeVenues?: boolean;
}): Promise<ExposureBasketballSweepResult> {
  const writeDb = params.writeDb ?? true;
  const maxPages = params.maxPages ?? 3;
  const maxEvents = params.maxEvents ?? 120;
  const includeVenues = params.includeVenues ?? true;

  const { canonical } = normalizeSourceUrl(params.sourceUrl);
  const baseUrl = canonical;

  const bootstrap = await fetchTextWithCookies(baseUrl);
  if (!bootstrap.html) {
    return {
      imported_ids: [],
      counts: {
        pages_fetched: 0,
        found: 0,
        imported: 0,
        venues_found: 0,
        venues_created: 0,
        venues_matched: 0,
        venue_links_created: 0,
      },
      sample: [],
    };
  }

  const boot = parseDirectoryBootstrap(bootstrap.html);
  if (!boot.tokenName || !boot.tokenValue || !boot.postPath || !boot.sportType) {
    return {
      imported_ids: [],
      counts: {
        pages_fetched: 0,
        found: 0,
        imported: 0,
        venues_found: 0,
        venues_created: 0,
        venues_matched: 0,
        venue_links_created: 0,
      },
      sample: [],
    };
  }
  // The directory POST requires the cookies set by the initial GET.
  if (!bootstrap.cookie) {
    return {
      imported_ids: [],
      counts: {
        pages_fetched: 0,
        found: 0,
        imported: 0,
        venues_found: 0,
        venues_created: 0,
        venues_matched: 0,
        venue_links_created: 0,
      },
      sample: [],
    };
  }

  const importedSet = new Set<string>();
  const sample: ExposureBasketballSweepResult["sample"] = [];
  const counts: ExposureBasketballSweepResult["counts"] = {
    pages_fetched: 0,
    found: 0,
    imported: 0,
    venues_found: 0,
    venues_created: 0,
    venues_matched: 0,
    venue_links_created: 0,
  };

  const events: ExposureDirectoryEvent[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const resp = await fetchDirectoryPage({
      baseUrl,
      cookie: bootstrap.cookie,
      tokenName: boot.tokenName,
      tokenValue: boot.tokenValue,
      postPath: boot.postPath,
      page,
      sportType: boot.sportType,
      startDateString: boot.startDateString,
    });
    if (!resp?.Results?.length) break;
    counts.pages_fetched += 1;
    for (const ev of resp.Results) {
      events.push(ev);
      if (events.length >= maxEvents) break;
    }
    if (events.length >= maxEvents) break;
  }

  counts.found = events.length;

  for (const ev of events) {
    const id = Number(ev.Id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const eventPath = clean(ev.Link) ?? (clean(ev.Slug) ? `/${id}/${clean(ev.Slug)}` : `/${id}`);
    const eventUrl = eventPath ? new URL(eventPath, baseUrl).toString() : baseUrl;
    const { canonical: eventCanonical } = normalizeSourceUrl(eventUrl);

    if (sample.length < 10) {
      sample.push({
        id,
        name: clean(ev.Name),
        state: clean(ev.StateRegionAbbr),
        city: clean(ev.City),
        start: asIsoDate(ev.StartDate),
        end: asIsoDate(ev.EndDate),
        url: eventCanonical,
        director_email: clean(ev.ContactEmail),
      });
    }

    if (!writeDb) continue;

    const row: TournamentRow = {
      name: clean(ev.Name) ?? `Exposure Event ${id}`,
      slug: buildTournamentSlug({
        name: clean(ev.Name) ?? `Exposure Event ${id}`,
        city: clean(ev.City) ?? undefined,
        state: clean(ev.StateRegionAbbr) ?? undefined,
      }),
      sport: "basketball",
      tournament_association: clean(ev.OrganizationName),
      level: null,
      sub_type: "admin",
      ref_cash_tournament: false,
      state: clean(ev.StateRegionAbbr) ?? "NA",
      city: clean(ev.City) ?? "Unknown",
      venue: null,
      address: null,
      zip: null,
      start_date: asIsoDate(ev.StartDate),
      end_date: asIsoDate(ev.EndDate) ?? asIsoDate(ev.StartDate),
      summary: clean(
        [
          clean(ev.DateFormatted),
          clean(ev.PriceFormatted),
          typeof ev.GamesGuaranteed === "number" && ev.GamesGuaranteed > 0 ? `${ev.GamesGuaranteed} games` : null,
        ]
          .filter(Boolean)
          .join(" | ")
      ),
      status: params.status,
      source: "external_crawl",
      source_event_id: eventCanonical,
      source_url: eventCanonical,
      source_domain: new URL(eventCanonical).hostname,
      raw: ev,
    };

    const tournamentId = await upsertTournamentFromSource(row);
    importedSet.add(tournamentId);
    counts.imported += 1;

    const officialWebsiteUrl = pickOfficialWebsiteUrl(ev, eventCanonical);
    const { error: updateErr } = await supabaseAdmin
      .from("tournaments" as any)
      .update({
        official_website_url: officialWebsiteUrl,
        tournament_director: clean(ev.ContactName),
        tournament_director_email: clean(ev.ContactEmail),
        referee_contact: clean(ev.ContactPhone),
      })
      .eq("id", tournamentId);
    if (updateErr) throw updateErr;

    if (includeVenues) {
      const venues = await fetchVenuesForEvent(baseUrl, id);
      counts.venues_found += venues.length;
      for (const venue of venues) {
        await upsertVenueAndLink({ tournamentId, venue, counters: counts });
      }
    }
  }

  const imported_ids = Array.from(importedSet);
  return {
    imported_ids,
    counts: { ...counts, imported: imported_ids.length },
    sample,
  } satisfies ExposureBasketballSweepResult;
}
