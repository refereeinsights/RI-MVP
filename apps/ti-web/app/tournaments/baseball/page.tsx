import { HubTournamentsPage, getHubMetadata } from "../hubs/HubTournamentsPage";

export const revalidate = 300;
export const metadata = getHubMetadata("baseball");

export default async function BaseballHubPage({
  searchParams,
}: {
  searchParams?: { q?: string; state?: string | string[]; month?: string; includePast?: string };
}) {
  return <HubTournamentsPage hub="baseball" searchParams={searchParams} />;
}
