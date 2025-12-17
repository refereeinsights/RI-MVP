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
  return /discover\.sportsengineplay\.com\/(tournaments|events|event)/i.test(url);
}

function extractCityState(text: string) {
  const match = text.match(/([A-Za-z\s]+),\s*([A-Z]{2})/);
  if (match) {
    return { city: match[1].trim(), state: match[2].trim() };
  }
  return { city: null, state: null };
}

function parseJsonLd(
  $$: cheerio.CheerioAPI
): { name?: string; start?: string; end?: string; venue?: string; location?: string } {
  const result: { name?: string; start?: string; end?: string; venue?: string; location?: string } = {};
  $$("script[type='application/ld+json']").each((_, el) => {
    const raw = $$(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      const data = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of data) {
        if (!entry || typeof entry !== "object") continue;
        if (entry["@type"] === "Event") {
          if (!result.name && typeof entry.name === "string") result.name = entry.name;
          if (!result.start && typeof entry.startDate === "string") result.start = entry.startDate;
          if (!result.end && typeof entry.endDate === "string") result.end = entry.endDate;
          if (!result.venue && entry.location) {
            if (typeof entry.location.name === "string") {
              result.venue = entry.location.name;
            }
            if (entry.location.address) {
              if (typeof entry.location.address.streetAddress === "string") {
                result.location = entry.location.address.streetAddress;
              }
              if (
                typeof entry.location.address.addressLocality === "string" &&
                typeof entry.location.address.addressRegion === "string"
              ) {
                result.location = `${entry.location.address.addressLocality}, ${entry.location.address.addressRegion}`;
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
  });
  return result;
}

export default async function crawlSportsEngine(
  seed: CrawlSeed,
  ctx: RunContext
): Promise<AdapterResult> {
  const listingHtml = await fetchHtml(seed.url, ctx);
  const $ = cheerio.load(listingHtml);
  const detailLinks = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
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
        "SportsEngine Tournament";

      const summary =
        $$("meta[name='description']").attr("content") ||
        $$("meta[property='og:description']").attr("content") ||
        $$("p")
          .first()
          .text()
          .trim() ||
        null;

      const jsonLd = parseJsonLd($$);

      const locationText =
        jsonLd.location ||
        $$("*:contains(',')")
          .not("script,style")
          .filter((_, elem) => {
            const text = $$(elem).text().trim();
            return /,\s*[A-Z]{2}/.test(text);
          })
          .first()
          .text()
          .trim();

      const { city, state } = locationText ? extractCityState(locationText) : { city: null, state: null };

      const slug = generateSlug(title, city, state, ctx.slugRegistry);

      unconfirmed.push({
        name: jsonLd.name || title,
        slug,
        sport: seed.sport,
        level: seed.level ?? null,
        state,
        city,
        venue: jsonLd.venue ?? null,
        address: null,
        start_date: jsonLd.start ?? null,
        end_date: jsonLd.end ?? null,
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
        `Failed to parse SportsEngine detail ${link}: ${(error as Error).message}`
      );
    }
  }

  return {
    dryRun: false,
    confirmed: [],
    unconfirmed,
  };
}
