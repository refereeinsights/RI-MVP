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

async function fetchPlaceById(placeId: string) {
  const key = getApiKey();
  const response = await fetch(`${GOOGLE_PLACES_BASE}/places/${placeId}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "id,formattedAddress,addressComponents",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Google Places lookup failed: ${message}`);
  }

  return response.json();
}

async function searchPlacesByText(query: string, includedType?: string) {
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
      ...(includedType ? { includedType } : {}),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Google Places search failed: ${message}`);
  }

  const json = (await response.json()) as { places?: any[] };
  return json.places ?? [];
}

export async function searchSchools(query: string): Promise<PlaceSuggestion[]> {
  const places = await searchPlacesByText(query, "school");
  return places.map((place) => {
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

export async function lookupSchoolZip(input: {
  placeId?: string | null;
  name: string;
  city?: string | null;
  state?: string | null;
}) {
  const placeId = input.placeId?.trim();
  if (placeId) {
    const place = await fetchPlaceById(placeId);
    const { zip } = extractCityStateZip(place?.addressComponents ?? []);
    if (zip) return zip;
  }

  const query = [input.name, input.city, input.state].filter(Boolean).join(" ");
  if (!query.trim()) return null;
  const results = await searchSchools(query);
  const match = results.find((r) => r.zip);
  return match?.zip ?? null;
}

export async function lookupCityZip(input: { city: string; state?: string | null }) {
  const query = [input.city, input.state].filter(Boolean).join(", ");
  if (!query.trim()) return null;
  const places = await searchPlacesByText(query, "locality");
  const place = places[0];
  if (!place?.id) return null;
  const details = await fetchPlaceById(place.id);
  const { zip } = extractCityStateZip(details?.addressComponents ?? []);
  if (zip) return zip;
  return fallbackCityZip(input.city, input.state);
}

const CITY_ZIP_FALLBACKS: Record<string, string> = {
  "los gatos|CA": "95030",
};

function fallbackCityZip(city: string, state?: string | null) {
  const key = `${String(city).trim().toLowerCase()}|${String(state ?? "").trim().toUpperCase()}`;
  return CITY_ZIP_FALLBACKS[key] ?? null;
}
