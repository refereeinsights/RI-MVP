import { SportHubPage, getSportHubMetadata } from "../_components/SportHubPage";

export const revalidate = 21600;
export const metadata = getSportHubMetadata("soccer");

export default async function SoccerHubPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const page = Math.max(1, Number.parseInt(searchParams?.page ?? "1", 10) || 1);
  return <SportHubPage sport="soccer" page={page} />;
}
