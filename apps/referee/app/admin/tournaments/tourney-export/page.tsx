import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { SPORT_OPTIONS, US_STATES } from "@/server/admin/discoverToQueue";
import TourneyExportClient from "./TourneyExportClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TourneyExportPage() {
  await requireAdmin();

  return (
    <main style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
      <AdminNav />

      <h1 style={{ margin: "12px 0 0 0" }}>Tourney Export</h1>
      <p style={{ margin: "6px 0 0 0", color: "#64748b", fontSize: 13 }}>
        Export tournaments + venues as CSV (one row per venue link), filtered by state(s), sport(s), and an optional venue.
      </p>

      <TourneyExportClient usStates={Array.from(US_STATES)} sportOptions={Array.from(SPORT_OPTIONS)} />
    </main>
  );
}

