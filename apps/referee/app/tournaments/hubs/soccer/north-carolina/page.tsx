import type { Metadata } from "next";
import SportHubPage, { getSoccerStateUpcomingCount } from "../../_components/SportHubPage";

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.refereeinsights.com").replace(/\/+$/, "");
const PATH = "/tournaments/hubs/soccer/north-carolina";
const STATE_NAME = "North Carolina";
const STATE_CODE = "NC";

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

export default async function SoccerNorthCarolinaHub({
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
      intro="North Carolina events can range from local league-hosted tournaments to larger regional weekends that test referee scheduling, travel timing, and crew coordination. This hub is built to help officials narrow options faster using referee-first criteria. The Reviewed toggle surfaces tournaments with stronger referee-driven context, while Include past events allows broader historical research when you are planning future assignments or evaluating recurring events. Default view is upcoming-only so the list stays focused on current decision windows. RefereeInsights updates this page automatically from public listings and applies normalization rules to improve consistency across hosts, but tournament details may still shift as organizers publish revisions. Use this page as a structured starting point, then confirm final logistics with assignors and official event channels. As verified referee contributions increase, this state hub becomes more useful for identifying well-run tournaments and reducing uncertainty before committing your weekends."
    />
  );
}
