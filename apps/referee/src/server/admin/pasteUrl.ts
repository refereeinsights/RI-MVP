import * as cheerio from "cheerio";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import type { TournamentRow, TournamentStatus, TournamentSource } from "@/lib/types/tournament";
import { queueEnrichmentJobs } from "@/server/enrichment/pipeline";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAsaAzUrl, isAsaAzUrl, sweepAsaAzSanctionedClubTournaments } from "@/server/sweeps/asaAzSanctionedClubTournaments";
import {
  isUsssaBaseballDirectoryUrl,
  isUsssaStateTournamentsUrl,
  sweepUsssaBaseballTournaments,
} from "@/server/sweeps/usssaBaseballTournaments";
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
  sport: "soccer" | "basketball" | "football" | "lacrosse" | "baseball";
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

  if (parsedUrl.hostname.includes("usclublax.com") && parsedUrl.pathname.includes("/tournaments")) {
    const events = parseUsClubLaxTournaments(html);
    if (!events.length) {
      throw new SweepError("html_received_no_events", "US Club Lax tournaments list parsed but no events found", diagnostics);
    }

    const tournamentIds: string[] = [];
    for (const event of events) {
      const tournamentId = await upsertTournamentFromSource({
        ...event,
        sport: "lacrosse",
        status,
        source: "external_crawl",
      });
      tournamentIds.push(tournamentId);
    }

    await queueEnrichmentJobs(tournamentIds);

    const registry = await upsertRegistry({
      source_url: canonical,
      source_type: "directory",
      sport: "lacrosse",
      notes: "US Club Lax upcoming tournaments directory.",
      is_custom_source: true,
    });
    const runId = await insertRun({
      registry_id: registry.registry_id,
      source_url: canonical,
      url: canonical,
      http_status: diagnostics.status ?? 200,
      domain: diagnostics.final_url ? new URL(diagnostics.final_url).hostname : parsedUrl.hostname,
      title: "US Club Lax tournaments",
      extracted_json: { action: "usclublax_import", extracted_count: tournamentIds.length },
      extract_confidence: 0.75,
    });
    await updateRunExtractedJson(runId, { action: "usclublax_import", extracted_count: tournamentIds.length });

    return {
      tournamentId: tournamentIds[0],
      meta: { name: `Imported ${tournamentIds.length} events`, warnings: [] },
      slug: "usclublax-import",
      registry_id: registry.registry_id,
      run_id: runId,
      diagnostics,
      extracted_count: tournamentIds.length,
    };
  }

  if (parsedUrl.hostname.includes("fysa.com") && parsedUrl.pathname.includes("/2026-sanctioned-tournaments")) {
    const events = parseFysaSanctionedTournaments(html);
    if (!events.length) {
      throw new SweepError("html_received_no_events", "FYSA sanctioned list parsed but no events found", diagnostics);
    }

    const tournamentIds: string[] = [];
    for (const event of events) {
      const tournamentId = await upsertTournamentFromSource({
        ...event,
        sport: "soccer",
        status,
        source: "external_crawl",
      });
      tournamentIds.push(tournamentId);
    }

    await queueEnrichmentJobs(tournamentIds);

    const registry = await upsertRegistry({
      source_url: canonical,
      source_type: "association_directory",
      sport: "soccer",
      state: "FL",
      notes: "Florida Youth Soccer Association sanctioned tournaments (2026).",
      is_custom_source: true,
    });
    const runId = await insertRun({
      registry_id: registry.registry_id,
      source_url: canonical,
      url: canonical,
      http_status: diagnostics.status ?? 200,
      domain: diagnostics.final_url ? new URL(diagnostics.final_url).hostname : parsedUrl.hostname,
      title: "FYSA sanctioned tournaments (2026)",
      extracted_json: { action: "fysa_import", extracted_count: tournamentIds.length },
      extract_confidence: 0.7,
    });
    await updateRunExtractedJson(runId, { action: "fysa_import", extracted_count: tournamentIds.length });

    return {
      tournamentId: tournamentIds[0],
      meta: { name: `Imported ${tournamentIds.length} events`, warnings: [] },
      slug: "fysa-import",
      registry_id: registry.registry_id,
      run_id: runId,
      diagnostics,
      extracted_count: tournamentIds.length,
    };
  }

  if (parsedUrl.hostname.includes("ncsoccer.org") && parsedUrl.pathname.includes("/events/list")) {
    const events = parseNcsoccerEventsList(html);
    if (!events.length) {
      throw new SweepError("html_received_no_events", "NC Soccer events list parsed but no events found", diagnostics);
    }

    const tournamentIds: string[] = [];
    for (const event of events) {
      const tournamentId = await upsertTournamentFromSource({
        ...event,
        sport: "soccer",
        status,
        source: "external_crawl",
      });
      tournamentIds.push(tournamentId);
    }

    await queueEnrichmentJobs(tournamentIds);

    const registry = await upsertRegistry({
      source_url: canonical,
      source_type: "association_directory",
      sport: "soccer",
      state: "NC",
      notes: "North Carolina Youth Soccer Association events list.",
      is_custom_source: true,
    });
    const runId = await insertRun({
      registry_id: registry.registry_id,
      source_url: canonical,
      url: canonical,
      http_status: diagnostics.status ?? 200,
      domain: diagnostics.final_url ? new URL(diagnostics.final_url).hostname : parsedUrl.hostname,
      title: "NC Soccer events list",
      extracted_json: { action: "ncsoccer_import", extracted_count: tournamentIds.length },
      extract_confidence: 0.7,
    });
    await updateRunExtractedJson(runId, { action: "ncsoccer_import", extracted_count: tournamentIds.length });

    return {
      tournamentId: tournamentIds[0],
      meta: { name: `Imported ${tournamentIds.length} events`, warnings: [] },
      slug: "ncsoccer-import",
      registry_id: registry.registry_id,
      run_id: runId,
      diagnostics,
      extracted_count: tournamentIds.length,
    };
  }

  if (parsedUrl.hostname.includes("enysoccer.com") && parsedUrl.pathname.includes("/events/category/sanctioned-tournaments")) {
    const events = parseEnysoccerSanctionedTournaments(html);
    if (!events.length) {
      throw new SweepError("html_received_no_events", "ENYSA sanctioned list parsed but no events found", diagnostics);
    }

    const tournamentIds: string[] = [];
    for (const event of events) {
      const tournamentId = await upsertTournamentFromSource({
        ...event,
        sport: "soccer",
        status,
        source: "external_crawl",
      });
      tournamentIds.push(tournamentId);
    }

    await queueEnrichmentJobs(tournamentIds);

    const registry = await upsertRegistry({
      source_url: canonical,
      source_type: "association_directory",
      sport: "soccer",
      state: "NY",
      notes: "Eastern New York Youth Soccer Association sanctioned tournaments list.",
      is_custom_source: true,
    });
    const runId = await insertRun({
      registry_id: registry.registry_id,
      source_url: canonical,
      url: canonical,
      http_status: diagnostics.status ?? 200,
      domain: diagnostics.final_url ? new URL(diagnostics.final_url).hostname : parsedUrl.hostname,
      title: "ENYSA sanctioned tournaments",
      extracted_json: { action: "enysoccer_import", extracted_count: tournamentIds.length },
      extract_confidence: 0.7,
    });
    await updateRunExtractedJson(runId, { action: "enysoccer_import", extracted_count: tournamentIds.length });

    return {
      tournamentId: tournamentIds[0],
      meta: { name: `Imported ${tournamentIds.length} events`, warnings: [] },
      slug: "enysoccer-import",
      registry_id: registry.registry_id,
      run_id: runId,
      diagnostics,
      extracted_count: tournamentIds.length,
    };
  }

  if (parsedUrl.hostname.includes("oregonyouthsoccer.org") && parsedUrl.pathname.includes("/sanctioned-tournaments")) {
    const events = parseOregonSanctionedTournaments(html);
    if (!events.length) {
      throw new SweepError("html_received_no_events", "Oregon sanctioned list parsed but no events found", diagnostics);
    }

    const tournamentIds: string[] = [];
    for (const event of events) {
      const tournamentId = await upsertTournamentFromSource({
        ...event,
        sport: "soccer",
        status,
        source: "external_crawl",
      });
      tournamentIds.push(tournamentId);
    }

    await queueEnrichmentJobs(tournamentIds);

    const registry = await upsertRegistry({
      source_url: canonical,
      source_type: "association_directory",
      sport: "soccer",
      state: "OR",
      notes: "Oregon Youth Soccer sanctioned tournaments listing.",
      is_custom_source: true,
    });
    const runId = await insertRun({
      registry_id: registry.registry_id,
      source_url: canonical,
      url: canonical,
      http_status: diagnostics.status ?? 200,
      domain: diagnostics.final_url ? new URL(diagnostics.final_url).hostname : parsedUrl.hostname,
      title: "Oregon Youth Soccer sanctioned tournaments",
      extracted_json: { action: "oys_oregon_import", extracted_count: tournamentIds.length },
      extract_confidence: 0.7,
    });
    await updateRunExtractedJson(runId, { action: "oys_oregon_import", extracted_count: tournamentIds.length });

    return {
      tournamentId: tournamentIds[0],
      meta: { name: `Imported ${tournamentIds.length} events`, warnings: [] },
      slug: "oys-oregon-import",
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

  if (isUsssaBaseballDirectoryUrl(canonical) || isUsssaStateTournamentsUrl(canonical)) {
    const sweepResult = await sweepUsssaBaseballTournaments({
      sourceUrl: canonical,
      html,
      status,
      writeDb: true,
    });

    if (!sweepResult.counts.found) {
      throw new SweepError("html_received_no_events", "USSSA page parsed but no tournaments found", diagnostics);
    }

    const registry = await upsertRegistry({
      source_url: isUsssaBaseballDirectoryUrl(canonical) ? "https://usssa.com/baseball_events" : canonical,
      source_type: "association_directory",
      sport: "baseball",
      notes: "USSSA baseball tournaments (directory + state pages).",
      is_custom_source: true,
    });
    const runId = await insertRun({
      registry_id: registry.registry_id,
      source_url: canonical,
      url: canonical,
      http_status: diagnostics.status ?? 200,
      domain: diagnostics.final_url ? new URL(diagnostics.final_url).hostname : parsedUrl.hostname,
      title: "USSSA baseball tournaments",
      extracted_json: {
        action: "usssa_baseball_import",
        extracted_count: sweepResult.counts.imported,
        counts: sweepResult.counts,
        sample: sweepResult.sample,
      },
      extract_confidence: 0.7,
    });
    await updateRunExtractedJson(runId, {
      action: "usssa_baseball_import",
      extracted_count: sweepResult.counts.imported,
      counts: sweepResult.counts,
      sample: sweepResult.sample,
    });

    return {
      tournamentId: sweepResult.imported_ids[0] ?? "",
      meta: { name: `Imported ${sweepResult.counts.imported} events`, warnings: [] },
      slug: "usssa-baseball-import",
      registry_id: registry.registry_id,
      run_id: runId,
      diagnostics,
      extracted_count: sweepResult.counts.imported,
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
    ref_cash_tournament: false,
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
  if (host.includes("usclublax.com")) return "lacrosse";
  if (host.includes("usssa.com") && host.includes("baseball")) return "baseball";
  if (host.includes("tournamentmachine.com")) return "basketball";
  if (host.includes("tourneymachine.com")) return "basketball";
  if (host.includes("statebasketballchampionship.com")) return "basketball";

  const text = params.html.toLowerCase();
  const score = {
    soccer: 0,
    basketball: 0,
    football: 0,
    lacrosse: 0,
    baseball: 0,
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
  if (text.includes("lacrosse")) bump("lacrosse", 3);
  if (text.includes("lax")) bump("lacrosse", 2);
  if (text.includes("baseball")) bump("baseball", 3);
  if (text.includes("diamond")) bump("baseball", 1);

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
    ref_cash_tournament: false,
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

  const filtered = results.filter((row) => row.name && row.state && row.start_date);
  const deduped = new Map<string, TournamentRow>();
  for (const row of filtered) {
    const key = row.source_event_id;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

export function parseUsClubLaxTournaments(html: string): TournamentRow[] {
  const $ = cheerio.load(html);
  const rows = $("table.uscl-table tr").toArray();
  const out: TournamentRow[] = [];
  const seen = new Set<string>();

  for (const tr of rows) {
    const cells = $(tr).find("td");
    if (cells.length < 5) continue;

    const nameCell = $(cells[1]);
    const link = nameCell.find("a[href]").first();
    const name = (link.text().trim() || nameCell.clone().find("small").remove().end().text().trim()).replace(/\s+/g, " ");
    if (!name) continue;

    const href = (link.attr("href") || "").trim();
    const location = nameCell.find("small.text-muted").first().text().replace(/\s+/g, " ").trim();
    const gradeText = $(cells[2]).text().replace(/\s+/g, " ").trim();
    const feeText = $(cells[3]).text().replace(/\s+/g, " ").trim();
    const dateText = $(cells[4]).text().replace(/\s+/g, " ").trim();

    const { city, state } = parseCityStateFromLocation(location);
    const parsedDates = parseUsClubLaxDateRange(dateText);

    const sourceUrl =
      href && /^https?:\/\//i.test(href) ? href : "https://usclublax.com/tournaments/";
    const sourceDomain = sourceUrl.startsWith("http")
      ? new URL(sourceUrl).hostname
      : "usclublax.com";
    const slug = buildTournamentSlug({ name, city: city ?? undefined, state: state ?? undefined });
    const sourceEventId = `${name}|${location}|${dateText}`.toLowerCase().replace(/\s+/g, "-");
    if (seen.has(sourceEventId)) continue;
    seen.add(sourceEventId);

    const summaryParts = ["US Club Lax tournament listing."];
    if (gradeText) summaryParts.push(`Grades: ${gradeText}.`);
    if (feeText) summaryParts.push(`Team fee: ${feeText}.`);
    out.push({
      name,
      slug,
      sport: "lacrosse",
      level: null,
      sub_type: "internet",
      ref_cash_tournament: false,
      state: state ?? "NA",
      city: city ?? null,
      venue: null,
      address: null,
      start_date: parsedDates.start ?? null,
      end_date: parsedDates.end ?? parsedDates.start ?? null,
      summary: summaryParts.join(" "),
      status: "draft",
      confidence: 0.75,
      source: "external_crawl",
      source_event_id: sourceEventId,
      source_url: sourceUrl,
      source_domain: sourceDomain,
      raw: {
        location,
        grade: gradeText || null,
        fee: feeText || null,
        date_text: dateText || null,
      },
    });
  }

  return out.filter((row) => Boolean(row.name && row.start_date));
}

function parseCityStateFromLocation(locationRaw: string): { city: string | null; state: string | null } {
  const location = locationRaw.replace(/\s+/g, " ").trim();
  if (!location) return { city: null, state: null };
  const match = location.match(/^(.+?),\s*([A-Z]{2})$/i);
  if (!match) return { city: location || null, state: null };
  return {
    city: match[1].trim() || null,
    state: match[2].toUpperCase(),
  };
}

function parseUsClubLaxDateRange(dateTextRaw: string): { start?: string; end?: string } {
  const normalized = dateTextRaw
    .replace(/\u00a0/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return {};

  const yearMatch = normalized.match(/(20\d{2})/);
  const defaultYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getUTCFullYear();

  const crossMonth = normalized.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2})\s*-\s*([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s*(20\d{2}))?$/i
  );
  if (crossMonth) {
    const startMonth = monthNameToIndex0(crossMonth[1]);
    const endMonth = monthNameToIndex0(crossMonth[3]);
    const startDay = parseInt(crossMonth[2], 10);
    const endDay = parseInt(crossMonth[4], 10);
    const year = crossMonth[5] ? parseInt(crossMonth[5], 10) : defaultYear;
    if (startMonth !== null && endMonth !== null) {
      return {
        start: toISODateUTC(year, startMonth, startDay),
        end: toISODateUTC(year, endMonth, endDay),
      };
    }
  }

  const sameMonth = normalized.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:\s*-\s*(\d{1,2}))?(?:,?\s*(20\d{2}))?$/i);
  if (sameMonth) {
    const month = monthNameToIndex0(sameMonth[1]);
    const startDay = parseInt(sameMonth[2], 10);
    const endDay = sameMonth[3] ? parseInt(sameMonth[3], 10) : startDay;
    const year = sameMonth[4] ? parseInt(sameMonth[4], 10) : defaultYear;
    if (month !== null) {
      return {
        start: toISODateUTC(year, month, startDay),
        end: toISODateUTC(year, month, endDay),
      };
    }
  }

  return {};
}

function parseFysaSanctionedTournaments(html: string): TournamentRow[] {
  const $ = cheerio.load(html);
  const results: TournamentRow[] = [];
  const content = $(".entry-content");

  const tableRows = content.find("table tr").toArray();
  if (tableRows.length) {
    for (const tr of tableRows) {
      const cells = $(tr)
        .find("td")
        .map((_i, td) => $(td).text().trim().replace(/\s+/g, " "))
        .get();
      if (cells.length < 3) continue;
      const [name, locationText, dateText] = cells;
      const parsed = parseFysaDateRange(dateText || "");
      const city = parseFysaCity(locationText);
      const sourceUrl = extractFysaRowUrl($(tr)) ?? "";
      if (!name || !dateText || !city) continue;
      results.push(buildFysaRow({ name, city, dateText, sourceUrl, parsed }));
    }
  }

  const lines = content
    .text()
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 3) continue;
    const [name, locationText, dateText] = parts;
    const parsed = parseFysaDateRange(dateText || "");
    const city = parseFysaCity(locationText);
    if (!name || !dateText || !city) continue;
    results.push(buildFysaRow({ name, city, dateText, sourceUrl: "", parsed }));
  }

  const linkRows = content.find("a").toArray();
  for (const link of linkRows) {
    const href = $(link).attr("href") ?? "";
    const name = $(link).text().trim();
    if (!name || !href || !href.startsWith("http")) continue;
    let rest = "";
    const siblings = content.contents().toArray();
    const idx = siblings.indexOf(link);
    if (idx >= 0) {
      let buffer = "";
      for (let i = idx + 1; i < siblings.length; i += 1) {
        const node = siblings[i];
        if (node.type === "tag" && node.name === "a") break;
        buffer += ` ${$(node).text()}`;
        if (/\d{4}/.test(buffer) && /,\s*FL/i.test(buffer)) break;
      }
      rest = buffer.replace(/\s+/g, " ").trim();
    }
    if (!rest) {
      const container = $(link).closest("p,li,div,td");
      const text = container.text().replace(/\s+/g, " ").trim();
      if (!text) continue;
      rest = text.replace(name, "").trim();
    }
    const match = rest.match(/([A-Za-z .'-]+,\s*FL)\s+([A-Za-z].*?\d{4})/);
    if (!match) continue;
    const locationText = match[1];
    const dateText = match[2];
    const parsed = parseFysaDateRange(dateText);
    const city = parseFysaCity(locationText);
    if (!city) continue;
    results.push(buildFysaRow({ name, city, dateText, sourceUrl: href, parsed }));
  }

  const deduped = new Map<string, TournamentRow>();
  for (const row of results) {
    const key = `${row.name}|${row.city}|${row.start_date ?? ""}|${row.source_url ?? ""}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return Array.from(deduped.values()).filter((row) => row.name && row.start_date);
}

function extractFysaRowUrl($tr: cheerio.Cheerio<any>): string | null {
  const link = $tr.find("a[href^='http']").first();
  return link.length ? (link.attr("href") ?? null) : null;
}

function parseFysaCity(locationText: string): string | null {
  const match = locationText.match(/^(.+?),\s*FL/i);
  return match ? match[1].trim() : null;
}

function buildFysaRow(args: {
  name: string;
  city: string;
  dateText: string;
  sourceUrl: string;
  parsed: { start?: string; end?: string };
}): TournamentRow {
  const slug = buildTournamentSlug({ name: args.name, city: args.city, state: "FL" });
  const sourceUrl = args.sourceUrl || "https://www.fysa.com/2026-sanctioned-tournaments/";
  const sourceDomain = sourceUrl.startsWith("http") ? new URL(sourceUrl).hostname : "www.fysa.com";
  return {
    name: args.name,
    slug,
    sport: "soccer",
    level: null,
    sub_type: "internet",
    ref_cash_tournament: false,
    state: "FL",
    city: args.city,
    venue: null,
    address: null,
    start_date: args.parsed.start ?? null,
    end_date: args.parsed.end ?? args.parsed.start ?? null,
    summary: "FYSA sanctioned tournament listing.",
    status: "draft",
    confidence: 0.6,
    source: "external_crawl",
    source_event_id: `${args.name}-${args.dateText}`,
    source_url: sourceUrl,
    source_domain: sourceDomain,
    raw: { date_text: args.dateText, location: `${args.city}, FL` },
  };
}

function parseFysaDateRange(dateTextRaw: string): { start?: string; end?: string } {
  const normalized = dateTextRaw
    .replace(/\u00a0/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const yearMatch = normalized.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getUTCFullYear();

  const monthRange = normalized.match(
    /^([A-Za-z]+)\s+(\d{1,2})\s*-\s*([A-Za-z]+)\s+(\d{1,2}),\s*\d{4}/
  );
  if (monthRange) {
    const startMonthIdx = monthNameToIndex0(monthRange[1]);
    const endMonthIdx = monthNameToIndex0(monthRange[3]);
    const startDay = parseInt(monthRange[2], 10);
    const endDay = parseInt(monthRange[4], 10);
    if (startMonthIdx !== null && endMonthIdx !== null) {
      return {
        start: toISODateUTC(year, startMonthIdx, startDay),
        end: toISODateUTC(year, endMonthIdx, endDay),
      };
    }
  }

  const sameMonth = normalized.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s*-\s*(\d{1,2}))?,\s*(\d{4})/);
  if (sameMonth) {
    const monthIdx = monthNameToIndex0(sameMonth[1]);
    const startDay = parseInt(sameMonth[2], 10);
    const endDay = sameMonth[3] ? parseInt(sameMonth[3], 10) : startDay;
    if (monthIdx !== null) {
      return {
        start: toISODateUTC(parseInt(sameMonth[4], 10), monthIdx, startDay),
        end: toISODateUTC(parseInt(sameMonth[4], 10), monthIdx, endDay),
      };
    }
  }

  const sameMonthNoComma = normalized.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s*-\s*(\d{1,2}))?\s+(\d{4})/);
  if (sameMonthNoComma) {
    const monthIdx = monthNameToIndex0(sameMonthNoComma[1]);
    const startDay = parseInt(sameMonthNoComma[2], 10);
    const endDay = sameMonthNoComma[3] ? parseInt(sameMonthNoComma[3], 10) : startDay;
    if (monthIdx !== null) {
      return {
        start: toISODateUTC(parseInt(sameMonthNoComma[4], 10), monthIdx, startDay),
        end: toISODateUTC(parseInt(sameMonthNoComma[4], 10), monthIdx, endDay),
      };
    }
  }

  return {};
}

function parseNcsoccerEventsList(html: string): TournamentRow[] {
  const $ = cheerio.load(html);
  const results: TournamentRow[] = [];
  const events = $(".tribe-events-calendar-list__event, .tribe-events-calendar-list__event-row, .tribe-events-calendar-list__event-wrapper").toArray();

  const parseEventContainer = (container: cheerio.Cheerio<any>) => {
    const link = container
      .find("a[href*='/ncsanctionedtournamentpage/'], a[href*='/event/'], a[href*='/events/']")
      .first();
    const href = link.attr("href") ?? "";
    const name = link.text().trim();
    if (!name) return;

    const dateText = extractNcsoccerDateText(container.text());
    const parsed = parseNcsoccerDateRange(dateText || "");
    const city = parseNcsoccerCity(container.text());

    results.push(buildNcsoccerRow({ name, city, dateText: dateText || "", sourceUrl: href, parsed }));
  };

  if (events.length) {
    events.forEach((el) => parseEventContainer($(el)));
  } else {
    const links = $("a[href*='/ncsanctionedtournamentpage/'], a[href*='/event/']").toArray();
    links.forEach((el) => {
      const link = $(el);
      const name = link.text().trim();
      if (!name) return;
      const container = link.closest("article,li,div,section");
      const dateText = extractNcsoccerDateText(container.text());
      const parsed = parseNcsoccerDateRange(dateText || "");
      const city = parseNcsoccerCity(container.text());
      results.push(buildNcsoccerRow({ name, city, dateText: dateText || "", sourceUrl: link.attr("href") ?? "", parsed }));
    });
  }

  const deduped = new Map<string, TournamentRow>();
  for (const row of results) {
    if (!row.name) continue;
    const key = `${row.name}|${row.city ?? ""}|${row.start_date ?? ""}|${row.source_url ?? ""}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

function extractNcsoccerDateText(textRaw: string): string | null {
  const normalized = textRaw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const rangeMatch = normalized.match(
    /([A-Za-z]+)\s+\d{1,2}\s*-\s*(?:[A-Za-z]+\\s+)?\d{1,2}(?:,?\s*\d{4})?/
  );
  if (rangeMatch) return rangeMatch[0];
  const singleMatch = normalized.match(/([A-Za-z]+)\s+\d{1,2},\s*\d{4}/);
  if (singleMatch) return singleMatch[0];
  return null;
}

function parseNcsoccerCity(textRaw: string): string | null {
  const normalized = textRaw.replace(/\s+/g, " ").trim();
  const match = normalized.match(/([A-Za-z .'-]+),\s*NC/);
  if (match) return match[1].trim();
  const simple = normalized.match(/([A-Za-z .'-]+)\s+NC/);
  return simple ? simple[1].trim() : null;
}

function parseNcsoccerDateRange(dateTextRaw: string): { start?: string; end?: string } {
  const normalized = dateTextRaw
    .replace(/\u00a0/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const yearMatch = normalized.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getUTCFullYear();

  const monthRange = normalized.match(
    /^([A-Za-z]+)\s+(\d{1,2})\s*-\s*([A-Za-z]+)?\s*(\d{1,2})(?:,?\s*(\d{4}))?/
  );
  if (monthRange) {
    const startMonthIdx = monthNameToIndex0(monthRange[1]);
    const endMonthIdx = monthNameToIndex0(monthRange[3] || monthRange[1]);
    const startDay = parseInt(monthRange[2], 10);
    const endDay = parseInt(monthRange[4], 10);
    const parsedYear = monthRange[5] ? parseInt(monthRange[5], 10) : year;
    if (startMonthIdx !== null && endMonthIdx !== null) {
      return {
        start: toISODateUTC(parsedYear, startMonthIdx, startDay),
        end: toISODateUTC(parsedYear, endMonthIdx, endDay),
      };
    }
  }

  const single = normalized.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?/);
  if (single) {
    const monthIdx = monthNameToIndex0(single[1]);
    const day = parseInt(single[2], 10);
    const parsedYear = single[3] ? parseInt(single[3], 10) : year;
    if (monthIdx !== null) {
      return {
        start: toISODateUTC(parsedYear, monthIdx, day),
        end: toISODateUTC(parsedYear, monthIdx, day),
      };
    }
  }

  return {};
}

function buildNcsoccerRow(args: {
  name: string;
  city: string | null;
  dateText: string;
  sourceUrl: string;
  parsed: { start?: string; end?: string };
}): TournamentRow {
  const slug = buildTournamentSlug({ name: args.name, city: args.city ?? null, state: "NC" });
  const sourceUrl = args.sourceUrl || "https://www.ncsoccer.org/events/list/";
  const sourceDomain = sourceUrl.startsWith("http") ? new URL(sourceUrl).hostname : "www.ncsoccer.org";
  return {
    name: args.name,
    slug,
    sport: "soccer",
    level: null,
    sub_type: "internet",
    ref_cash_tournament: false,
    state: "NC",
    city: args.city ?? null,
    venue: null,
    address: null,
    start_date: args.parsed.start ?? null,
    end_date: args.parsed.end ?? args.parsed.start ?? null,
    summary: "NCYSA events listing.",
    status: "draft",
    confidence: 0.6,
    source: "external_crawl",
    source_event_id: `${args.name}-${args.dateText}`,
    source_url: sourceUrl,
    source_domain: sourceDomain,
    raw: { date_text: args.dateText, location: args.city ? `${args.city}, NC` : null },
  };
}

function parseEnysoccerSanctionedTournaments(html: string): TournamentRow[] {
  const $ = cheerio.load(html);
  const results: TournamentRow[] = [];
  const events = $(
    ".tribe-events-calendar-list__event, .tribe-events-calendar-list__event-row, .tribe-events-calendar-list__event-wrapper"
  ).toArray();

  const parseEventContainer = (container: cheerio.Cheerio<any>) => {
    const titleLink = container
      .find(".tribe-events-calendar-list__event-title a, h3 a, h2 a")
      .first();
    const name = titleLink.text().trim();
    if (!name) return;
    const href = titleLink.attr("href") ?? "";
    const containerText = container.text().replace(/\s+/g, " ").trim();
    const dateText =
      container
        .find(".tribe-events-calendar-list__event-date-tag, .tribe-events-calendar-list__event-date-time, time")
        .first()
        .text()
        .trim() || extractEnysoccerDateText(containerText);
    const parsed = parseEnysoccerDateRange(dateText || "");
    const location = parseEnysoccerLocation(container);

    results.push(
      buildEnysoccerRow({
        name,
        city: location.city,
        venue: location.venue,
        address: location.address,
        dateText: dateText || "",
        sourceUrl: href,
        parsed,
        rawLocation: location.raw,
      })
    );
  };

  if (events.length) {
    events.forEach((el) => parseEventContainer($(el)));
  } else {
    const links = $("a[href*='/event/'], a[href*='/events/']").toArray();
    links.forEach((el) => {
      const link = $(el);
      const name = link.text().trim();
      if (!name) return;
      const container = link.closest("article,li,div,section");
      const text = container.text().replace(/\s+/g, " ").trim();
      const dateText = extractEnysoccerDateText(text);
      const parsed = parseEnysoccerDateRange(dateText || "");
      const location = parseEnysoccerLocation(container);
      results.push(
        buildEnysoccerRow({
          name,
          city: location.city,
          venue: location.venue,
          address: location.address,
          dateText: dateText || "",
          sourceUrl: link.attr("href") ?? "",
          parsed,
          rawLocation: location.raw,
        })
      );
    });
  }

  const deduped = new Map<string, TournamentRow>();
  for (const row of results) {
    if (!row.name) continue;
    const key = `${row.name}|${row.city ?? ""}|${row.start_date ?? ""}|${row.source_url ?? ""}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

export function parseOregonSanctionedTournaments(html: string): TournamentRow[] {
  const $ = cheerio.load(html);
  const results: TournamentRow[] = [];
  const entry = $(".entry-content").first();
  const sectionRoot = entry.length ? entry : $("main, article, body").first();
  const headingText = sectionRoot
    .find("h1,h2,h3,h4,h5")
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, " ").trim())
    .find((text) => /sanctioned tournaments/i.test(text));

  const headingYears = headingText?.match(/(20\d{2})\D+(20\d{2})/);
  const defaultYear = headingYears ? parseInt(headingYears[2], 10) : new Date().getUTCFullYear();

  const rows = sectionRoot.find("p").toArray();
  for (const row of rows) {
    const $row = $(row);
    const text = $row.text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (/complete this packet|register your tournaments|will appear below|email to/i.test(text)) continue;

    const link = $row.find("a[href^='http']").first();
    if (!link.length) continue;
    const href = link.attr("href")?.trim() || "";
    const linkText = link.text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!href || !linkText) continue;
    if (!/\b(20\d{2})\b/.test(linkText)) continue;

    const hostMatch = text.match(/^(.+?)\s*[–-]\s*/);
    const host = hostMatch?.[1]?.trim() || null;
    const parsed = parseOregonEventText(linkText, defaultYear);
    if (!parsed?.name || !parsed.start) continue;

    results.push(
      buildOregonRow({
        name: parsed.name,
        host,
        start: parsed.start,
        end: parsed.end ?? parsed.start,
        sourceUrl: href,
        dateText: parsed.dateText,
      })
    );
  }

  const deduped = new Map<string, TournamentRow>();
  for (const row of results) {
    if (!row.name || !row.start_date) continue;
    const key = `${row.name}|${row.start_date}|${row.end_date ?? ""}|${row.source_url ?? ""}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

function parseOregonEventText(
  textRaw: string,
  defaultYear: number
): { name: string; dateText: string; start?: string; end?: string } | null {
  const text = textRaw
    .replace(/\u00a0/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const monthToken = text.match(
    /\b(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept|Sep|October|Oct|November|Nov|December|Dec)\b/i
  );
  if (!monthToken || monthToken.index == null) return null;
  const name = text
    .slice(0, monthToken.index)
    .replace(/\s*[–,-]\s*$/, "")
    .replace(/\b\d{4}\b\s*$/, "")
    .trim();
  const dateText = text.slice(monthToken.index).trim();
  if (!name) return null;

  const yearTail = dateText.match(/(20\d{2})\s*$/);
  const inferredYear = yearTail ? parseInt(yearTail[1], 10) : defaultYear;
  const segments = Array.from(
    dateText.matchAll(
      /([A-Za-z]{3,9})\s+(\d{1,2})(?:\s*(?:-|&|and|to)\s*(\d{1,2}))?(?:,\s*(20\d{2}))?/gi
    )
  );
  if (!segments.length) return { name, dateText };

  const starts: string[] = [];
  const ends: string[] = [];
  for (const seg of segments) {
    const monthIdx = monthNameToIndex0(seg[1]);
    if (monthIdx === null) continue;
    const dayStart = parseInt(seg[2], 10);
    const dayEnd = seg[3] ? parseInt(seg[3], 10) : dayStart;
    const year = seg[4] ? parseInt(seg[4], 10) : inferredYear;
    starts.push(toISODateUTC(year, monthIdx, dayStart));
    ends.push(toISODateUTC(year, monthIdx, dayEnd));
  }
  if (!starts.length) return { name, dateText };

  starts.sort();
  ends.sort();
  return { name, dateText, start: starts[0], end: ends[ends.length - 1] };
}

function buildOregonRow(args: {
  name: string;
  host: string | null;
  start: string;
  end: string;
  sourceUrl: string;
  dateText: string;
}): TournamentRow {
  const sourceUrl = args.sourceUrl || "https://www.oregonyouthsoccer.org/sanctioned-tournaments/";
  const sourceDomain = sourceUrl.startsWith("http") ? new URL(sourceUrl).hostname : "www.oregonyouthsoccer.org";
  return {
    name: args.name,
    slug: buildTournamentSlug({ name: args.name, city: null, state: "OR" }),
    sport: "soccer",
    level: null,
    sub_type: "internet",
    ref_cash_tournament: false,
    state: "OR",
    city: null,
    venue: null,
    address: null,
    start_date: args.start,
    end_date: args.end,
    summary: `Oregon Youth Soccer sanctioned tournament${args.host ? ` hosted by ${args.host}` : ""}.`,
    status: "draft",
    confidence: 0.65,
    source: "external_crawl",
    source_event_id: `${args.name}|${args.dateText}|${args.host ?? ""}`.toLowerCase().replace(/\s+/g, "-"),
    source_url: sourceUrl,
    source_domain: sourceDomain,
    raw: {
      date_text: args.dateText,
      host_org: args.host,
    },
  };
}

function extractEnysoccerDateText(textRaw: string): string | null {
  const normalized = textRaw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const range = normalized.match(
    /([A-Za-z]+)\s+\d{1,2}(?:,\s*\d{4})?\s*-\s*([A-Za-z]+)?\s*\d{1,2}(?:,\s*\d{4})?/i
  );
  if (range) return range[0];
  const single = normalized.match(/([A-Za-z]+)\s+\d{1,2},\s*\d{4}/i);
  if (single) return single[0];
  return null;
}

function parseEnysoccerLocation(container: cheerio.Cheerio<any>): {
  venue: string | null;
  address: string | null;
  city: string | null;
  raw: string | null;
} {
  const venueText = container
    .find(".tribe-events-calendar-list__event-venue, .tribe-events-venue-details, .tribe-events-venue")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const raw = venueText || container.text().replace(/\s+/g, " ").trim();
  if (!raw) return { venue: null, address: null, city: null, raw: null };

  const cityMatch = raw.match(/([A-Za-z .'-]+),\s*NY\b/);
  const city = cityMatch ? cityMatch[1].trim() : null;
  const addressMatch = raw.match(/(\d{1,6}\s+[^,]+,\s*[A-Za-z .'-]+,\s*NY\b[^]*)/);
  const address = addressMatch ? addressMatch[1].trim() : null;
  let venue: string | null = null;
  if (address && raw.includes(address)) {
    venue = raw.replace(address, "").trim();
  } else if (venueText) {
    venue = venueText;
  }
  if (venue === raw) venue = null;
  return { venue: venue || null, address, city, raw };
}

function parseEnysoccerDateRange(dateTextRaw: string): { start?: string; end?: string } {
  const normalized = dateTextRaw
    .replace(/\u00a0/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const yearMatch = normalized.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getUTCFullYear();

  const range = normalized.match(
    /^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s*-\s*([A-Za-z]+)?\s*(\d{1,2})(?:,\s*(\d{4}))?/
  );
  if (range) {
    const startMonthIdx = monthNameToIndex0(range[1]);
    const endMonthIdx = monthNameToIndex0(range[4] || range[1]);
    const startDay = parseInt(range[2], 10);
    const endDay = parseInt(range[5], 10);
    const parsedYear = range[3] ? parseInt(range[3], 10) : range[6] ? parseInt(range[6], 10) : year;
    const endYear = range[6] ? parseInt(range[6], 10) : parsedYear;
    if (startMonthIdx !== null && endMonthIdx !== null) {
      return {
        start: toISODateUTC(parsedYear, startMonthIdx, startDay),
        end: toISODateUTC(endYear, endMonthIdx, endDay),
      };
    }
  }

  const single = normalized.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?/);
  if (single) {
    const monthIdx = monthNameToIndex0(single[1]);
    const day = parseInt(single[2], 10);
    const parsedYear = single[3] ? parseInt(single[3], 10) : year;
    if (monthIdx !== null) {
      return {
        start: toISODateUTC(parsedYear, monthIdx, day),
        end: toISODateUTC(parsedYear, monthIdx, day),
      };
    }
  }

  return {};
}

function buildEnysoccerRow(args: {
  name: string;
  city: string | null;
  venue: string | null;
  address: string | null;
  dateText: string;
  sourceUrl: string;
  parsed: { start?: string; end?: string };
  rawLocation: string | null;
}): TournamentRow {
  const slug = buildTournamentSlug({ name: args.name, city: args.city ?? null, state: "NY" });
  const sourceUrl = args.sourceUrl || "https://www.enysoccer.com/events/category/sanctioned-tournaments/";
  const sourceDomain = sourceUrl.startsWith("http") ? new URL(sourceUrl).hostname : "www.enysoccer.com";
  return {
    name: args.name,
    slug,
    sport: "soccer",
    level: null,
    sub_type: "internet",
    ref_cash_tournament: false,
    state: "NY",
    city: args.city ?? null,
    venue: args.venue ?? null,
    address: args.address ?? null,
    start_date: args.parsed.start ?? null,
    end_date: args.parsed.end ?? args.parsed.start ?? null,
    summary: "ENYSA sanctioned tournaments listing.",
    status: "draft",
    confidence: 0.6,
    source: "external_crawl",
    source_event_id: `${args.name}-${args.dateText}`,
    source_url: sourceUrl,
    source_domain: sourceDomain,
    raw: { date_text: args.dateText, location: args.rawLocation },
  };
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
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const sourceEventId = [normalizedName, state.toLowerCase(), start ?? "", end ?? start ?? ""]
      .filter(Boolean)
      .join("|");

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
      source_event_id: sourceEventId,
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
