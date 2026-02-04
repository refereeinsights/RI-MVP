import * as cheerio from "cheerio";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import type { TournamentRow, TournamentStatus, TournamentSource } from "@/lib/types/tournament";
import { queueEnrichmentJobs } from "@/server/enrichment/pipeline";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { insertRun, normalizeSourceUrl, upsertRegistry, updateRunExtractedJson } from "./sources";
import { SweepError, classifyHtmlPayload, httpErrorCode } from "./sweepDiagnostics";

const FETCH_TIMEOUT_MS = 10000;
const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;

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
  const { url, sport } = params;
  const status: TournamentStatus = params.status ?? "draft";
  const source: TournamentSource = params.source ?? "external_crawl";

  const { canonical, host } = normalizeSourceUrl(url);
  const { html, diagnostics } = await fetchHtmlWithDiagnostics(url);

  const parsedUrl = new URL(canonical);
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

  return { tournamentId, meta, slug, registry_id: registry.registry_id, run_id: runId, diagnostics };
}
