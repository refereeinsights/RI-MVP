import Link from "next/link";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminNav from "@/components/admin/AdminNav";
import PublicMapUrlRow from "@/components/admin/PublicMapUrlRow";

type VenueRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  created_at?: string | null;
  map_url?: string | null;
};

export const runtime = "nodejs";

export default async function AdminVenuesPage() {
  await requireAdmin();

  const { data, error } = await supabaseAdmin
    .from("venues" as any)
    .select("id,name,city,state,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  const venues: VenueRow[] = Array.isArray(data) ? (data as VenueRow[]) : [];

  if (venues.length > 0) {
    const venueIds = venues.map((v) => v.id);
    const { data: maps } = await supabaseAdmin
      .from("owls_eye_map_artifacts" as any)
      .select("venue_id,url,created_at")
      .in("venue_id", venueIds)
      .order("created_at", { ascending: false });

    const latestMapByVenue: Record<string, string> = {};
    for (const row of maps ?? []) {
      const vid = (row as any)?.venue_id;
      const url = (row as any)?.url;
      if (vid && url && !latestMapByVenue[vid]) {
        latestMapByVenue[vid] = url;
      }
    }
    venues.forEach((v) => {
      v.map_url = latestMapByVenue[v.id] ?? null;
    });
  }

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Venues</h1>
          <p style={{ margin: "4px 0 0", color: "#4b5563" }}>Last 50 venues (newest first)</p>
        </div>
        <Link
          href="/admin/venues/new"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "#111827",
            color: "white",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          New Venue
        </Link>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1.5fr 1.5fr",
            background: "#f9fafb",
            fontWeight: 700,
            fontSize: 13,
            padding: "10px 12px",
            gap: 8,
          }}
        >
          <div>Name</div>
          <div>City / State</div>
          <div>UUID</div>
          <div>Actions</div>
        </div>
        {venues.length === 0 ? (
          <div style={{ padding: 12, color: "#6b7280", fontSize: 14 }}>No venues found.</div>
        ) : (
          venues.map((v, idx) => (
            <div
              key={v.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1.5fr 1.5fr",
                padding: "10px 12px",
                gap: 8,
                borderTop: "1px solid #f1f5f9",
                background: idx % 2 === 0 ? "white" : "#fcfdff",
                alignItems: "center",
              }}
            >
              <div>{v.name || "Untitled"}</div>
              <div>
                {v.city || "—"}, {v.state || "—"}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 12, overflowWrap: "anywhere" }}>{v.id}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Link
                  href={`/admin/owls-eye?venueId=${v.id}`}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: "#111827",
                    color: "white",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  Run Owl&apos;s Eye
                </Link>
                <PublicMapUrlRow venueId={v.id} compact />
                {v.map_url ? (
                  <Link
                    href={v.map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#e0f2fe",
                      textDecoration: "none",
                      fontSize: 12,
                    }}
                  >
                    View Owl&apos;s Eye Map
                  </Link>
                ) : (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>No Owl&apos;s Eye map yet</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
