import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { getSearchProviderName } from "@/server/atlas/search";
import { SPORT_OPTIONS, US_STATES } from "@/server/admin/discoverToQueue";
import DiscoverToQueueClient from "./DiscoverToQueueClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DiscoverToQueuePage({
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requireAdmin();

  const provider = getSearchProviderName();

  return (
    <main style={{ padding: 18, maxWidth: 1100, margin: "0 auto" }}>
      <AdminNav />

      <h1 style={{ margin: "12px 0 0 0" }}>Discover → Queue</h1>
      <p style={{ margin: "6px 0 0 0", color: "#64748b", fontSize: 13 }}>
        Uses Atlas search ({provider}) to find new tournament URLs for a sport + state, then queues selected URLs into the uploads approval queue.
      </p>

      <DiscoverToQueueClient
        sportOptions={Array.from(SPORT_OPTIONS)}
        usStates={Array.from(US_STATES)}
        defaultSport="soccer"
        defaultPerQuery={8}
        defaultYears={`${new Date().getFullYear()},${new Date().getFullYear() + 1}`}
      />
    </main>
  );
}
