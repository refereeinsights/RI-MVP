import * as cheerio from "cheerio";
import { upsertTournamentFromSource } from "@/lib/tournaments/upsertFromSource";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import type { TournamentRow, TournamentStatus, TournamentSource } from "@/lib/types/tournament";
import { queueEnrichmentJobs } from "@/server/enrichment/pipeline";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const FETCH_TIMEOUT_MS = 10000;
const MAX_BYTES = 1024 * 1024;

export async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "RI-Admin-PasteURL/1.0" },
    });
    clearTimeout(timeout);
    const ct = resp.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    const reader = resp.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.length;
        if (received > MAX_BYTES) break;
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch (err) {
    console.warn("[paste-url] fetch failed", url, err);
    return null;
  }
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
  const match = text.match(/([A-Za-z .'-]{3,}),\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/);
  if (match) {
    return { city: match[1].trim(), state: match[2].toUpperCase() };
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

  const html = await fetchHtml(url);
  if (!html) throw new Error("failed_to_fetch_html");

  const parsedUrl = new URL(url);
  const meta = parseMetadata(html);
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
    state: meta.state ?? null,
    city: meta.city ?? null,
    venue: null,
    address: null,
    start_date: meta.start_date ?? null,
    end_date: meta.end_date ?? meta.start_date ?? null,
    summary: meta.summary ?? null,
    status,
    confidence: undefined,
    source,
    source_event_id: url,
    source_url: url,
    source_domain: parsedUrl.hostname,
    raw: null,
  };

  const tournamentId = await upsertTournamentFromSource(row);
  await queueEnrichmentJobs([tournamentId]);

  await supabaseAdmin
    .from("tournaments" as any)
    .update({ image_url: meta.image_url ?? null })
    .eq("id", tournamentId);

  return { tournamentId, meta, slug };
}
