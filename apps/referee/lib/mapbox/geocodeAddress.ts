import { EXTERNAL_API, EXTERNAL_API_SURFACE, trackExternalCall } from "@/lib/trackExternalCall";

type GeocodeResult = {
  lat: number;
  lng: number;
  formatted_address?: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

function isLikelyUsStateCode(state: string | null | undefined) {
  return /^[A-Z]{2}$/.test(String(state ?? "").trim().toUpperCase());
}

function parseAddressComponentsFromFeature(feature: unknown): { city: string | null; state: string | null; zip: string | null } {
  const ctx = Array.isArray((feature as any)?.context) ? (feature as any).context : [];
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;

  for (const c of ctx) {
    const id = String(c?.id ?? "");
    if (!city && (id.startsWith("place.") || id.startsWith("locality."))) {
      city = String(c.text ?? "").trim() || null;
    }
    if (!state && id.startsWith("region.")) {
      const sc = String(c.short_code ?? "").toUpperCase().split("-").pop()?.trim() || null;
      state = sc || String(c.text ?? "").trim() || null;
    }
    if (!zip && id.startsWith("postcode.")) {
      zip = String(c.text ?? "").trim() || null;
    }
  }

  return { city, state, zip };
}

function parseInferredStateFromFeature(feature: unknown) {
  const ctx = Array.isArray((feature as any)?.context) ? (feature as any).context : [];
  const region = ctx.find((c: any) => String(c.id ?? "").startsWith("region.")) ?? null;
  const inferredState =
    String(region?.short_code ?? "")
      .toUpperCase()
      .split("-")
      .pop()
      ?.trim() || null;
  return { inferredState };
}

/**
 * Forward-geocode a free-text address string using the Mapbox Geocoding API.
 * Returns {lat, lng, formatted_address} or null if the result fails validation.
 *
 * Validates US bounding box and state match when expectedState is provided.
 * Tracks the API call via trackExternalCall (mapbox / venue_geocode).
 */
export async function geocodeAddressMapbox(
  address: string,
  token: string,
  opts?: { expectedState?: string | null; country?: string }
): Promise<GeocodeResult | null> {
  const country = opts?.country ?? "us";
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("types", "address,poi,place");
  if (country) url.searchParams.set("country", country);

  let res: Response;
  try {
    res = await trackExternalCall(
      EXTERNAL_API.mapbox,
      "forward_geocode",
      EXTERNAL_API_SURFACE.venue_geocode,
      () => fetch(url.toString(), { cache: "no-store" })
    );
  } catch (err) {
    console.error("[mapbox geocode] fetch failed", err);
    return null;
  }

  if (!res.ok) {
    console.error("[mapbox geocode] request failed", res.status);
    return null;
  }

  const json = (await res.json()) as { features?: unknown[] };
  const feature = Array.isArray(json?.features) ? json.features[0] : null;
  if (!feature) return null;

  const center = Array.isArray((feature as any)?.center) ? (feature as any).center : null;
  const lng = Number(center?.[0]);
  const lat = Number(center?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return null;

  const expectedState = opts?.expectedState ?? null;
  if (isLikelyUsStateCode(expectedState)) {
    if (!(lat >= 18 && lat <= 72 && lng >= -170 && lng <= -50)) {
      console.warn("[mapbox geocode] coords outside US bbox", lat, lng);
      return null;
    }
    const { inferredState } = parseInferredStateFromFeature(feature);
    if (expectedState && inferredState && expectedState.toUpperCase() !== inferredState) {
      console.warn("[mapbox geocode] state mismatch", expectedState, inferredState);
      return null;
    }
  }

  const { city, state, zip } = parseAddressComponentsFromFeature(feature);

  return {
    lat,
    lng,
    formatted_address: String((feature as any).place_name ?? "").trim() || undefined,
    city,
    state,
    zip,
  };
}
