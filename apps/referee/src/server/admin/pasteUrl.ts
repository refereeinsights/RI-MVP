import * as cheerio from "cheerio";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import type { TournamentRow, TournamentStatus, TournamentSource } from "@/lib/types/tournament";
import { queueEnrichmentJobs } from "@/server/enrichment/pipeline";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAsaAzUrl, isAsaAzUrl, sweepAsaAzSanctionedClubTournaments } from "@/server/sweeps/asaAzSanctionedClubTournaments";
import { insertRun, normalizeSourceUrl, upsertRegistry, updateRunExtractedJson } from "./sources";
import { SweepError, classifyHtmlPayload, httpErrorCode } from "./sweepDiagnostics";

const FETCH_TIMEOUT_MS = 10000;
const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;
const VERBOSE_SWEEP_LOGS = process.env.VERBOSE_SWEEP_LOGS === "true";

type FetchDiagnostics = {
  status: number;
  content_type: string | null;
  bytes: number;
  final_url: string;
  redirect_count: number;
  redirect_chain: { status: number; location: string }[];
  location_header: string | null;
};

async function fetchWithRedirects(startUrl: string): Promise<{
  resp: Response;
  finalUrl: string;
  redirectCount: number;
  redirectChain: { status: number; location: string }[];
  lastLocation: string | null;
}> {
  let currentUrl = startUrl;
  let redirectCount = 0;
  const redirectChain: { status: number; location: string }[] = [];
  let lastLocation: string | null = null;
  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "RI-Admin-PasteURL/1.0" },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (resp.status >= 300 && resp.status < 400) {
      const next = resp.headers.get("location");
      if (!next) {
        throw new SweepError("redirect_blocked", "Redirect missing Location header", {
          status: resp.status,
          content_type: resp.headers.get("content-type"),
          final_url: currentUrl,
          redirect_count: redirectCount,
          redirect_chain: redirectChain,
          location_header: lastLocation,
        });
      }
      lastLocation = next;
      redirectChain.push({ status: resp.status, location: next });
      redirectCount += 1;
      if (redirectCount > MAX_REDIRECTS) {
        throw new SweepError("redirect_blocked", "Too many redirects", {
          status: resp.status,
          content_type: resp.headers.get("content-type"),
          final_url: currentUrl,
          redirect_count: redirectCount,
          redirect_chain: redirectChain,
          location_header: lastLocation,
        });
      }
      currentUrl = new URL(next, currentUrl).toString();
      continue;
    }
    return { resp, finalUrl: resp.url || currentUrl, redirectCount, redirectChain, lastLocation };
  }
}

export async function fetchHtml(url: string): Promise<string | null> {
  const { html } = await fetchHtmlWithDiagnostics(url);
  return html;
}

async function fetchHtmlWithDiagnostics(url: string): Promise<{ html: string; diagnostics: FetchDiagnostics }> {
  let resp: Response;
  let finalUrl = url;
  let redirectCount = 0;
  let redirectChain: { status: number; location: string }[] = [];
  let lastLocation: string | null = null;
  try {
    const result = await fetchWithRedirects(url);
    resp = result.resp;
    finalUrl = result.finalUrl;
    redirectCount = result.redirectCount;
    redirectChain = result.redirectChain;
    lastLocation = result.lastLocation;
  } catch (err: any) {
    if (err instanceof SweepError) throw err;
    throw new SweepError("fetch_failed", "Request failed", { final_url: finalUrl });
  }

  const status = resp.status;
  const contentType = resp.headers.get("content-type");
  if (!resp.ok) {
    throw new SweepError(httpErrorCode(status), `HTTP error ${status}`, {
      status,
      content_type: contentType,
      final_url: finalUrl,
      redirect_count: redirectCount,
      redirect_chain: redirectChain,
      location_header: lastLocation,
    });
  }

  let html = "";
  try {
    html = await resp.text();
  } catch (err: any) {
    throw new SweepError("fetch_failed", "Failed to read response body", {
      status,
      content_type: contentType,
      final_url: finalUrl,
      redirect_count: redirectCount,
    });
  }

  const bytes = Buffer.byteLength(html);
  const payloadIssue = classifyHtmlPayload(contentType, bytes);
  if (payloadIssue) {
    throw new SweepError(payloadIssue, "HTML payload failed validation", {
      status,
      content_type: contentType,
      bytes,
      final_url: finalUrl,
      redirect_count: redirectCount,
      redirect_chain: redirectChain,
      location_header: lastLocation,
    });
  }

  if (bytes > MAX_BYTES) {
    html = html.slice(0, MAX_BYTES);
  }

  return {
    html,
    diagnostics: {
      status,
      content_type: contentType,
      bytes,
      final_url: finalUrl,
      redirect_count: redirectCount,
      redirect_chain: redirectChain,
      location_header: lastLocation,
    },
  };
}

