export type FsqPlaceCategory = {
  fsq_category_id: string;
  name: string;
};

export type FsqPlaceResult = {
  fsq_place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance_meters?: number;
  categories: FsqPlaceCategory[];
};

export async function searchFoursquarePlaces(args: {
  apiKey: string;
  apiVersion: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  categoryIds: string[];
  query?: string;
  limit?: number;
}): Promise<FsqPlaceResult[]> {
  const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 25)));
  // NOTE: Foursquare deprecated the previous `/v3/places/search` endpoint (HTTP 410).
  // Use the new Places API host.
  const url = new URL("https://places-api.foursquare.com/places/search");
  url.searchParams.set("ll", `${args.lat},${args.lng}`);
  url.searchParams.set("radius", String(args.radiusMeters));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "DISTANCE");
  if (args.categoryIds.length > 0) url.searchParams.set("categories", args.categoryIds.join(","));
  if (args.query) url.searchParams.set("query", args.query);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "X-Places-Api-Version": args.apiVersion,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FSQ HTTP ${res.status}: ${body.slice(0, 240)}`);
  }

  const json = (await res.json()) as {
    results?: Array<{
      fsq_place_id?: string;
      name?: string;
      location?: { formatted_address?: string; address?: string; locality?: string; region?: string; postcode?: string };
      latitude?: number;
      longitude?: number;
      distance?: number;
      categories?: Array<{ fsq_category_id?: string; name?: string }>;
    }>;
  };

  const results = json.results ?? [];
  return results
    .map((p) => {
      const fsqPlaceId = typeof p.fsq_place_id === "string" ? p.fsq_place_id : "";
      const name = typeof p.name === "string" ? p.name : "";
      const lat = p.latitude;
      const lng = p.longitude;
      if (!fsqPlaceId || !name || typeof lat !== "number" || typeof lng !== "number") return null;
      const address =
        typeof p.location?.formatted_address === "string"
          ? p.location.formatted_address
          : [p.location?.address, p.location?.locality, p.location?.region].filter(Boolean).join(", ");
      const categories: FsqPlaceCategory[] = (p.categories ?? [])
        .map((c) =>
          typeof c?.fsq_category_id === "string" && c?.name
            ? { fsq_category_id: String(c.fsq_category_id), name: String(c.name) }
            : null
        )
        .filter(Boolean) as FsqPlaceCategory[];
      return {
        fsq_place_id: fsqPlaceId,
        name,
        address,
        lat,
        lng,
        distance_meters: typeof p.distance === "number" ? p.distance : undefined,
        categories,
      } satisfies FsqPlaceResult;
    })
    .filter(Boolean) as FsqPlaceResult[];
}
