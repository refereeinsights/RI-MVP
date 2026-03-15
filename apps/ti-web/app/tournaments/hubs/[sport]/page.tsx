import { notFound } from "next/navigation";
import { HubTournamentsPage, getHubMetadata } from "../HubTournamentsPage";
import { HUBS, type HubKey } from "../config";

export async function generateMetadata({ params }: { params: { sport: string } }) {
  const hub = params.sport as HubKey;
  if (!HUBS[hub]) return {};
  return getHubMetadata(hub);
}

export default async function HubSportPage({
  params,
  searchParams,
}: {
  params: { sport: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const hub = params.sport as HubKey;
  if (!HUBS[hub]) return notFound();
  return HubTournamentsPage({ hub, searchParams });
}
