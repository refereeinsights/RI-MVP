export type VenuePitchCenterResult = {
  ok: boolean;
  pitchCount: number;
  center?: { lat: number; lng: number };
  bbox?: { minLat: number; minLng: number; maxLat: number; maxLng: number };
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function buildOverpassPitchQuery(params: { lat: number; lon: number; radiusMeters: number }) {
  const r = Math.round(clamp(params.radiusMeters, 100, 6000));
  const lat = params.lat;
  const lon = params.lon;

  // Pull sports fields when mapped as pitches / recreation grounds / sports centres.
  // We request "center" for ways/relations.
  return `[out:json][timeout:25];
(
  nwr["leisure"="pitch"](around:${r},${lat},${lon});
  nwr["landuse"="recreation_ground"](around:${r},${lat},${lon});
  nwr["leisure"="sports_centre"](around:${r},${lat},${lon});
);
out center tags;`;
}

function computeZoomFromBbox(params: { bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number }; fallback: number }) {
  const { bbox, fallback } = params;
  const dLat = Math.abs(bbox.maxLat - bbox.minLat);
  const dLng = Math.abs(bbox.maxLng - bbox.minLng);
  const span = Math.max(dLat, dLng);

  // Very rough heuristic:
  // - span ~0.002 deg (~200m): zoom 17
  // - span ~0.006 deg (~600m): zoom 16
  // - span ~0.015 deg (~1.5km): zoom 15
  // - span ~0.03 deg (~3km): zoom 14
  if (span <= 0.002) return 17;
  if (span <= 0.006) return 16;
  if (span <= 0.015) return 15;
  if (span <= 0.03) return 14;
  return Math.max(12, Math.min(18, fallback - 1));
}

export async function fetchVenuePitchCenter(params: { lat: number; lon: number; radiusMeters?: number }) {
  const radiusMeters = params.radiusMeters ?? 2200;
  const query = buildOverpassPitchQuery({ lat: params.lat, lon: params.lon, radiusMeters });

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }).toString(),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`overpass_http_${res.status}`);

  const json = (await res.json()) as any;
  const elements = Array.isArray(json?.elements) ? json.elements : [];

  let pitchCount = 0;
  let sumLat = 0;
  let sumLng = 0;

  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;

  for (const el of elements) {
    const lat = Number(el?.lat ?? el?.center?.lat);
    const lon = Number(el?.lon ?? el?.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    pitchCount += 1;
    sumLat += lat;
    sumLng += lon;
    minLat = Math.min(minLat, lat);
    minLng = Math.min(minLng, lon);
    maxLat = Math.max(maxLat, lat);
    maxLng = Math.max(maxLng, lon);
  }

  if (!pitchCount) return { ok: true, pitchCount: 0 } as VenuePitchCenterResult;

  const center = { lat: sumLat / pitchCount, lng: sumLng / pitchCount };
  const bbox = { minLat, minLng, maxLat, maxLng };
  return { ok: true, pitchCount, center, bbox } as VenuePitchCenterResult;
}

export function recommendZoomFromPitchBbox(params: {
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null;
  fallbackZoom: number;
}) {
  if (!params.bbox) return params.fallbackZoom;
  return computeZoomFromBbox({ bbox: params.bbox, fallback: params.fallbackZoom });
}

