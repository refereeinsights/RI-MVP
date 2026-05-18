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
  // Optional closure hints (present on some provider responses). We never do extra
  // detail calls in Owl's Eye V1+; we only filter when the provider includes these.
  closed_bucket?: string | null;
  closed_reason?: string | null;
  status?: string | null;
  is_closed?: boolean | null;
  permanently_closed?: boolean | null;
  temporarily_closed?: boolean | null;
  // Quality signals — included by FSQ when returned; absent = null (no extra API call).
  rating?: number | null;
  popularity?: number | null;
};

export class FoursquareHttpError extends Error {
  status: number;
  bodySnippet: string;
  constructor(status: number, bodySnippet: string) {
    super(`FSQ HTTP ${status}: ${bodySnippet}`);
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

export async function searchFoursquarePlaces(args: {
  apiKey: string;
  apiVersion: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  categoryIds: string[];
  paramMode?: "fsq_category_ids" | "categories";
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
  const paramMode = args.paramMode ?? "categories";
  if (args.categoryIds.length > 0) url.searchParams.set(paramMode, args.categoryIds.join(","));
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
    throw new FoursquareHttpError(res.status, body.slice(0, 240));
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
      closed_bucket?: unknown;
      closed_reason?: unknown;
      status?: unknown;
      is_closed?: unknown;
      permanently_closed?: unknown;
      temporarily_closed?: unknown;
      rating?: unknown;
      popularity?: unknown;
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
        closed_bucket: typeof p.closed_bucket === "string" ? p.closed_bucket : null,
        closed_reason: typeof p.closed_reason === "string" ? p.closed_reason : null,
        status: typeof p.status === "string" ? p.status : null,
        is_closed: typeof p.is_closed === "boolean" ? p.is_closed : null,
        permanently_closed: typeof p.permanently_closed === "boolean" ? p.permanently_closed : null,
        temporarily_closed: typeof p.temporarily_closed === "boolean" ? p.temporarily_closed : null,
        rating: typeof p.rating === "number" ? p.rating : null,
        popularity: typeof p.popularity === "number" ? p.popularity : null,
      } satisfies FsqPlaceResult;
    })
    .filter(Boolean) as FsqPlaceResult[];
}
