type LatLng = { lat: number; lng: number };

export type NearbyPlace = {
  name: string;
  address: string;
  placeId?: string;
  lat: number;
  lng: number;
};

const NEARBY_RADIUS_METERS = 2500;
const MAX_RESULTS = 5;

function getApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY");
  }
  return key;
}

export async function searchNearbyFood(center: LatLng): Promise<NearbyPlace[]> {
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
    url.searchParams.set("location", `${center.lat},${center.lng}`);
    url.searchParams.set("radius", NEARBY_RADIUS_METERS.toString());
    url.searchParams.set("type", "restaurant");
    url.searchParams.set("keyword", "food");
    url.searchParams.set("key", getApiKey());

    const res = await fetch(url.toString());
    if (!res.ok) {
      return [];
    }
    const data: any = await res.json();
    if (data.status !== "OK" || !Array.isArray(data.results)) {
      return [];
    }

    return data.results
      .map((r: any) => {
        const loc = r?.geometry?.location;
        if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") return null;
        const name = typeof r?.name === "string" ? r.name : null;
        const address =
          typeof r?.vicinity === "string" ? r.vicinity : typeof r?.formatted_address === "string" ? r.formatted_address : null;
        if (!name || !address) return null;
        return {
          name,
          address,
          placeId: typeof r?.place_id === "string" ? r.place_id : undefined,
          lat: loc.lat,
          lng: loc.lng,
        } as NearbyPlace;
      })
      .filter(Boolean)
      .slice(0, MAX_RESULTS);
  } catch {
    return [];
  }
}
