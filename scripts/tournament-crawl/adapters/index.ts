import type { AdapterResult, CrawlSeed, RunContext } from "../types";
import { appendRunLog } from "../storage";
import crawlSportsEngine from "./sportsengine";
import crawlTravelSports from "./travelsports";
import crawlUSYouthSoccer from "./usyouthsoccer";
import crawlFindYouthSports from "./findyouthsports";

type AdapterFn = (seed: CrawlSeed, ctx: RunContext) => Promise<AdapterResult>;

const ADAPTERS: Record<string, AdapterFn> = {
  "www.usyouthsoccer.org": crawlUSYouthSoccer,
  "usyouthsoccer.org": crawlUSYouthSoccer,
  "travelsports.com": crawlTravelSports,
  "discover.sportsengineplay.com": crawlSportsEngine,
  "www.findyouthsports.com": crawlFindYouthSports,
  "findyouthsports.com": crawlFindYouthSports,
};

export async function runAdapter(
  seed: CrawlSeed,
  ctx: RunContext
): Promise<AdapterResult> {
  const host = new URL(seed.url).hostname.toLowerCase();
  const adapter = ADAPTERS[host];
  if (!adapter) {
    appendRunLog(ctx, `No adapter for host ${host}, skipping seed ${seed.url}`);
    return {
      dryRun: ctx.dryRun,
      dryRunResult: {
        seed_url: seed.url,
        detail_links_found: 0,
        detail_links_sample: [],
        blocked: false,
      },
      confirmed: [],
      unconfirmed: [],
    };
  }
  return adapter(seed, ctx);
}
