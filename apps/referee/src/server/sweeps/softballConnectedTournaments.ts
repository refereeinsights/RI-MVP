import * as cheerio from "cheerio";
import { normalizeStateAbbr } from "@/lib/usStates";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";
import type { TournamentRow, TournamentStatus } from "@/lib/types/tournament";
import { queueEnrichmentJobs } from "@/server/enrichment/pipeline";
import { normalizeSourceUrl, upsertRegistry } from "@/server/admin/sources";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SOFTBALL_CONNECTED_URL = "https://www.softballconnected.com/tournaments";
const USER_AGENT = "Mozilla/5.0 (compatible; RI-SoftballConnected-Sweep/1.0)";

type ParsedEvent = {
  name: string;
  detailUrl: string;
  city: string | null;
  state: string | null;
  organization: string | null;
  guaranteedGames: number | null;
  startDate: string | null;
  endDate: string | null;
  ageGroups: string | null;
  sourcePageUrl: string;
  // Venue data extracted from listing-page schema.org markup
  listingVenueName: string | null;
  listingStreetAddress: string | null;
  listingZip: string | null;
};

type EventDetails = {
  venueName: string | null;
  addressText: string | null;
  officialWebsiteUrl: string | null;
  contactName: string | null;
  contactPhone: string | null;
  competitionLevel: string | null;
  ageGroup: string | null;
  teamFee: string | null;
  gamesGuaranteed: number | null;
  fieldSurface: string | null;
  hotelRequired: string | null;
  description: string | null;
};

