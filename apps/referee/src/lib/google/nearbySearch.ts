type NearbyResult = {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

type NearbyOptions = {
  lat: number;
  lng: number;
  radiusMeters: number;
  type: "restaurant" | "cafe";
  apiKey: string;
};

export async function fetchNearbyPlaces(opts: NearbyOptions): Promise<NearbyResult[]> {
  const { lat, lng, radiusMeters, type, apiKey } = opts;
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", `${radiusMeters}`);
  url.searchParams.set("type", type);
  url.searchParams.set("key", apiKey);

  try {
    const resp = await fetch(url.toString(), { method: "GET" });
    if (!resp.ok) {
      const message = await resp.text();
      console.error("[owlseye] Nearby search failed HTTP", resp.status, message);
      return [];
    }

    const json = (await resp.json()) as {
      status?: string;
      error_message?: string;
      results?: Array<{
        place_id?: string;
        name?: string;
        vicinity?: string;
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };

    if (json.status && json.status !== "OK") {
      console.warn("[owlseye] Nearby search status", json.status, json.error_message || "");
    }

    return (json.results ?? [])
      .map((r) => {
        const placeId = r.place_id ?? "";
        const name = r.name ?? "";
        const loc = r.geometry?.location;
        const latVal = loc?.lat;
        const lngVal = loc?.lng;
        if (!placeId || !name || typeof latVal !== "number" || typeof lngVal !== "number") return null;
        const address = r.vicinity || r.formatted_address || "";
        return { place_id: placeId, name, address, lat: latVal, lng: lngVal } as NearbyResult;
      })
      .filter(Boolean) as NearbyResult[];
  } catch (err) {
    console.error("[owlseye] Nearby search error", err);
    return [];
  }
}

export default fetchNearbyPlaces;
