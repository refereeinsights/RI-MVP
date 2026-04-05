import * as cheerio from "cheerio";
import { atlasSearch, AtlasSearchResult } from "@/server/atlas/search";
import { extractFromPage, rankLinks } from "@/server/enrichment/extract";

export type TournamentEmailSearchContext = {
  id: string;
  name: string | null;
  state: string | null;
  city: string | null;
  sport: string | null;
  official_website_url: string | null;
  source_url: string | null;
};

export type TournamentEmailSearchResult = {
  emails: string[];
  sources: Array<{ url: string; emails: string[]; pages_fetched: number }>;
  queries: string[];
  search_results: AtlasSearchResult[];
};

const MAX_SEARCH_RESULTS = 6;
const MAX_PAGES_TOTAL = 5;
const MAX_PAGES_PER_SEED = 2;
const FETCH_TIMEOUT_MS = 10000;
const MAX_BYTES = 1024 * 700; // 700kb

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function safeUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normEmail(email: string) {
  return email.trim().toLowerCase();
}

function rankEmail(email: string) {
  const local = (email.toLowerCase().split("@")[0] || "").trim();
  if (local.includes("tournament")) return 0;
  if (local.includes("director")) return 1;
  if (local.includes("assignor")) return 2;
  if (local.includes("referee") || local.includes("official")) return 3;
  if (local.includes("info")) return 4;
  if (local.includes("contact")) return 5;
  return 10;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const resp = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "RI-AtlasEmailDiscovery/1.0" },
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
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
  } catch {
    return null;
  }
}

function buildQueries(ctx: TournamentEmailSearchContext) {
  const name = (ctx.name ?? "").trim();
  const state = (ctx.state ?? "").trim();
  const city = (ctx.city ?? "").trim();
  const sport = (ctx.sport ?? "").trim();

  const base = name ? `"${name}"` : "";
  const place = [city, state].filter(Boolean).join(" ");
  const sportToken = sport ? `${sport}` : "";

  const queries = [
    [base, place, sportToken, "tournament director email"].filter(Boolean).join(" "),
    [base, place, sportToken, "contact email"].filter(Boolean).join(" "),
    [base, state, "tournament", "contact"].filter(Boolean).join(" "),
  ]
    .map((q) => q.trim())
    .filter((q) => q.length >= 8);

  return uniq(queries).slice(0, 3);
}

function isMaybeContactLink(url: string) {
  const lower = url.toLowerCase();
  return /(contact|staff|about|support|help|referee|officials|assignor|director)/i.test(lower);
}

export async function findTournamentEmailsViaAtlas(
  ctx: TournamentEmailSearchContext
): Promise<TournamentEmailSearchResult> {
  const seedUrls = uniq([safeUrl(ctx.official_website_url), safeUrl(ctx.source_url)].filter(Boolean) as string[]);
  const queries = buildQueries(ctx);

  const searchResults: AtlasSearchResult[] = [];
  for (const q of queries) {
    const rows = await atlasSearch(q, MAX_SEARCH_RESULTS);
    searchResults.push(...rows);
  }

  const candidateUrls = uniq([
    ...seedUrls,
    ...searchResults.map((r) => safeUrl(r.url)).filter(Boolean),
  ] as string[]).slice(0, 10);

  const sources: Array<{ url: string; emails: string[]; pages_fetched: number }> = [];
  const allEmails = new Set<string>();
  let pagesFetchedTotal = 0;

  for (const url of candidateUrls) {
    if (pagesFetchedTotal >= MAX_PAGES_TOTAL) break;

    const html = await fetchHtml(url);
    if (!html) continue;
    pagesFetchedTotal += 1;

    const page1 = extractFromPage(html, url);
    const emailsHere = (page1.contacts ?? [])
      .map((c) => (c.email ? normEmail(String(c.email)) : ""))
      .filter(Boolean);

    const extraUrls: string[] = [];
    if (pagesFetchedTotal < MAX_PAGES_TOTAL) {
      try {
        const $ = cheerio.load(html);
        const ranked = rankLinks($, new URL(url));
        for (const link of ranked) {
          if (!isMaybeContactLink(link)) continue;
          extraUrls.push(link);
          if (extraUrls.length >= 2) break;
        }
      } catch {
        // ignore
      }
    }

    let pagesFetchedForSeed = 1;
    for (const extraUrl of extraUrls) {
      if (pagesFetchedTotal >= MAX_PAGES_TOTAL) break;
      if (pagesFetchedForSeed >= MAX_PAGES_PER_SEED) break;
      const extraHtml = await fetchHtml(extraUrl);
      if (!extraHtml) continue;
      pagesFetchedTotal += 1;
      pagesFetchedForSeed += 1;
      const page = extractFromPage(extraHtml, extraUrl);
      (page.contacts ?? []).forEach((c) => {
        if (c.email) emailsHere.push(normEmail(String(c.email)));
      });
    }

    const deduped = uniq(emailsHere).filter(Boolean);
    if (deduped.length) {
      deduped.forEach((e) => allEmails.add(e));
    }
    sources.push({ url, emails: deduped, pages_fetched: pagesFetchedForSeed });

    // If we found a high-signal email early, stop fast.
    const best = deduped.slice().sort((a, b) => rankEmail(a) - rankEmail(b))[0];
    if (best && rankEmail(best) <= 2) break;
  }

  const emails = Array.from(allEmails).sort((a, b) => {
    const rank = rankEmail(a) - rankEmail(b);
    return rank !== 0 ? rank : a.localeCompare(b);
  });

  return {
    emails,
    sources,
    queries,
    search_results: searchResults,
  };
}

