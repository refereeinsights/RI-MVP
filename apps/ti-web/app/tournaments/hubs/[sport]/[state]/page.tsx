import { notFound } from "next/navigation";
import { HubTournamentsPage, getHubMetadata } from "../../HubTournamentsPage";
import { HUBS, type HubKey } from "../../config";
import { mapStateSlugToCode } from "@/lib/seoHub";

export async function generateMetadata({ params }: { params: { sport: string; state: string } }) {
  const hub = params.sport as HubKey;
  if (!HUBS[hub]) return {};
  return { ...getHubMetadata(hub), robots: { index: false, follow: false } };
}

export default async function HubSportStatePage({
  params,
  searchParams,
}: {
  params: { sport: string; state: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const hub = params.sport as HubKey;
  if (!HUBS[hub]) return notFound();
  const stateCode = mapStateSlugToCode(params.state) ?? params.state?.toUpperCase();
  const combinedSearch = { ...searchParams, state: stateCode };
  return HubTournamentsPage({ hub, searchParams: combinedSearch });
}
