import { HubTournamentsPage, getHubMetadata } from "../hubs/HubTournamentsPage";

export const revalidate = 300;
export const metadata = getHubMetadata("soccer");

export default async function SoccerHubPage({
  searchParams,
}: {
  searchParams?: { q?: string; state?: string | string[]; month?: string; includePast?: string };
}) {
  return <HubTournamentsPage hub="soccer" searchParams={searchParams} />;
}
