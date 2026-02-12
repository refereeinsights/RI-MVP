import type { Metadata } from "next";
import SportHubPage, { getSoccerStateUpcomingCount } from "../../_components/SportHubPage";

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.refereeinsights.com").replace(/\/+$/, "");
const PATH = "/tournaments/hubs/soccer/california";
const STATE_NAME = "California";
const STATE_CODE = "CA";

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

export default async function SoccerCaliforniaHub({
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
      intro="California tournaments span a wide range of referee environments, from compact local events to large multi-venue weekends that require careful travel planning and stronger pre-game coordination. This page is built for officials who want a cleaner way to evaluate options before committing a weekend. You can use the Reviewed toggle to focus on events that already include referee-informed signals, and use Include past events when you want historical context while planning future assignments. By default, this page shows upcoming events so active scheduling decisions are front and center. RefereeInsights updates listings continuously from public tournament sources and normalizes what it can verify, but details can still change quickly as clubs and directors update schedules. If you spot inaccuracies, submitting corrections helps improve visibility for crews across the state and makes tournament selection more predictable for everyone."
    />
  );
}
