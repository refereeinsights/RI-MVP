export type VenuePoiHints = {
  source: "osm_overpass_v1";
  radiusMeters: number;
  counts: Record<string, number>;
  items: Array<{
    kind: string;
    name?: string | null;
    lat: number;
    lon: number;
    tags?: Record<string, string> | null;
  }>;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function buildOverpassQuery(params: { lat: number; lon: number; radiusMeters: number }) {
  const r = Math.round(clamp(params.radiusMeters, 50, 2000));
  const lat = params.lat;
  const lon = params.lon;

  // POI kinds we care about (hints only; not used for drawing in v1).
  // We query nodes/ways/relations via nwr, then ask for center points for ways/relations.
  const kinds: Array<{ kind: string; filter: string }> = [
    { kind: "toilets", filter: '["amenity"="toilets"]' },
    { kind: "parking", filter: '["amenity"="parking"]' },
    { kind: "drinking_water", filter: '["amenity"="drinking_water"]' },
    { kind: "restaurant", filter: '["amenity"="restaurant"]' },
    { kind: "cafe", filter: '["amenity"="cafe"]' },
    { kind: "fast_food", filter: '["amenity"="fast_food"]' },
    { kind: "concession", filter: '["amenity"="concession_stand"]' },
    { kind: "shelter", filter: '["amenity"="shelter"]' },
    { kind: "playground", filter: '["leisure"="playground"]' },
    { kind: "sports_centre", filter: '["leisure"="sports_centre"]' },
  ];

  const blocks = kinds
    .map((k) => `nwr${k.filter}(around:${r},${lat},${lon});`)
    .join("\n  ");

  // out center gives lat/lon for ways/relations.
  return `[out:json][timeout:25];
(
  ${blocks}
);
out center tags;`;
}

function classifyKind(tags: Record<string, string> | null) {
  if (!tags) return "unknown";
  const amenity = (tags.amenity ?? "").toLowerCase();
  const leisure = (tags.leisure ?? "").toLowerCase();
  if (amenity === "toilets") return "toilets";
  if (amenity === "parking") return "parking";
  if (amenity === "drinking_water") return "drinking_water";
  if (amenity === "restaurant") return "restaurant";
  if (amenity === "cafe") return "cafe";
  if (amenity === "fast_food") return "fast_food";
  if (amenity === "concession_stand") return "concession";
  if (amenity === "shelter") return "shelter";
  if (leisure === "playground") return "playground";
  if (leisure === "sports_centre") return "sports_centre";
  return "other";
}

export async function fetchVenuePoiHints(params: { lat: number; lon: number; radiusMeters?: number }) {
  const radiusMeters = params.radiusMeters ?? 600;
  const query = buildOverpassQuery({ lat: params.lat, lon: params.lon, radiusMeters });

  // Overpass prefers POST for larger queries; use a stable public endpoint.
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }).toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`overpass_http_${res.status}`);
  }

  const json = (await res.json()) as any;
  const elements = Array.isArray(json?.elements) ? json.elements : [];

  const items: VenuePoiHints["items"] = [];
  const counts: Record<string, number> = {};

  for (const el of elements) {
    const tags = (el?.tags ?? null) as Record<string, string> | null;
    const kind = classifyKind(tags);
    const lat = Number(el?.lat ?? el?.center?.lat);
    const lon = Number(el?.lon ?? el?.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    counts[kind] = (counts[kind] ?? 0) + 1;
    items.push({
      kind,
      name: (tags?.name ?? null) as string | null,
      lat,
      lon,
      tags,
    });
  }

  const out: VenuePoiHints = {
    source: "osm_overpass_v1",
    radiusMeters,
    counts,
    items,
  };

  return out;
}

