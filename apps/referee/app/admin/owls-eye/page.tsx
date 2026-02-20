import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import OwlsEyePanel from "./OwlsEyePanel";

export const runtime = "nodejs";

type ReadyVenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  address1?: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
};

export default async function OwlsEyeAdminPage({ searchParams }: { searchParams?: { venueId?: string } }) {
  await requireAdmin();
  const adminToken = process.env.NEXT_PUBLIC_OWLS_EYE_ADMIN_TOKEN ?? process.env.OWLS_EYE_ADMIN_TOKEN ?? "";
  const venueId = searchParams?.venueId ?? "";
  const { data: readyVenuesRaw } = await supabaseAdmin
    .from("venues" as any)
    .select("id,name,address,address1,city,state,zip,latitude,longitude")
    .not("name", "is", null)
    .order("state", { ascending: true })
    .order("city", { ascending: true })
    .order("name", { ascending: true })
    .limit(1200);

  const readyCandidates = ((readyVenuesRaw ?? []) as ReadyVenueRow[]).filter((venue) => {
    const hasAddress = Boolean((venue.address1 ?? venue.address ?? "").trim()) && Boolean((venue.city ?? "").trim()) && Boolean((venue.state ?? "").trim());
    const hasGeo = typeof venue.latitude === "number" && Number.isFinite(venue.latitude) && typeof venue.longitude === "number" && Number.isFinite(venue.longitude);
    return hasAddress || hasGeo;
  });
  const venueIds = readyCandidates.map((v) => v.id).filter(Boolean);
  let runVenueIds = new Set<string>();
  if (venueIds.length) {
    const { data: runs } = await supabaseAdmin
      .from("owls_eye_runs" as any)
      .select("venue_id")
      .in("venue_id", venueIds);
    runVenueIds = new Set(((runs ?? []) as Array<{ venue_id: string | null }>).map((r) => r.venue_id || "").filter(Boolean));
  }
  const readyNotRunVenues = readyCandidates
    .filter((venue) => !runVenueIds.has(venue.id))
    .sort((a, b) => {
      const aAddress = (a.address ?? "").toLowerCase();
      const bAddress = (b.address ?? "").toLowerCase();
      if (aAddress !== bAddress) return aAddress.localeCompare(bAddress);
      const aCity = (a.city ?? "").toLowerCase();
      const bCity = (b.city ?? "").toLowerCase();
      if (aCity !== bCity) return aCity.localeCompare(bCity);
      const aState = (a.state ?? "").toLowerCase();
      const bState = (b.state ?? "").toLowerCase();
      if (aState !== bState) return aState.localeCompare(bState);
      return (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase());
    })
    .slice(0, 120);

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <OwlsEyePanel
        embedded
        adminToken={adminToken || undefined}
        initialVenueId={venueId || undefined}
        readyNotRunVenues={readyNotRunVenues.map((venue) => ({
          venue_id: venue.id,
          name: venue.name,
          street: venue.address1 ?? venue.address ?? null,
          city: venue.city,
          state: venue.state,
          zip: venue.zip,
          sport: null,
        }))}
      />
    </div>
  );
}
