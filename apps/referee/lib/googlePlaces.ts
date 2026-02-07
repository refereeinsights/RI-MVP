const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.location",
  "places.addressComponents",
].join(",");

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

export type PlaceSuggestion = {
  placeId: string;
  name: string;
  formattedAddress: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
};

function getApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY");
  }
  return key;
}

function extractCityStateZip(components: AddressComponent[] = []) {
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;

  for (const component of components) {
    if (!component?.types) continue;
    if (component.types.includes("locality") || component.types.includes("postal_town")) {
      city = component.longText ?? component.shortText ?? city;
    }
    if (component.types.includes("administrative_area_level_1")) {
      state = component.shortText ?? component.longText ?? state;
    }
    if (component.types.includes("postal_code")) {
      zip = component.longText ?? component.shortText ?? zip;
    }
  }
  return { city, state, zip };
}

export async function searchSchools(query: string): Promise<PlaceSuggestion[]> {
  const key = getApiKey();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const response = await fetch(`${GOOGLE_PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: trimmed,
      languageCode: "en",
      includedType: "school",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Google Places search failed: ${message}`);
  }

  const json = (await response.json()) as { places?: any[] };
  return (json.places ?? []).map((place) => {
    const { city, state, zip } = extractCityStateZip(place?.addressComponents ?? []);
    return {
      placeId: place?.id ?? "",
      name: place?.displayName?.text ?? place?.displayName ?? "Unknown school",
      formattedAddress: place?.formattedAddress ?? place?.shortFormattedAddress ?? "",
      city: city ?? null,
      state: state ?? null,
      zip: zip ?? null,
      latitude: place?.location?.latitude ?? null,
      longitude: place?.location?.longitude ?? null,
    } as PlaceSuggestion;
  });
}
