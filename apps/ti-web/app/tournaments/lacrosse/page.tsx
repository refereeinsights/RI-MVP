import { HubTournamentsPage, getHubMetadata } from "../hubs/HubTournamentsPage";

export const revalidate = 300;
export const metadata = getHubMetadata("lacrosse");

export default async function LacrosseHubPage({
  searchParams,
}: {
  searchParams?: { q?: string; state?: string | string[]; month?: string; includePast?: string };
}) {
  return <HubTournamentsPage hub="lacrosse" searchParams={searchParams} />;
}
