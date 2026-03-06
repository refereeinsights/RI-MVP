import { SportHubPage, getSportHubMetadata } from "../_components/SportHubPage";

export const revalidate = 21600;
export const metadata = getSportHubMetadata("baseball");

export default async function BaseballHubPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const page = Math.max(1, Number.parseInt(searchParams?.page ?? "1", 10) || 1);
  return await SportHubPage({ sport: "baseball", page });
}
