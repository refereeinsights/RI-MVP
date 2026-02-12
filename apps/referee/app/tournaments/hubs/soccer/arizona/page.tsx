import type { Metadata } from "next";
import SportHubPage, { getSoccerStateUpcomingCount } from "../../_components/SportHubPage";

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.refereeinsights.com").replace(/\/+$/, "");
const PATH = "/tournaments/hubs/soccer/arizona";
const STATE_NAME = "Arizona";
const STATE_CODE = "AZ";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const count = await getSoccerStateUpcomingCount(STATE_CODE);
  return {
    title: `Soccer Tournaments in ${STATE_NAME} (Calendar) | RefereeInsights`,
    description: `Browse ${count}+ soccer tournaments in ${STATE_NAME}. Filter reviewed events and include past tournaments. Referee-informed tournament details.`,
    alternates: {
      canonical: `${SITE_ORIGIN}${PATH}`,
    },
  };
}

export default async function SoccerArizonaHub({
  searchParams,
}: {
  searchParams?: {
    reviewed?: string | string[];
    past?: string | string[];
  };
}) {
  return (
    <SportHubPage
      mode="state-seo"
      sportParam="soccer"
      stateCode={STATE_CODE}
      stateName={STATE_NAME}
      basePath={PATH}
      searchParams={searchParams}
      intro="Arizona tournament schedules often compress a lot of soccer into limited daylight blocks and multi-field complexes, which can change referee pacing and recovery across a weekend. This page is designed to help officials evaluate opportunities quickly without digging through scattered listings. Use Reviewed to focus on events with referee-informed context, and use Include past events if you want to compare upcoming opportunities against prior seasons and historical tournament patterns. By default, results show upcoming events only so active planning remains the priority. RefereeInsights ingests public tournament data and keeps this listing updated automatically, but clubs and hosts can still adjust details close to event dates. That makes this page best used as a decision-support layer before final confirmation with assignors or event staff. As more referees submit verified experiences, the signal quality here improves and helps crews across Arizona make better assignment decisions with fewer last-minute surprises."
    />
  );
}
