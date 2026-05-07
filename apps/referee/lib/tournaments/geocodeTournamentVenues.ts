import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geocodeAddressMapbox } from "@/lib/mapbox/geocodeAddress";

/**
 * Geocodes all confirmed venues linked to a tournament that have no coordinates.
 * Updates each venue in-place and writes the primary venue's coords to the
 * tournament (coalesce only — won't overwrite existing tournament coords).
 * Returns the number of venues newly geocoded.
 */
export async function geocodeTournamentVenues(tournamentId: string, mapboxToken: string): Promise<number> {
  const { data: links } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select("venue_id, is_primary, venues(id, address, city, state, zip, latitude, longitude)")
    .eq("tournament_id", tournamentId)
    .eq("is_inferred", false);

  if (!links?.length) return 0;

  let geocodedCount = 0;
  let primaryCoords: { lat: number; lng: number } | null = null;

  // Sort primary venue first so tournament coords come from primary
  const sorted = [...(links as any[])].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));

  for (const link of sorted) {
    const venue = (link as any).venues;
    if (!venue) continue;

    const existingLat = Number(venue.latitude ?? NaN);
    const existingLng = Number(venue.longitude ?? NaN);
    if (Number.isFinite(existingLat) && Number.isFinite(existingLng)) {
      if ((link as any).is_primary && primaryCoords === null) {
        primaryCoords = { lat: existingLat, lng: existingLng };
      }
      continue;
    }

    const parts = [venue.address, venue.city, venue.state, venue.zip].filter(Boolean) as string[];
    if (parts.length < 2) continue;

    const geo = await geocodeAddressMapbox(parts.join(", "), mapboxToken, { expectedState: venue.state });
    if (!geo) continue;

    await (supabaseAdmin.from("venues" as any) as any)
      .update({ latitude: geo.lat, longitude: geo.lng, geocode_source: "mapbox" })
      .eq("id", venue.id);

    geocodedCount++;

    if ((link as any).is_primary && primaryCoords === null) {
      primaryCoords = { lat: geo.lat, lng: geo.lng };
    }
  }

  // Write primary venue coords to tournament only if tournament has none yet
  if (primaryCoords) {
    await (supabaseAdmin.from("tournaments" as any) as any)
      .update({
        latitude: primaryCoords.lat,
        longitude: primaryCoords.lng,
        geo_source: "venue_import",
        geo_updated_at: new Date().toISOString(),
      })
      .eq("id", tournamentId)
      .is("latitude", null);
  }

  return geocodedCount;
}
