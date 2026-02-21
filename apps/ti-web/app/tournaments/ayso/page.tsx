import { HubTournamentsPage, getHubMetadata } from "../hubs/HubTournamentsPage";

export const revalidate = 300;
export const metadata = getHubMetadata("ayso");

export default async function AysoHubPage({
  searchParams,
}: {
  searchParams?: { q?: string; state?: string | string[]; month?: string; includePast?: string };
}) {
  return <HubTournamentsPage hub="ayso" searchParams={searchParams} />;
}