export type SoftballConnectedSweepResult = {
  imported_ids: string[];
  counts: {
    pages: number;
    found: number;
    imported: number;
    with_address: number;
    with_official_site: number;
    with_phone: number;
    venues_linked: number;
  };
  sample: Array<{
    name: string;
    state: string | null;
    city: string | null;
    start: string | null;
    url: string;
    venue: string | null;
    address: string | null;
  }>;
};

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function parseDateIso(text: string | null | undefined) {
  const value = clean(text);
  if (!value) return null;
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

function parseLocation(raw: string | null) {
  const compact = clean(raw);
  if (!compact) return { city: null, state: null };
  const parts = compact.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { city: compact, state: null };
  return {
    city: parts[0] ?? null,
    state: normalizeStateAbbr(parts[1]) ?? parts[1] ?? null,
  };
}

function parseGuaranteedGames(raw: string | null) {
  const compact = clean(raw);
  if (!compact) return null;
  const match = compact.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function parsePageCount(html: string) {
  const $ = cheerio.load(html);
  let maxPage = 1;
  $("ul.pagination a.page-link").each((_idx, link) => {
    const href = $(link).attr("href");
    if (!href) return;
    try {
      const page = Number(new URL(href, SOFTBALL_CONNECTED_URL).searchParams.get("page"));
      if (Number.isFinite(page) && page > maxPage) maxPage = page;
    } catch {
      // ignore bad href
    }
  });
  return maxPage;
}

type ListingVenueData = {
  venueName: string | null;
  streetAddress: string | null;
  zip: string | null;
};

function parseListingSchemaVenues($: cheerio.CheerioAPI): ListingVenueData[] {
  const result: ListingVenueData[] = [];
  $("[itemprop='event']").each((_idx, el) => {
    const block = $(el);
    const venueName = clean(block.find("[itemprop='location'] [itemprop='name']").first().text());
    const streetAddress = clean(block.find("[itemprop='streetAddress']").first().text());
    const zip = clean(block.find("[itemprop='postalCode']").first().text());
    result.push({
      venueName: venueName ?? null,
      streetAddress: streetAddress ?? null,
      zip: zip ?? null,
    });
  });
  return result;
}

function parseListingPage(sourceUrl: string, html: string): ParsedEvent[] {
  const $ = cheerio.load(html);
  const events: ParsedEvent[] = [];
  const schemaVenues = parseListingSchemaVenues($);

  let eventIdx = 0;
  $("td[data-title='Tournament']").each((_idx, td) => {
    const row = $(td).closest("tr");
    const link = $(td).find("a").first();
    const href = clean(link.attr("href"));
    const name = clean(link.text());
    if (!href || !name) return;

    const eventUrl = normalizeSourceUrl(new URL(href, sourceUrl).toString()).canonical;
    const location = parseLocation(clean(row.find("td[data-title='Location']").text()));
    const startDate = parseDateIso(row.find("td[data-title='Start Date']").text());
    const endDate = parseDateIso(row.find("td[data-title='End Date']").text());
    const organization = clean(row.find("td[data-title='Organization']").text());
    const ageGroups = clean(row.find("td[data-title='Age Groups']").text());
    const guaranteedGames = parseGuaranteedGames(row.find("td[data-title='GG']").text());
    const schema = schemaVenues[eventIdx] ?? null;
    eventIdx += 1;

    events.push({
      name,
      detailUrl: eventUrl,
      city: location.city,
      state: location.state,
      organization,
      guaranteedGames,
      startDate,
      endDate,
      ageGroups,
      sourcePageUrl: sourceUrl,
      listingVenueName: schema?.venueName ?? null,
      listingStreetAddress: schema?.streetAddress ?? null,
      listingZip: schema?.zip ?? null,
    });
  });

  return events;
}

function parseDetailListItem(li: cheerio.Cheerio<any>) {
  const label = clean(li.find(".label").text())?.replace(/^[^A-Za-z0-9]+/, "") ?? null;
  const texts = li
    .find(".texts")
    .map((_idx, el) => clean(li.find(el).text()))
    .get()
    .filter((value): value is string => Boolean(value));
  const hrefs = li
    .find(".texts a")
    .map((_idx, el) => clean(li.find(el).attr("href")))
    .get()
    .filter((value): value is string => Boolean(value));
  return { label, texts, hrefs };
}

function parseAgeFee(values: string[]) {
  const pairs = values
    .map((value) => {
      const match = value.match(/^([^/]+?)\s*\/\s*(.+)$/);
      if (!match) return null;
      return { age: clean(match[1]), fee: clean(match[2]) };
    })
    .filter((value): value is { age: string | null; fee: string | null } => Boolean(value));

  if (!pairs.length) return { ageGroup: clean(values.join(", ")), teamFee: null };

  const ages = pairs.map((pair) => pair.age).filter((value): value is string => Boolean(value));
  const fees = Array.from(new Set(pairs.map((pair) => pair.fee).filter((value): value is string => Boolean(value))));
  return {
    ageGroup: ages.length ? ages.join(", ") : null,
    teamFee: fees.length === 1 ? fees[0] : pairs.map((pair) => [pair.age, pair.fee].filter(Boolean).join(" / ")).join(" | "),
  };
}

function parseHiddenDescription($: cheerio.CheerioAPI) {
  const value = clean($("[itemprop='description']").first().text());
  return value ?? null;
}

function parseHiddenAddress($: cheerio.CheerioAPI) {
  const street = clean($("[itemprop='streetAddress']").first().text());
  const city = clean($("[itemprop='addressLocality']").first().text());
  const regionRaw = clean($("[itemprop='addressRegion']").first().text());
  const postalCode = clean($("[itemprop='postalCode']").first().text());
  const region = normalizeStateAbbr(regionRaw) ?? regionRaw;
  return clean([street, city, region, postalCode].filter(Boolean).join(", "));
}

function parseEventDetails(html: string): EventDetails {
  const $ = cheerio.load(html);
  const details: EventDetails = {
    venueName: null,
    addressText: null,
    officialWebsiteUrl: null,
    contactName: null,
    contactPhone: null,
    competitionLevel: null,
    ageGroup: null,
    teamFee: null,
    gamesGuaranteed: null,
    fieldSurface: null,
    hotelRequired: null,
    description: parseHiddenDescription($),
  };

  $("div.t-block-inner .card ul li").each((_idx, liEl) => {
    const li = $(liEl);
    const item = parseDetailListItem(li);
    const label = (item.label ?? "").toLowerCase();
    if (!label) return;

    if (label.includes("contact name")) details.contactName = details.contactName ?? item.texts[0] ?? null;
    if (label === "phone") {
      const tel = item.hrefs.find((href) => href.startsWith("tel:"));
      details.contactPhone =
        details.contactPhone ?? clean(tel?.replace(/^tel:/i, "")) ?? item.texts[0] ?? null;
    }
    if (label === "links") {
      const official = item.hrefs.find((href) => /^https?:/i.test(href));
      details.officialWebsiteUrl = details.officialWebsiteUrl ?? official ?? null;
    }
    if (label.includes("competition level")) details.competitionLevel = details.competitionLevel ?? clean(item.texts.join(", "));
    if (label.includes("age group / entry fee")) {
      const parsed = parseAgeFee(item.texts);
      details.ageGroup = details.ageGroup ?? parsed.ageGroup;
      details.teamFee = details.teamFee ?? parsed.teamFee;
    }
    if (label.includes("field surface")) details.fieldSurface = details.fieldSurface ?? item.texts[0] ?? null;
    if (label.includes("hotel required")) details.hotelRequired = details.hotelRequired ?? item.texts[0] ?? null;
    if (label.includes("guaranteed games")) details.gamesGuaranteed = details.gamesGuaranteed ?? parseGuaranteedGames(item.texts[0] ?? null);
    if (label.includes("stadium / field name")) details.venueName = details.venueName ?? clean(item.texts.join(" | "));
  });

  const locationCard = $(".card-title")
    .filter((_idx, el) => clean($(el).text())?.toLowerCase().includes("tournament location"))
    .first()
    .closest(".card");
  const locationText = clean(locationCard.find(".card-text").text());
  details.addressText = locationText ?? parseHiddenAddress($);

  if (!details.venueName) {
    details.venueName = clean($("[itemprop='location'] [itemprop='name']").first().text()) ?? null;
  }

  return details;
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchEventDetails(detailUrl: string) {
  const html = await fetchHtml(detailUrl);
  if (!html) {
    return {
      venueName: null,
      addressText: null,
      officialWebsiteUrl: null,
      contactName: null,
      contactPhone: null,
      competitionLevel: null,
      ageGroup: null,
      teamFee: null,
      gamesGuaranteed: null,
      fieldSurface: null,
      hotelRequired: null,
      description: null,
    } satisfies EventDetails;
  }
  try {
    return parseEventDetails(html);
  } catch {
    return {
      venueName: null,
      addressText: null,
      officialWebsiteUrl: null,
      contactName: null,
      contactPhone: null,
      competitionLevel: null,
      ageGroup: null,
      teamFee: null,
      gamesGuaranteed: null,
      fieldSurface: null,
      hotelRequired: null,
      description: null,
    } satisfies EventDetails;
  }
}

function toRow(event: ParsedEvent, details: EventDetails, status: TournamentStatus): TournamentRow {
  const parsed = new URL(event.detailUrl);
  const ageGroup = details.ageGroup ?? event.ageGroups;
  const summaryParts = [
    details.competitionLevel ? `Competition: ${details.competitionLevel}` : null,
    details.gamesGuaranteed ?? event.guaranteedGames ? `GG: ${details.gamesGuaranteed ?? event.guaranteedGames}` : null,
    details.fieldSurface ? `Surface: ${details.fieldSurface}` : null,
    details.hotelRequired ? `Hotel required: ${details.hotelRequired}` : null,
  ].filter(Boolean);

  return {
    name: event.name,
    slug: buildTournamentSlug({
      name: event.name,
      city: event.city ?? undefined,
      state: event.state ?? undefined,
    }),
    sport: "softball",
    tournament_association: event.organization,
    level: ageGroup,
    sub_type: "admin",
    ref_cash_tournament: false,
    state: event.state ?? "NA",
    city: event.city ?? "Unknown",
    venue: details.venueName,
    address: details.addressText,
    start_date: event.startDate,
    end_date: event.endDate ?? event.startDate,
    summary: summaryParts.length ? summaryParts.join(" | ") : null,
    status,
    source: "external_crawl",
    source_event_id: event.detailUrl,
    source_url: event.detailUrl,
    source_domain: parsed.hostname,
    raw: {
      source_page_url: event.sourcePageUrl,
      organization: event.organization,
      age_groups: event.ageGroups,
      guaranteed_games: event.guaranteedGames,
      official_website_url: details.officialWebsiteUrl,
      contact_name: details.contactName,
      contact_phone: details.contactPhone,
      competition_level: details.competitionLevel,
      field_surface: details.fieldSurface,
      hotel_required: details.hotelRequired,
      description: details.description,
      venue_name: details.venueName,
      address_text: details.addressText,
      team_fee: details.teamFee,
      age_group: details.ageGroup ?? event.ageGroups,
    },
  };
}

async function enrichTournament(tournamentId: string, event: ParsedEvent, details: EventDetails) {
  const updates: Record<string, unknown> = {};
  if (details.officialWebsiteUrl) updates.official_website_url = details.officialWebsiteUrl;
  if (details.contactName) updates.tournament_director = details.contactName;
  if (details.contactPhone) updates.tournament_director_phone = details.contactPhone;
  if (details.ageGroup ?? event.ageGroups) updates.age_group = details.ageGroup ?? event.ageGroups;
  if (details.teamFee) updates.team_fee = details.teamFee;
  if (details.gamesGuaranteed ?? event.guaranteedGames) updates.games_guaranteed = details.gamesGuaranteed ?? event.guaranteedGames;
  if (!Object.keys(updates).length) return;
  await supabaseAdmin.from("tournaments" as any).update(updates).eq("id", tournamentId);
}

export function isSoftballConnectedTournamentsUrl(url: string) {
  try {
    const { canonical } = normalizeSourceUrl(url);
    const parsed = new URL(canonical);
    const host = parsed.hostname.toLowerCase();
    const isSoftballConnectedHost = host === "www.softballconnected.com" || host === "softballconnected.com";
    return isSoftballConnectedHost && /^\/tournaments\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export async function sweepSoftballConnectedTournaments(params: {
  sourceUrl: string;
  html: string;
  status: TournamentStatus;
  writeDb?: boolean;
  maxPages?: number;
  maxEvents?: number;
}) {
  const writeDb = params.writeDb ?? false;
  const { canonical } = normalizeSourceUrl(params.sourceUrl);
  const totalPages = parsePageCount(params.html);
  const maxPages = Math.min(params.maxPages ?? totalPages, totalPages);
  const pageHtmls = new Map<number, string>([[1, params.html]]);

  for (let page = 2; page <= maxPages; page += 1) {
    const pageUrl = `${canonical}?page=${page}`;
    await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500));
    pageHtmls.set(page, await fetchHtml(pageUrl) ?? "");
  }

  const allEvents: ParsedEvent[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = page === 1 ? canonical : `${canonical}?page=${page}`;
    const html = pageHtmls.get(page) ?? "";
    allEvents.push(...parseListingPage(pageUrl, html));
  }

  const deduped = Array.from(new Map(allEvents.map((event) => [event.detailUrl, event])).values());
  const events = typeof params.maxEvents === "number" ? deduped.slice(0, params.maxEvents) : deduped;

  if (writeDb) {
    await upsertRegistry({
      source_url: SOFTBALL_CONNECTED_URL,
      source_type: "directory",
      sport: "softball",
      notes: "Softball Connected nationwide tournament directory.",
      is_custom_source: true,
      is_active: true,
    });
  }

  const sample: SoftballConnectedSweepResult["sample"] = [];
  const importedSet = new Set<string>();
  let withAddress = 0;
  let withOfficialSite = 0;
  let withPhone = 0;
  let venuesLinked = 0;

  for (const event of events) {
    await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500));
    const details = await fetchEventDetails(event.detailUrl);
    if (details.addressText) withAddress += 1;
    if (details.officialWebsiteUrl) withOfficialSite += 1;
    if (details.contactPhone) withPhone += 1;

    if (sample.length < 8) {
      sample.push({
        name: event.name,
        state: event.state,
        city: event.city,
        start: event.startDate,
        url: event.detailUrl,
        venue: details.venueName ?? event.listingVenueName ?? event.listingStreetAddress,
        address: details.addressText ?? event.listingStreetAddress,
      });
    }

    if (!writeDb) continue;
    const tournamentId = await upsertTournamentFromSource(toRow(event, details, params.status));
    await enrichTournament(tournamentId, event, details);
    importedSet.add(tournamentId);

    // Resolve venue name: detail-page field name → listing-page org/venue name → street address
    const resolvedVenueName =
      details.venueName ??
      event.listingVenueName ??
      event.listingStreetAddress;
    // Resolve address: detail-page full text → reconstruct from listing-page parts
    const resolvedAddress =
      details.addressText ??
      ([event.listingStreetAddress, event.city, event.state, event.listingZip].filter(Boolean).join(", ") || null);

    if (resolvedVenueName && (resolvedAddress || event.city || event.state)) {
      const { data: upsertedVenue } = await supabaseAdmin
        .from("venues" as any)
        .upsert(
          {
            name: resolvedVenueName,
            address: resolvedAddress ?? null,
            address1: event.listingStreetAddress ?? null,
            city: event.city ?? null,
            state: event.state ?? null,
            zip: event.listingZip ?? null,
            sport: "softball",
          },
          { onConflict: "name,address,city,state" }
        )
        .select("id")
        .maybeSingle();
      const venueId = (upsertedVenue as { id?: string } | null)?.id;
      if (venueId) {
        await supabaseAdmin
          .from("tournament_venues" as any)
          .upsert(
            { tournament_id: tournamentId, venue_id: venueId },
            { onConflict: "tournament_id,venue_id" }
          );
        venuesLinked += 1;
      }
    }
  }

  const imported_ids = Array.from(importedSet);
  if (writeDb && imported_ids.length) {
    await queueEnrichmentJobs(imported_ids);
  }

  return {
    imported_ids,
    counts: {
      pages: maxPages,
      found: events.length,
      imported: imported_ids.length,
      with_address: withAddress,
      with_official_site: withOfficialSite,
      with_phone: withPhone,
      venues_linked: venuesLinked,
    },
    sample,
  } satisfies SoftballConnectedSweepResult;
}