export type ParsedMetadata = {
  name?: string | null;
  summary?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  city?: string | null;
  state?: string | null;
  host_org?: string | null;
  image_url?: string | null;
  warnings: string[];
};

export function parseMetadata(html: string): ParsedMetadata {
  const warnings: string[] = [];
  const $ = cheerio.load(html);

  const ogTitle = $('meta[property="og:title"]').attr("content");
  const metaDesc = $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content");
  const title = $("title").first().text();
  const h1 = $("h1").first().text();
  const name = (ogTitle || h1 || title || "").trim() || null;
  if (!name) warnings.push("name_not_found");

  const summary = (metaDesc || "").trim() || null;
  if (!summary) warnings.push("summary_not_found");

  const text = $.text().replace(/\s+/g, " ");
  const { start, end } = extractDateGuess(text);
  const cityState = extractCityStateGuess(text);
  const host_org = extractHostOrg(text);
  const image_url = $('meta[property="og:image"]').attr("content") || null;

  return {
    name,
    summary,
    start_date: start,
    end_date: end,
    city: cityState?.city ?? null,
    state: cityState?.state ?? null,
    host_org,
    image_url,
    warnings,
  };
}

export function extractDateGuess(text: string): { start: string | null; end: string | null } {
  const month = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*";
  const day = "(\\d{1,2})";
  const year = "(20\\d{2})";
  const rangeRegex = new RegExp(`${month}\\s+${day}(?:\\s*[-–]\\s*${month}\\s+${day})?[,\\s]+${year}`, "i");
  const singleRegex = new RegExp(`${month}\\s+${day}[,\\s]+${year}`, "i");

  const toIso = (m: string, d: string, y: string) => {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIdx = months.indexOf(m.slice(0, 3).toLowerCase());
    if (monthIdx === -1) return null;
    const mm = String(monthIdx + 1).padStart(2, "0");
    const dd = String(Number(d)).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  };

  const rangeMatch = text.match(rangeRegex);
  if (rangeMatch) {
    const [_, m1, d1, m2, d2, y] = rangeMatch;
    const start = toIso(m1, d1, y);
    const end = m2 && d2 ? toIso(m2, d2, y) : start;
    return { start, end: end ?? start ?? null };
  }
  const singleMatch = text.match(singleRegex);
  if (singleMatch) {
    const [_, m, d, y] = singleMatch;
    const iso = toIso(m, d, y);
    return { start: iso, end: iso };
  }
  return { start: null, end: null };
}

