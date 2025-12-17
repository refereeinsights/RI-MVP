import * as cheerio from "cheerio";

import { fetchHtml } from "../http";
import { appendRunLog } from "../storage";
import { generateSlug } from "../slug";
import type { AdapterResult, CrawlSeed, RunContext, TournamentRecord } from "../types";

function absoluteUrl(url: string, base: string) {
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

export default async function crawlUSYouthSoccer(
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
    if (absolute === seed.url) return;
    if (!/events?/i.test(absolute)) return;
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
        $$(".et_pb_module_header")
          .first()
          .text()
          .trim() ||
        $$("h1")
          .first()
          .text()
          .trim() ||
        $$("title").text().trim() ||
        "Untitled Tournament";
      const summary =
        $$("meta[name='description']").attr("content") ||
        $$("p")
          .first()
          .text()
          .trim() ||
        null;
      const slug = generateSlug(title, null, null, ctx.slugRegistry);

      unconfirmed.push({
        name: title,
        slug,
        sport: seed.sport,
        level: seed.level ?? null,
        state: null,
        city: null,
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
        `Failed to parse detail page ${link}: ${(error as Error).message}`
      );
    }
  }

  return {
    dryRun: false,
    confirmed: [],
    unconfirmed,
  };
}
