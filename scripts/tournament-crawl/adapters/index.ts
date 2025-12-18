import type { AdapterResult, CrawlSeed, RunContext } from "../types";
import { appendRunLog } from "../storage";
import crawlFindYouthSports from "./findyouthsports";
import crawlGoTSoccer from "./gotsoccer";
import crawlSportsEngine from "./sportsengine";
import crawlTravelSports from "./travelsports";
import crawlInfoSports from "./infosports";
import crawlExposureEvents from "./exposureevents";
import crawlUSClubSoccer from "./usclubsoccer";
import crawlUSYouthSoccer from "./usyouthsoccer";
import crawlUSAB from "./usab";
import crawlTourneyMachine from "./tourneymachine";
import crawlUSAFootball from "./usafootball";
import crawlEventConnect from "./eventconnect";
import crawlPlayNAIA from "./playnaia";
import crawlSoccerWire from "./soccerwire";

type AdapterFn = (seed: CrawlSeed, ctx: RunContext) => Promise<AdapterResult>;

const ADAPTERS: Record<string, AdapterFn> = {
  "www.usyouthsoccer.org": crawlUSYouthSoccer,
  "usyouthsoccer.org": crawlUSYouthSoccer,
  "travelsports.com": crawlTravelSports,
  "discover.sportsengineplay.com": crawlSportsEngine,
  "www.findyouthsports.com": crawlFindYouthSports,
  "findyouthsports.com": crawlFindYouthSports,
  "home.gotsoccer.com": crawlGoTSoccer,
  "www.infosports.com": crawlInfoSports,
  "infosports.com": crawlInfoSports,
  "usclubsoccer.org": crawlUSClubSoccer,
  "basketball.exposureevents.com": crawlExposureEvents,
  "www.usab.com": crawlUSAB,
  "www.tourneymachine.com": crawlTourneyMachine,
  "tourneymachine.com": crawlTourneyMachine,
  "www.usafootball.com": crawlUSAFootball,
  "www.eventconnect.io": crawlEventConnect,
  "www.playnaia.com": crawlPlayNAIA,
  "www.soccerwire.com": crawlSoccerWire,
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
