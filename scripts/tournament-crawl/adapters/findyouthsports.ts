import * as cheerio from "cheerio";

import { fetchHtml } from "../http";
import { appendRunLog } from "../storage";
import { generateSlug } from "../slug";
import type {
  AdapterResult,
  CrawlSeed,
  RunContext,
  TournamentRecord,
} from "../types";

function absoluteUrl(url: string, base: string) {
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

function looksLikeDetailLink(url: string) {
  return /findyouthsports\.com\/(event|events|tournament|tournaments)/i.test(url);
}

function extractCityState(text: string | null) {
  if (!text) return { city: null, state: null };
  const match = text.match(/([A-Za-z\s]+),\s*([A-Z]{2})/);
  if (match) {
    return { city: match[1].trim(), state: match[2].trim() };
  }
  return { city: null, state: null };
}

function findLocation($$: cheerio.CheerioAPI) {
  const locationSelectors = [
    "[data-testid='location']",
    ".location",
    ".Location",
    ".event-location",
  ];
  for (const selector of locationSelectors) {
    const text = $$(selector).first().text().trim();
    if (text) return text;
  }

  const fallback = $$("*")
    .not("script,style")
    .filter((_, el) => /,\s*[A-Z]{2}/.test($$(el).text()))
    .first()
    .text()
    .trim();
  return fallback || null;
}

export default async function crawlFindYouthSports(
  seed: CrawlSeed,
  ctx: RunContext
): Promise<AdapterResult> {
  const listingHtml = await fetchHtml(seed.url, ctx);
  const $ = cheerio.load(listingHtml);
  const detailLinks = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const absolute = absoluteUrl(href, seed.url);
    if (!absolute) return;
    if (!looksLikeDetailLink(absolute)) return;
    detailLinks.add(absolute.split("#")[0]);
  });

  const sample = Array.from(detailLinks).slice(0, 10);

  if (ctx.dryRun) {
    return {
      dryRun: true,
      dryRunResult: {
        seed_url: seed.url,
        detail_links_found: detailLinks.size,
        detail_links_sample: sample,
        blocked: false,
      },
      confirmed: [],
      unconfirmed: [],
    };
  }

  const unconfirmed: TournamentRecord[] = [];

  for (const link of detailLinks) {
    try {
      const html = await fetchHtml(link, ctx);
      const $$ = cheerio.load(html);

      const title =
        $$("h1")
          .first()
          .text()
          .trim() ||
        $$("meta[property='og:title']").attr("content") ||
        $$("title").text().trim() ||
        "FindYouthSports Tournament";

      const summary =
        $$("meta[name='description']").attr("content") ||
        $$("meta[property='og:description']").attr("content") ||
        $$("p")
          .first()
          .text()
          .trim() ||
        null;

      const locationText = findLocation($$);
      const { city, state } = extractCityState(locationText);

      const slug = generateSlug(title, city, state, ctx.slugRegistry);

      unconfirmed.push({
        name: title,
        slug,
        sport: seed.sport,
        level: seed.level ?? null,
        state,
        city,
        venue: null,
        address: null,
        start_date: null,
        end_date: null,
        referee_pay: null,
        referee_contact: null,
        source_url: link,
        source_domain: new URL(link).hostname,
        summary,
        status: "unconfirmed",
        confidence: null,
      });
    } catch (error) {
      appendRunLog(
        ctx,
        `Failed to parse FindYouthSports detail ${link}: ${(error as Error).message}`
      );
    }
  }

  return {
    dryRun: false,
    confirmed: [],
    unconfirmed,
  };
}
