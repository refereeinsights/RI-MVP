import { EXTERNAL_API, EXTERNAL_API_SURFACE, trackExternalCall } from "@/lib/trackExternalCall";

type OverpassElement = {
  type?: "node" | "way" | "relation";
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};

export type OverpassPlace = {
  osm_type: "node" | "way";
  osm_id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
};

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const OVERPASS_TIMEOUT_MS = 25_000;

function buildOverpassQuery(args: { lat: number; lng: number; radiusMeters: number }) {
  const radius = Math.max(1, Math.floor(args.radiusMeters));
  const lat = args.lat;
  const lng = args.lng;

  // Keep the tag list intentionally small and predictable.
  // Note: ways need `out center` so we can compute distances consistently.
  return `
[out:json][timeout:25];
(
  node["shop"="sports"](around:${radius},${lat},${lng});
  node["shop"="outdoor"](around:${radius},${lat},${lng});
  node["shop"="soccer"](around:${radius},${lat},${lng});
  way["shop"="sports"](around:${radius},${lat},${lng});
  way["shop"="outdoor"](around:${radius},${lat},${lng});
);
out center;
`.trim();
}

function buildAddress(tags: Record<string, string>) {
  const full = tags["addr:full"];
  if (full) return full;
  const housenumber = tags["addr:housenumber"];
  const street = tags["addr:street"];
  const city = tags["addr:city"];
  const state = tags["addr:state"];
  const postcode = tags["addr:postcode"];
  const parts: string[] = [];
  const line1 = [housenumber, street].filter(Boolean).join(" ").trim();
  if (line1) parts.push(line1);
  const line2 = [city, state, postcode].filter(Boolean).join(", ").trim();
  if (line2) parts.push(line2);
  return parts.join(", ");
}

export async function searchOverpassSportingGoods(args: {
  lat: number;
  lng: number;
  radiusMeters: number;
  surface: typeof EXTERNAL_API_SURFACE.owls_eye_batch | typeof EXTERNAL_API_SURFACE.owls_eye_gear;
}): Promise<OverpassPlace[]> {
  if (!Number.isFinite(args.lat) || !Number.isFinite(args.lng)) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
  const query = buildOverpassQuery({ lat: args.lat, lng: args.lng, radiusMeters: args.radiusMeters });
  const body = new URLSearchParams({ data: query }).toString();

  try {
    const resp = await trackExternalCall(EXTERNAL_API.overpass, "radius_search", args.surface, () =>
      fetch(OVERPASS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      })
    );

    if (!resp.ok) throw new Error(`overpass_http_${resp.status}`);
    const json = (await resp.json()) as { elements?: OverpassElement[] };
    const elements = Array.isArray(json.elements) ? json.elements : [];

    const out: OverpassPlace[] = [];
    for (const el of elements) {
      const type = el.type;
      if (type !== "node" && type !== "way") continue;
      const osmId = typeof el.id === "number" ? el.id : null;
      if (!osmId) continue;
      const tagsRaw = el.tags ?? {};
      const tags: Record<string, string> = {};
      for (const [k, v] of Object.entries(tagsRaw)) {
        if (typeof v === "string" && v.trim()) tags[k] = v.trim();
      }
      const name = tags.name ?? "";
      if (!name) continue;

      const lat = typeof el.lat === "number" ? el.lat : typeof el.center?.lat === "number" ? el.center.lat : null;
      const lng = typeof el.lon === "number" ? el.lon : typeof el.center?.lon === "number" ? el.center.lon : null;
      if (typeof lat !== "number" || typeof lng !== "number") continue;

      out.push({
        osm_type: type,
        osm_id: osmId,
        name,
        address: buildAddress(tags),
        lat,
        lng,
        tags,
      });
    }

    return out;
  } finally {
    clearTimeout(timeout);
  }
}

