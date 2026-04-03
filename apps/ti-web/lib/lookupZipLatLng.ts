const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1";

type PlacesSearchResponse = {
  places?: Array<{
    id?: string;
    types?: string[];
    location?: { latitude?: number; longitude?: number };
  }>;
};

function getApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  return key;
}

export async function lookupZipLatLng(zip: string): Promise<{ latitude: number; longitude: number } | null> {
  const key = getApiKey();
  if (!key) return null;
  const normalized = String(zip ?? "").trim();
  if (!/^\d{5}$/.test(normalized)) return null;

  const runQuery = async (textQuery: string) => {
    const response = await fetch(`${GOOGLE_PLACES_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.location,places.types",
      },
      body: JSON.stringify({ textQuery, languageCode: "en" }),
      cache: "no-store",
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || "ZIP lookup failed.");
    }

    const json = (await response.json().catch(() => ({}))) as PlacesSearchResponse;
    const first = (json.places ?? []).find((p) => p?.location?.latitude != null && p?.location?.longitude != null);
    if (!first?.location) return null;
    return {
      latitude: Number(first.location.latitude),
      longitude: Number(first.location.longitude),
    };
  };

  // Try ZIP alone first, then add country context.
  return (await runQuery(normalized)) ?? (await runQuery(`${normalized} USA`));
}

