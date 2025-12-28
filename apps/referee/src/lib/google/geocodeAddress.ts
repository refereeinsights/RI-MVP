const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

type GeocodeResult = {
  lat: number;
  lng: number;
  formatted_address?: string;
};

export async function geocodeAddress(address: string, apiKey: string): Promise<GeocodeResult | null> {
  const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) {
    console.error("[geocode] request failed", resp.status, await resp.text());
    return null;
  }
  const json = (await resp.json()) as {
    status?: string;
    results?: Array<{ geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string }>;
  };
  if (json.status !== "OK" || !json.results || json.results.length === 0) {
    console.warn("[geocode] no results", json.status);
    return null;
  }
  const loc = json.results[0]?.geometry?.location;
  if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
  return { lat: loc.lat, lng: loc.lng, formatted_address: json.results[0]?.formatted_address };
}

export default geocodeAddress;
