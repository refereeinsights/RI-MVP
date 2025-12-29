type NearbyResult = {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

import { readFile } from "node:fs/promises";

type NearbyOptions = {
  lat: number;
  lng: number;
  radiusMeters: number;
  type: "restaurant" | "cafe";
  apiKey: string;
};

export async function fetchNearbyPlaces(opts: NearbyOptions): Promise<NearbyResult[]> {
  const { lat, lng, radiusMeters, type, apiKey } = opts;
  const endpoint = "https://places.googleapis.com/v1/places:searchNearby";
  const fieldMask = "places.id,places.displayName,places.formattedAddress,places.location";

  const mapPlaces = (places: any[] | undefined, filterType?: "restaurant" | "cafe"): NearbyResult[] =>
    (places ?? [])
      .map((p) => {
        const placeTypes: string[] = Array.isArray((p as any).types) ? (p as any).types : [];
        const primaryType: string | undefined = (p as any).primaryType;
        if (filterType) {
          const matchesPrimary = primaryType ? primaryType.includes(filterType) : false;
          const matchesTypes = placeTypes.some((t) => t.includes(filterType));
          if (!matchesPrimary && !matchesTypes) {
            return null;
          }
        }
        const placeId = p.id || (p.name ? p.name.split("/").pop() || "" : "");
        const name = p.displayName?.text || "";
        const latVal = p.location?.latitude;
        const lngVal = p.location?.longitude;
        if (!placeId || !name || typeof latVal !== "number" || typeof lngVal !== "number") return null;
        const address = p.formattedAddress || "";
        return { place_id: placeId, name, address, lat: latVal, lng: lngVal } as NearbyResult;
      })
      .filter(Boolean) as NearbyResult[];

  const fixturePath = process.env.OWLSEYE_PLACES_FIXTURE;
  try {
    if (fixturePath) {
      const raw = await readFile(fixturePath, "utf8");
      const parsed = JSON.parse(raw) as { places?: any[] };
      const mapped = mapPlaces(parsed.places, type);
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

  try {
    const body = {
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
      includedTypes: [type],
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
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
      }>;
      error?: { message?: string };
    };

    if (json.error?.message) {
      console.warn("[owlseye] Nearby search status", json.error.message);
    }

    const mapped = mapPlaces(json.places, type);

    if (mapped.length > 0) {
      const sample = mapped[0];
      console.log("[owlseye] Places API (new) nearby results", {
        count: mapped.length,
        sample: { name: sample.name, address: sample.address },
      });
    } else {
      console.log("[owlseye] Places API (new) nearby results empty");
    }

    return mapped;
  } catch (err) {
    console.error("[owlseye] Nearby search error", err);
    return [];
  }
}

export default fetchNearbyPlaces;
