import Link from "next/link";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminNav from "@/components/admin/AdminNav";

type VenueRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  created_at?: string | null;
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
            gridTemplateColumns: "2fr 1fr 1.5fr 1fr",
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
                gridTemplateColumns: "2fr 1fr 1.5fr 1fr",
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