export function extractCityStateGuess(text: string): { city: string; state: string } | null {
  const states = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN",
    "MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA",
    "WA","WV","WI","WY",
  ];
  const match = text.match(/([A-Za-z .'-]{3,}?)(?:,|\s+)\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/);
  if (match) {
    let city = match[1].trim();
    // If the phrase contains " in X", keep the tail after the last " in "
    const inIdx = city.toLowerCase().lastIndexOf(" in ");
    if (inIdx !== -1) {
      city = city.slice(inIdx + 4).trim();
    }
    // If city still has multiple comma parts, take the last part
    if (city.includes(",")) {
      city = city.split(",").pop()!.trim();
    }
    return { city, state: match[2].toUpperCase() };
  }
  for (const st of states) {
    const idx = text.indexOf(`, ${st}`);
    if (idx > 0) {
      const startIdx = Math.max(0, idx - 40);
      const snippet = text.slice(startIdx, idx);
      const parts = snippet.split(/[\n,]/).map((p) => p.trim()).filter(Boolean);
      const city = parts.pop();
      if (city) return { city, state: st };
    }
  }
  return null;
}

export function extractHostOrg(text: string): string | null {
  const match = text.match(/(Hosted by|Organizer|Presented by|Club):?\s*([A-Za-z0-9 .,'&-]{3,80})/i);
  return match ? match[2].trim() : null;
}

export async function createTournamentFromUrl(params: {
  url: string;
  sport: "soccer" | "basketball" | "football";
  status?: TournamentStatus;
  source?: TournamentSource;
}) {
  const { url } = params;
  let sport = params.sport;
  const status: TournamentStatus = params.status ?? "draft";
  const source: TournamentSource = params.source ?? "external_crawl";

  const { canonical, host } = normalizeSourceUrl(url);
  const { html, diagnostics } = await fetchHtmlWithDiagnostics(url);
  sport = detectSport({ html, canonical, host, fallback: sport });

  const parsedUrl = new URL(canonical);

  if (parsedUrl.hostname.includes("grassroots365.com") && parsedUrl.pathname.includes("/calendar")) {
    const events = extractGrassrootsCalendarEvents(html);
    if (!events || events.length === 0) {
      throw new SweepError("html_received_no_events", "Calendar found but no events parsed", diagnostics);
    }

    const tournamentIds: string[] = [];
    for (const event of events) {
      const mapped = mapGrassrootsEvent(event, sport);
      if (!mapped) continue;
      const tournamentId = await upsertTournamentFromSource(mapped);
      tournamentIds.push(tournamentId);
    }

    if (!tournamentIds.length) {
      throw new SweepError("html_received_no_events", "Calendar parsed but no valid events mapped", diagnostics);
    }

    await queueEnrichmentJobs(tournamentIds);

    const registry = await upsertRegistry({ source_url: canonical, source_type: "series_site", sport });
    const runId = await insertRun({
      registry_id: registry.registry_id,
      source_url: canonical,
      url: canonical,
      http_status: diagnostics.status ?? 200,
      domain: diagnostics.final_url ? new URL(diagnostics.final_url).hostname : parsedUrl.hostname,
      title: "Grassroots365 calendar",
      extracted_json: { action: "calendar_import", extracted_count: tournamentIds.length },
      extract_confidence: 0.7,
    });
    await updateRunExtractedJson(runId, { action: "calendar_import", extracted_count: tournamentIds.length });

    return {
      tournamentId: tournamentIds[0],
      meta: { name: `Imported ${tournamentIds.length} events`, warnings: [] },
      slug: "calendar-import",
      registry_id: registry.registry_id,
      run_id: runId,
      diagnostics,
      extracted_count: tournamentIds.length,
    };
  }

  if (
    parsedUrl.hostname.includes("usclubsoccer.org") &&
    parsedUrl.pathname.includes("/list-of-sanctioned-tournaments")
  ) {
    const events = parseUSClubSanctionedTournaments(html);
    if (!events.length) {
      const extra = getUSClubDiagnostics(html);
      throw new SweepError("html_received_no_events", "US Club list parsed but no events found", {
        ...diagnostics,
        usclub: extra,
      });
    }

    const tournamentIds: string[] = [];
    for (const event of events) {
      const tournamentId = await upsertTournamentFromSource({
        ...event,
        sport: "soccer",
        status,
        source: "us_club_soccer",
      });
      tournamentIds.push(tournamentId);
    }

    await queueEnrichmentJobs(tournamentIds);

    const registry = await upsertRegistry({ source_url: canonical, source_type: "series_site", sport: "soccer" });
    const runId = await insertRun({
      registry_id: registry.registry_id,
      source_url: canonical,
      url: canonical,
      http_status: diagnostics.status ?? 200,
      domain: diagnostics.final_url ? new URL(diagnostics.final_url).hostname : parsedUrl.hostname,
      title: "US Club Soccer sanctioned tournaments",
      extracted_json: { action: "usclub_import", extracted_count: tournamentIds.length },
      extract_confidence: 0.7,
    });
    await updateRunExtractedJson(runId, { action: "usclub_import", extracted_count: tournamentIds.length });

    return {
      tournamentId: tournamentIds[0],
      meta: { name: `Imported ${tournamentIds.length} events`, warnings: [] },
      slug: "usclub-import",
      registry_id: registry.registry_id,
      run_id: runId,
      diagnostics,
      extracted_count: tournamentIds.length,
    };
  }

  if (isAsaAzUrl(canonical)) {
    const sweepResult = await sweepAsaAzSanctionedClubTournaments({
      html,
      status,
      writeDb: true,
    });

    const registry = await upsertRegistry({
      source_url: getAsaAzUrl(),
      source_type: "association_directory",
      sport: "soccer",
      state: "AZ",
      notes: "Arizona Soccer Association sanctioned club tournaments directory; contains tournament website links and director names.",
    });
    const runId = await insertRun({
      registry_id: registry.registry_id,
      source_url: canonical,
      url: canonical,
      http_status: diagnostics.status ?? 200,
      domain: diagnostics.final_url ? new URL(diagnostics.final_url).hostname : parsedUrl.hostname,
      title: "Arizona Soccer Association sanctioned club tournaments",
      extracted_json: {
        action: "asa_az_import",
        extracted_count: sweepResult.counts.found,
        counts: sweepResult.counts,
        sample: sweepResult.sample,
      },
      extract_confidence: 0.65,
    });
    await updateRunExtractedJson(runId, {
      action: "asa_az_import",
      extracted_count: sweepResult.counts.found,
      counts: sweepResult.counts,
      sample: sweepResult.sample,
    });

    return {
      tournamentId: sweepResult.imported_ids[0] ?? "",
      meta: { name: `Imported ${sweepResult.counts.found} events`, warnings: [] },
      slug: "asa-az-import",
      registry_id: registry.registry_id,
      run_id: runId,
      diagnostics,
      extracted_count: sweepResult.counts.found,
      details: {
        counts: sweepResult.counts,
        sample: sweepResult.sample,
      },
    };
  }

  let meta: ParsedMetadata;
  try {
    meta = parseMetadata(html);
  } catch (err: any) {
    throw new SweepError("extractor_error", "Extractor threw while parsing HTML", diagnostics);
  }

  if (!meta.name && !meta.summary && !meta.start_date && !meta.end_date && !meta.city && !meta.state) {
    throw new SweepError(
      "html_received_no_events",
      "HTML parsed but no tournament metadata was found",
      diagnostics
    );
  }
  const slug = buildTournamentSlug({
    name: meta.name || parsedUrl.hostname,
    city: meta.city ?? undefined,
    state: meta.state ?? undefined,
  });

  const row: TournamentRow = {
    name: meta.name || parsedUrl.hostname,
    slug,
    sport,
    level: meta.host_org ?? null,
    sub_type: "admin",
    cash_tournament: false,
    state: meta.state ?? "NA",
    city: meta.city ?? "Unknown",
    venue: null,
    address: null,
    start_date: meta.start_date ?? null,
    end_date: meta.end_date ?? meta.start_date ?? null,
    summary: meta.summary ?? null,
    status,
    confidence: undefined,
    source,
    source_event_id: canonical,
    source_url: canonical,
    source_domain: parsedUrl.hostname,
    raw: null,
  };

  const registry = await upsertRegistry({ source_url: canonical, source_type: "series_site", sport });
  const tournamentId = await upsertTournamentFromSource(row);
  await queueEnrichmentJobs([tournamentId]);

  const runId = await insertRun({
    registry_id: registry.registry_id,
    source_url: canonical,
    url: canonical,
    http_status: 200,
    domain: host,
    title: meta.name ?? parsedUrl.hostname,
    extracted_json: { action: "paste_url", tournament_id: tournamentId, created: true },
    extract_confidence: meta.warnings.length ? 0.5 : 0.8,
  });

  await supabaseAdmin
    .from("tournaments" as any)
    .update({
      image_url: meta.image_url ?? null,
      discovery_source_id: registry.registry_id,
      discovery_sweep_id: runId,
    })
    .eq("id", tournamentId);

  await updateRunExtractedJson(runId, { action: "paste_url", tournament_id: tournamentId, created: true });

  return { tournamentId, meta, slug, registry_id: registry.registry_id, run_id: runId, diagnostics, extracted_count: 1 };
}

function detectSport(params: {
  html: string;
  canonical: string;
  host: string;
  fallback: TournamentRow["sport"];
}): TournamentRow["sport"] {
  const host = params.host.toLowerCase();
  if (host.includes("grassroots365.com")) return "basketball";
  if (host.includes("exposureevents.com")) return "basketball";
  if (host.includes("gotsoccer.com")) return "soccer";
  if (host.includes("usclubsoccer.org") || host.includes("usyouthsoccer.org")) return "soccer";
  if (host.includes("tournamentmachine.com")) return "basketball";
  if (host.includes("tourneymachine.com")) return "basketball";
  if (host.includes("statebasketballchampionship.com")) return "basketball";

  const text = params.html.toLowerCase();
  const score = {
    soccer: 0,
    basketball: 0,
    football: 0,
  };
  const bump = (key: keyof typeof score, n: number) => {
    score[key] += n;
  };

  if (text.includes("soccer")) bump("soccer", 3);
  if (text.includes("futsal")) bump("soccer", 2);
  if (text.includes("basketball")) bump("basketball", 3);
  if (text.includes("hoops")) bump("basketball", 2);
  if (text.includes("football")) bump("football", 3);
  if (text.includes("gridiron")) bump("football", 2);
  if (text.includes("varsity") || text.includes("junior varsity")) bump("football", 1);

  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] > 0) return best[0] as TournamentRow["sport"];
  return params.fallback;
}

type GrassrootsEvent = {
  id?: string | number | null;
  nickname?: string | null;
  name?: string | null;
  short_name?: string | null;
  dates?: string | null;
  locations?: string | null;
  short_locations?: string | null;
  link?: string | null;
};

function extractGrassrootsCalendarEvents(html: string): GrassrootsEvent[] | null {
  const marker = "console.log(";
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf("{", idx);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return null;
  const jsonText = html.slice(start, end);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const events: GrassrootsEvent[] = [];
  Object.values(parsed || {}).forEach((value: any) => {
    if (Array.isArray(value)) {
      value.forEach((item) => events.push(item));
    }
  });
  return events;
}

function parseDateString(value?: string | null) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function extractCityState(input?: string | null): { city: string | null; state: string | null } {
  if (!input) return { city: null, state: null };
  const matchParen = input.match(/\\(([^,]+),\\s*([A-Z]{2})\\)/);
  if (matchParen) return { city: matchParen[1].trim(), state: matchParen[2].trim() };
  const matchComma = input.match(/([^,]+),\\s*([A-Z]{2})/);
  if (matchComma) return { city: matchComma[1].trim(), state: matchComma[2].trim() };
  return { city: null, state: null };
}

function mapGrassrootsEvent(event: GrassrootsEvent, sport: TournamentRow["sport"]): TournamentRow | null {
  const rawName = (event.name || event.nickname || "").trim();
  const shortName = (event.short_name || "").trim();
  const name = rawName.startsWith("G365 ") && shortName ? shortName : rawName;
  const link = event.link ? event.link.trim() : null;
  if (!name || !link) return null;
  const dates = (event.dates || "").split("|").map((d) => d.trim()).filter(Boolean);
  const startDate = parseDateString(dates[0]);
  const endDate = parseDateString(dates[dates.length - 1]);
  const locationRaw = (event.locations || event.short_locations || "").split("|")[0]?.trim() || "";
  const { city, state } = extractCityState(locationRaw);
  const slug = buildTournamentSlug({ name, city: city ?? undefined, state: state ?? undefined });
  const parsedLink = new URL(link);

  return {
    name,
    slug,
    sport,
    level: null,
    sub_type: "internet",
    cash_tournament: false,
    state: state ?? "NA",
    city: city ?? "Unknown",
    venue: null,
    address: null,
    start_date: startDate,
    end_date: endDate,
    summary: null,
    status: "draft",
    confidence: undefined,
    source: "external_crawl",
    source_event_id: event.id ? String(event.id) : event.nickname ?? name,
    source_url: link,
    source_domain: parsedLink.hostname,
    raw: event,
  };
}

function parseUSClubSanctionedTournaments(html: string): TournamentRow[] {
  const $ = cheerio.load(html);
  const results: TournamentRow[] = [];
  const inferredYear = inferUSClubYear(html);
  const tables = $("table.wptb-preview-table").toArray();
  for (const table of tables) {
    const $table = $(table);
    const $h2 = $table.prevAll("h2").filter((_i, el) => /^[A-Za-z]+\\s+\\d{4}$/.test($(el).text().trim())).first();
    const monthYear = $h2.text().trim();
    results.push(...parseUSClubTable($, monthYear, $table, inferredYear));
  }

  return results.filter((row) => row.name && row.state && row.start_date);
}

function getUSClubDiagnostics(html: string) {
  const $ = cheerio.load(html);
  const inferredYear = inferUSClubYear(html);
  const monthHeaders = $("h2")
    .toArray()
    .map((node) => $(node).text().trim())
    .filter((text) => /^[A-Za-z]+\\s+\\d{4}$/.test(text));
  const tables = $("table.wptb-preview-table").toArray();
  if (!VERBOSE_SWEEP_LOGS) {
    return {
      month_header_count: monthHeaders.length,
      table_count: tables.length,
      inferred_year: inferredYear,
    };
  }
  const firstTable = tables.length ? $(tables[0]) : null;
  let firstRows: string[][] = [];
  if (firstTable) {
    firstTable
      .find("tr")
      .slice(0, 3)
      .each((_, tr) => {
        const row = $(tr)
          .find("td,th")
          .map((_, td) => $(td).text().trim().replace(/\\s+/g, " "))
          .get();
        firstRows.push(row);
      });
  }
  const firstDates = firstRows.slice(1, 4).map((row) => row[0] || "").filter(Boolean);
  const parsedDates = firstDates.map((text) => {
    const debug = parseUSClubDateCellDebug(text, inferredYear ?? null);
    return {
      raw: text,
      raw_codes: Array.from(text).map((ch) => ch.charCodeAt(0)),
      normalized: debug.normalized,
      normalized_codes: Array.from(debug.normalized).map((ch) => ch.charCodeAt(0)),
      explicit_idx: debug.explicitIdx,
      month_idx_text: debug.monthIdxFromText,
      default_month_idx: debug.defaultMonthIdx,
      month_idx: debug.monthIdx,
      year: debug.year,
      start_day: debug.startDay,
      end_day: debug.endDay,
      parsed: debug.parsed,
    };
  });
  const sampleRows =
    firstTable
      ?.find("tr")
      .slice(0, 6)
      .map((_, tr) => {
        let cells = $(tr).find("td");
        if (cells.length < 3) cells = $(tr).find("td,th");
        const row = cells
          .map((_, td) => $(td).text().trim().replace(/\\s+/g, " "))
          .get();
        const stateCell = row[2] ? row[2].toUpperCase() : "";
        const stateMatch = stateCell.match(/\\b[A-Z]{2}\\b/);
        const fallbackState = stateCell.replace(/[^A-Z]/g, "").slice(0, 2);
        return {
          row,
          state_cell: stateCell,
          state_match: stateMatch ? stateMatch[0] : null,
          fallback_state: fallbackState || null,
        };
      })
      .get() ?? [];
  return {
    month_headers: monthHeaders.slice(0, 3),
    month_header_count: monthHeaders.length,
    table_count: tables.length,
    inferred_year: inferredYear,
    first_table_rows: firstRows,
    sample_rows: sampleRows,
    parsed_dates: parsedDates,
  };
}

function parseUSClubTable(
  $: cheerio.CheerioAPI,
  monthYear: string,
  $table: cheerio.Cheerio<any>,
  inferredYear?: number | null
): TournamentRow[] {
  const out: TournamentRow[] = [];
  const rows = $table.find("tr").toArray();
  for (const tr of rows) {
    let cells = $(tr).find("td");
    if (cells.length < 3) {
      cells = $(tr).find("td,th");
    }
    if (cells.length < 3) continue;
    const datesText = $(cells[0]).text().trim();
    const tournamentCell = $(cells[1]);
    const stateRaw = $(cells[2]).text().trim().toUpperCase();
    const stateMatch = stateRaw.match(/\\b[A-Z]{2}\\b/);
    const fallbackState = stateRaw.replace(/[^A-Z]/g, "").slice(0, 2);
    const state = stateMatch ? stateMatch[0] : fallbackState;
    if (!state) continue;

    const link = tournamentCell.find("a").first();
    const name = link.text().trim() || tournamentCell.text().trim();
    if (!name) continue;
    const href = (link.attr("href") || "").trim();

    const { start, end } = parseUSClubDateCell(monthYear, datesText, inferredYear ?? null);
    if (!start) continue;

    const slug = buildTournamentSlug({ name, city: undefined, state });
    const source_url =
      href && href.startsWith("http") ? href : "https://usclubsoccer.org/list-of-sanctioned-tournaments/";
    const source_domain = "usclubsoccer.org";
    const club = cells.length >= 4 ? $(cells[3]).text().trim() : "";
    const ageGroups = cells.length >= 5 ? $(cells[4]).text().trim() : "";
    const level = inferUSClubLevel(ageGroups);

    out.push({
      name,
      slug,
      sport: "soccer",
      level,
      state,
      city: null,
      venue: null,
      address: null,
      start_date: start ?? null,
      end_date: end ?? start ?? null,
      source_url,
      source_domain,
      summary: `US Club Soccer–sanctioned tournament listed for ${state}${club ? `, hosted by ${club}` : ""}.`,
      status: "draft",
      confidence: 75,
      source: "us_club_soccer",
      source_event_id: `${name}|${state}|${datesText}`.toLowerCase().replace(/\\s+/g, "-"),
      raw: {
        dates: datesText,
        club,
        ageGroups,
      },
    });
  }
  return out;
}

function parseUSClubDateCell(
  monthYear: string,
  dateTextRaw: string,
  inferredYear: number | null
): { start?: string; end?: string } {
  const dateText = normalizeUSClubDateText(dateTextRaw);
  const match = monthYear.match(/^([A-Za-z]+)\\s+(\\d{4})$/);
  const defaultMonthName = match ? match[1] : "";
  const year = match ? parseInt(match[2], 10) : inferredYear ?? new Date().getUTCFullYear();
  const defaultMonthIdx = monthNameToIndex0(defaultMonthName);
  const explicitMonthMatch = dateText.match(/^([A-Za-z]+)\\s+/);
  const explicitIdx = explicitMonthMatch ? monthNameToIndex0(explicitMonthMatch[1]) : null;
  const monthIdxFromText = explicitIdx !== null ? explicitIdx : findMonthIndexInText(dateText);
  const monthIdx =
    monthIdxFromText !== null ? monthIdxFromText : defaultMonthIdx !== null ? defaultMonthIdx : null;
  if (monthIdx === null) return {};
  let startDay: number | null = null;
  let endDay: number | null = null;
  const dayRangeMatch = dateText.match(/(\d{1,2})(?:\s*(?:-|to)\s*(\d{1,2}))?/i);
  if (dayRangeMatch) {
    startDay = parseInt(dayRangeMatch[1], 10);
    endDay = dayRangeMatch[2] ? parseInt(dayRangeMatch[2], 10) : startDay;
  } else {
    const nums = dateText.match(/\d{1,2}/g) || [];
    if (nums.length) {
      startDay = parseInt(nums[0], 10);
      endDay = nums.length > 1 ? parseInt(nums[1], 10) : startDay;
    }
  }
  if (!startDay) return {};
  if (!endDay) endDay = startDay;
  return {
    start: toISODateUTC(year, monthIdx, startDay),
    end: toISODateUTC(year, monthIdx, endDay),
  };
}

function parseUSClubDateCellDebug(dateTextRaw: string, inferredYear: number | null) {
  const normalized = normalizeUSClubDateText(dateTextRaw);
  const explicitMonthMatch = normalized.match(/^([A-Za-z]+)\\s+/);
  const explicitIdx = explicitMonthMatch ? monthNameToIndex0(explicitMonthMatch[1]) : null;
  const monthIdxFromText = explicitIdx !== null ? explicitIdx : findMonthIndexInText(normalized);
  const defaultMonthIdx: number | null = null;
  const monthIdx = monthIdxFromText !== null ? monthIdxFromText : null;
  const year = inferredYear ?? new Date().getUTCFullYear();
  let startDay: number | null = null;
  let endDay: number | null = null;
  const dayRangeMatch = normalized.match(/(\d{1,2})(?:\s*(?:-|to)\s*(\d{1,2}))?/i);
  if (dayRangeMatch) {
    startDay = parseInt(dayRangeMatch[1], 10);
    endDay = dayRangeMatch[2] ? parseInt(dayRangeMatch[2], 10) : startDay;
  } else {
    const nums = normalized.match(/\d{1,2}/g) || [];
    if (nums.length) {
      startDay = parseInt(nums[0], 10);
      endDay = nums.length > 1 ? parseInt(nums[1], 10) : startDay;
    }
  }
  const parsed =
    monthIdx === null || !startDay
      ? {}
      : {
          start: toISODateUTC(year, monthIdx, startDay),
          end: toISODateUTC(year, monthIdx, endDay ?? startDay),
        };
  return { normalized, explicitIdx, monthIdxFromText, defaultMonthIdx, monthIdx, year, startDay, endDay, parsed };
}

function monthNameToIndex0(name: string): number | null {
  const m = name.trim().toLowerCase().replace(/\.$/, "");
  const map: Record<string, number> = {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sep: 8,
    sept: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11,
  };
  return map[m] ?? null;
}

function findMonthIndexInText(text: string): number | null {
  const lower = text.toLowerCase();
  const names = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    "jan",
    "feb",
    "mar",
    "apr",
    "jun",
    "jul",
    "aug",
    "sep",
    "sept",
    "oct",
    "nov",
    "dec",
  ];
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    if (new RegExp(`\\b${name}\\b`, "i").test(lower)) return i;
  }
  return null;
}

function normalizeUSClubDateText(input: string): string {
  return input
    .replace(/\u00a0/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toISODateUTC(year: number, monthIndex0: number, day: number): string {
  const d = new Date(Date.UTC(year, monthIndex0, day, 12, 0, 0));
  return d.toISOString().slice(0, 10);
}

function inferUSClubLevel(ageGroups: string): string | null {
  const t = (ageGroups || "").toLowerCase();
  if (!t) return null;
  if (t.includes("adult") || t.includes("open")) return "adult";
  return "youth";
}

function inferUSClubYear(html: string): number | null {
  const metaMatch = html.match(/article:modified_time[^>]*content=['\\"](\\d{4})-/i);
  if (metaMatch) return parseInt(metaMatch[1], 10);
  const jsonMatch = html.match(/dateModified\"\\s*:\\s*\"(\\d{4})-/i);
  if (jsonMatch) return parseInt(jsonMatch[1], 10);
  const headingMatch = html.match(/([A-Za-z]+)\\s+(20\\d{2})/);
  if (headingMatch) return parseInt(headingMatch[2], 10);
  return null;
}
