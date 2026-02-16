import Link from "next/link";

import AdminNav from "@/components/admin/AdminNav";
import VenueEditForm from "@/components/admin/VenueEditForm";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export default async function AdminVenueEditPage({ params }: { params: { id: string } }) {
  await requireAdmin();

  const { data, error } = await supabaseAdmin
    .from("venues" as any)
    .select(
      `
        *,
        tournament_venues(
          tournaments(id,name,slug,sport,start_date,end_date)
        )
      `
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    throw error;
  }
  const venue: any = data;

  if (!venue) {
    return (
      <div style={{ padding: 24 }}>
        <AdminNav />
        <p style={{ color: "#b91c1c" }}>Venue not found.</p>
      </div>
    );
  }

  const tournaments: any[] = [];
  for (const tv of venue.tournament_venues ?? []) {
    for (const t of tv?.tournaments ?? []) {
      if (!t) continue;
      if (tournaments.find((x) => x.id === t.id)) continue;
      tournaments.push(t);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: "0 0 4px" }}>Edit Venue</h1>
          <div style={{ color: "#4b5563", fontSize: 13 }}>{venue.name || venue.id}</div>
        </div>
        <Link href="/admin/venues" style={{ fontSize: 13, color: "#2563eb" }}>
          ← Back to venues
        </Link>
      </div>
      <VenueEditForm venue={venue} tournaments={tournaments} />
    </div>
  );
}
