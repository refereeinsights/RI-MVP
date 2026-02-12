import type { Metadata } from "next";
import SportHubPage, { getSoccerStateUpcomingCount } from "../../_components/SportHubPage";

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.refereeinsights.com").replace(/\/+$/, "");
const PATH = "/tournaments/hubs/soccer/florida";
const STATE_NAME = "Florida";
const STATE_CODE = "FL";

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

export default async function SoccerFloridaHub({
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
      intro="Florida weekends can involve dense tournament clusters, variable travel times, and fast schedule swings tied to weather and field availability. For referees, the important question is not just whether a tournament exists, but whether it fits your crew’s goals, logistics, and expected game load. This state page keeps that decision process simple. Turn on Reviewed to narrow to events that already have referee-driven signals, and use Include past events when you want to compare current listings with prior tournament activity. Default behavior is upcoming-only so you are looking at assignments you can still act on. RefereeInsights continuously refreshes listings from public data sources, then standardizes event details where possible. That said, directors may revise venues, start windows, or contacts close to kickoff, so this page should be treated as a practical planning tool rather than a final confirmation source. Reporting corrections improves accuracy for officials statewide."
    />
  );
}
