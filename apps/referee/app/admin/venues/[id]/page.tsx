import Link from "next/link";

import AdminNav from "@/components/admin/AdminNav";
import VenueEditForm from "@/components/admin/VenueEditForm";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export default async function AdminVenueEditPage({ params }: { params: { id: string } }) {
  await requireAdmin();

  let errorMessage: string | null = null;
  const errorDetails: string[] = [];
  let venue: any = null;
  try {
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
      console.error("[admin/venues/[id]] fetch with tournaments failed, retrying without join", error);
      errorMessage = "Failed to load venue with tournaments.";
      errorDetails.push(error.message || String(error));
    } else {
      venue = data;
    }
  } catch (err) {
    console.error("[admin/venues/[id]] fetch error", err);
    errorMessage = "Failed to load venue.";
    errorDetails.push(err instanceof Error ? err.message : String(err));
  }

  if (!venue) {
    try {
      const { data, error } = await supabaseAdmin.from("venues" as any).select("*").eq("id", params.id).maybeSingle();
      if (error) {
        console.error("[admin/venues/[id]] fallback fetch failed", error);
        errorMessage = "Fallback fetch failed.";
        errorDetails.push(error.message || String(error));
      } else {
        venue = data;
      }
    } catch (err) {
      console.error("[admin/venues/[id]] fallback error", err);
      errorMessage = "Fallback fetch error.";
        errorDetails.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (!venue) {
    return (
      <div style={{ padding: 24 }}>
        <AdminNav />
        <p style={{ color: "#b91c1c" }}>Venue not found or failed to load.</p>
        {errorMessage && <p style={{ color: "#6b7280" }}>{errorMessage}</p>}
        {errorDetails.length > 0 && (
          <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "#fff7ed", color: "#b45309" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Details</div>
            <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13 }}>
              {errorDetails.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const tournaments: any[] = [];
  const venueTournaments = Array.isArray(venue.tournament_venues) ? venue.tournament_venues : [];
  for (const tv of venueTournaments) {
    const list = Array.isArray(tv?.tournaments) ? tv.tournaments : [];
    for (const t of list) {
      if (!t) continue;
      if (tournaments.find((x) => x.id === t.id)) continue;
      tournaments.push(t);
    }
  }

  let owlNearby: Array<{
    id: string;
    run_id: string;
    place_id: string | null;
    name: string | null;
    category: string | null;
    address: string | null;
    maps_url: string | null;
    distance_meters: number | null;
    is_sponsor: boolean | null;
    sponsor_click_url: string | null;
    created_at: string | null;
  }> = [];

  try {
    const primaryRun = await supabaseAdmin
      .from("owls_eye_runs" as any)
      .select("id,run_id,updated_at,created_at")
      .eq("venue_id", params.id)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const fallbackRun =
      primaryRun.error && (primaryRun.error.code === "42703" || primaryRun.error.code === "PGRST204")
        ? await supabaseAdmin
            .from("owls_eye_runs" as any)
            .select("id,run_id,created_at")
            .eq("venue_id", params.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : null;

    const runRow = (primaryRun.error ? fallbackRun?.data : primaryRun.data) as any;
    const runId = runRow?.run_id ?? runRow?.id;
    if (runId) {
      const nearbyResp = await supabaseAdmin
        .from("owls_eye_nearby_food" as any)
        .select("id,run_id,place_id,name,category,address,maps_url,distance_meters,is_sponsor,sponsor_click_url,created_at")
        .eq("run_id", runId)
        .order("is_sponsor", { ascending: false })
        .order("distance_meters", { ascending: true })
        .order("name", { ascending: true });
      if (!nearbyResp.error && Array.isArray(nearbyResp.data)) {
        owlNearby = nearbyResp.data as typeof owlNearby;
      }
    }
  } catch {
    // Keep venue page usable even if owl tables are missing/inaccessible.
  }

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: "0 0 4px" }}>Edit Venue</h1>
          <div style={{ color: "#4b5563", fontSize: 13 }}>{venue.name || "Unnamed venue"}</div>
          {typeof venue.venue_url === "string" && venue.venue_url.trim() ? (
            <a
              href={venue.venue_url}
              target="_blank"
              rel="noreferrer"
              style={{ display: "inline-block", marginTop: 4, fontSize: 13, color: "#2563eb" }}
            >
              {venue.venue_url}
            </a>
          ) : null}
          <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>Venue ID: {venue.id}</div>
        </div>
        <Link href="/admin/venues" style={{ fontSize: 13, color: "#2563eb" }}>
          ← Back to venues
        </Link>
      </div>
      <VenueEditForm venue={venue} tournaments={tournaments} owlNearby={owlNearby} />
    </div>
  );
}
