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
  return /home\.gotsoccer\.com\/event/i.test(url) || /EventID=/i.test(url);
}

function cleanText(value?: string | null) {
  return value ? value.replace(/\s+/g, " ").trim() : null;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

export default async function crawlGotSoccer(
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
        cleanText(
          $$("#ctl00_MainContent_lblEventName")
            .first()
            .text()
        ) ||
        cleanText(
          $$("h1")
            .first()
            .text()
        ) ||
        cleanText($$("title").text()) ||
        "GoT Soccer Tournament";

      const summary =
        cleanText($$("meta[name='description']").attr("content")) ||
        cleanText(
          $$(".event-description p")
            .first()
            .text()
        ) ||
        null;

      const city = cleanText(
        $$("#ctl00_MainContent_lblCity")
          .first()
          .text()
      );
      const state = cleanText(
        $$("#ctl00_MainContent_lblState")
          .first()
          .text()
      );
      const venue = cleanText(
        $$("#ctl00_MainContent_lblComplex")
          .first()
          .text()
      );
      const address = cleanText(
        $$("#ctl00_MainContent_lblAddress")
          .first()
          .text()
      );
      const start_date = parseDate(
        $$("#ctl00_MainContent_lblStartDate")
          .first()
          .text()
      );
      const end_date = parseDate(
        $$("#ctl00_MainContent_lblEndDate")
          .first()
          .text()
      );

      const slug = generateSlug(title ?? "gotsoccer-tournament", city, state, ctx.slugRegistry);

      unconfirmed.push({
        name: title ?? "GoT Soccer Tournament",
        slug,
        sport: seed.sport,
        level: seed.level ?? null,
        state,
        city,
        venue,
        address,
        start_date,
        end_date,
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
        `Failed to parse GoTSoccer detail ${link}: ${(error as Error).message}`
      );
    }
  }

  return {
    dryRun: false,
    confirmed: [],
    unconfirmed,
  };
}
