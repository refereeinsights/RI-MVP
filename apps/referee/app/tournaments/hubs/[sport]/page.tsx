import type { Metadata } from "next";
import SportHubPage, { sportLabelFromParam } from "../_components/SportHubPage";

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.refereeinsights.com").replace(/\/+$/, "");

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { sport: string };
}): Promise<Metadata> {
  const sportLabel = sportLabelFromParam(params.sport);
  return {
    title: `${sportLabel} Tournament Directory | RefereeInsights`,
    description: `Public beta directory for ${sportLabel} tournaments. Details sourced from public listings with referee insights coming soon.`,
    alternates: {
      canonical: `${SITE_ORIGIN}/tournaments/hubs/${params.sport.toLowerCase()}`,
    },
  };
}

export default async function SportTournamentHub({
  params,
  searchParams,
}: {
  params: { sport: string };
  searchParams?: {
    q?: string;
    state?: string | string[];
    month?: string;
    reviewed?: string | string[];
    includePast?: string | string[];
  };
}) {
  return (
    <SportHubPage
      mode="generic"
      sportParam={params.sport}
      basePath={`/tournaments/hubs/${params.sport.toLowerCase()}`}
      searchParams={searchParams}
    />
  );
}
