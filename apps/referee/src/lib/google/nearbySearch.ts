type NearbyResult = {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types?: string[];
  primaryType?: string;
};

import { readFile } from "node:fs/promises";

type NearbyOptions = {
  lat: number;
  lng: number;
  radiusMeters: number;
  type: "restaurant" | "cafe" | "lodging";
  apiKey: string;
  maxResultCount?: number;
  forceTextSearch?: boolean;
};

const REQUEST_TIMEOUT_MS = 6000;

export async function fetchNearbyPlaces(opts: NearbyOptions): Promise<NearbyResult[]> {
  const { lat, lng, radiusMeters, type, apiKey, maxResultCount = 20, forceTextSearch = false } = opts;
  const safeMaxResultCount = Math.max(1, Math.min(20, Math.floor(maxResultCount || 20)));
  const endpoint = "https://places.googleapis.com/v1/places:searchNearby";
  const fieldMask =
    "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types";
  const includedTypes =
    type === "cafe"
      ? ["cafe", "coffee_shop"]
      : type === "lodging"
      ? ["lodging", "hotel"]
      : [type];

  const mapPlaces = (places: any[] | undefined): NearbyResult[] =>
    (places ?? [])
      .map((p) => {
        const placeId = p.id || (p.name ? p.name.split("/").pop() || "" : "");
        const name = p.displayName?.text || "";
        const latVal = p.location?.latitude;
        const lngVal = p.location?.longitude;
        if (!placeId || !name || typeof latVal !== "number" || typeof lngVal !== "number") return null;
        const address = p.formattedAddress || "";
        return {
          place_id: placeId,
          name,
          address,
          lat: latVal,
          lng: lngVal,
          types: Array.isArray(p.types) ? p.types.filter((v: unknown) => typeof v === "string") : [],
          primaryType: typeof p.primaryType === "string" ? p.primaryType : undefined,
        } as NearbyResult;
      })
      .filter(Boolean) as NearbyResult[];

  const fixturePath = process.env.OWLSEYE_PLACES_FIXTURE;
  try {
    if (fixturePath) {
      const raw = await readFile(fixturePath, "utf8");
      const parsed = JSON.parse(raw) as { places?: any[] };
      const mapped = mapPlaces(parsed.places);
      console.log("[owlseye] Places API (new) using fixture", {
        path: fixturePath,
        count: mapped.length,
        sample: mapped[0] ? { name: mapped[0].name, address: mapped[0].address } : null,
      });
      return mapped;
    }
  } catch (err) {
    console.warn("[owlseye] Failed to read fixture; falling back to API", err);
  }

  const runTextFallback = async () => {
    const textResp = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify({
        textQuery: type === "lodging" ? "hotels" : type,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radiusMeters,
          },
        },
        maxResultCount: safeMaxResultCount,
        rankPreference: "DISTANCE",
      }),
    });
    if (!textResp.ok) {
      const message = await textResp.text();
      console.error("[owlseye] Text search fallback failed HTTP", textResp.status, message);
      return [] as NearbyResult[];
    }
    const textJson = (await textResp.json()) as { places?: any[]; error?: { message?: string } };
    if (textJson.error?.message) {
      console.warn("[owlseye] Text search fallback status", textJson.error.message);
    }
    const fallbackMapped = mapPlaces(textJson.places);
    if (fallbackMapped.length > 0) {
      const sample = fallbackMapped[0];
      console.log("[owlseye] Places API text fallback results", {
        count: fallbackMapped.length,
        sample: { name: sample.name, address: sample.address },
      });
    } else {
      console.log("[owlseye] Places API text fallback results empty");
    }
    return fallbackMapped;
  };

  if (forceTextSearch) {
    try {
      return await runTextFallback();
    } catch (err) {
      console.error("[owlseye] Forced text fallback failed", err);
      return [];
    }
  }

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);

  try {
    const body = {
      maxResultCount: safeMaxResultCount,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
      includedTypes,
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
    if (!resp.ok) {
      const message = await resp.text();
      console.error("[owlseye] Nearby search failed HTTP", resp.status, message);
      return [];
    }

    const json = (await resp.json()) as {
      places?: Array<{
        id?: string;
        name?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        primaryType?: string;
        types?: string[];
      }>;
      error?: { message?: string };
    };

    if (json.error?.message) {
      console.warn("[owlseye] Nearby search status", json.error.message);
    }

    const mapped = mapPlaces(json.places);

    if (mapped.length > 0) {
      const sample = mapped[0];
      console.log("[owlseye] Places API (new) nearby results", {
        count: mapped.length,
        sample: { name: sample.name, address: sample.address },
      });
    } else if (type !== "lodging") {
      console.log("[owlseye] Places API (new) nearby results empty");
    } else {
      // Fallback for lodging: nearby endpoint can return sparse/empty in some areas.
      return await runTextFallback();
    }

    return mapped;
  } catch (err) {
    console.error("[owlseye] Nearby search error", err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export default fetchNearbyPlaces;
