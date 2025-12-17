import type { AdapterResult, CrawlSeed, RunContext } from "../types";
import { appendRunLog } from "../storage";
import crawlUSYouthSoccer from "./usyouthsoccer";

type AdapterFn = (seed: CrawlSeed, ctx: RunContext) => Promise<AdapterResult>;

const ADAPTERS: Record<string, AdapterFn> = {
  "www.usyouthsoccer.org": crawlUSYouthSoccer,
  "usyouthsoccer.org": crawlUSYouthSoccer,
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
