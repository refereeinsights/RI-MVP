import { HubTournamentsPage, getHubMetadata } from "../hubs/HubTournamentsPage";

export const revalidate = 300;
export const metadata = getHubMetadata("hockey");

export default async function HockeyHubPage({
  searchParams,
}: {
  searchParams?: { q?: string; state?: string | string[]; month?: string; includePast?: string };
}) {
  return <HubTournamentsPage hub="hockey" searchParams={searchParams} />;
}
