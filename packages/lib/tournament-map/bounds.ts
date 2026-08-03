import type { TournamentMapItem } from "./types";
import { normalizeLngLat } from "./coordinates";

export type MapBounds = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export function calculateMapBounds(items: TournamentMapItem[]) {
  const coords = items
    .map((item) => normalizeLngLat(item.venue?.latitude, item.venue?.longitude))
    .filter((value): value is { lat: number; lng: number } => Boolean(value));

  if (!coords.length) return null;

  return coords.reduce<MapBounds>(
    (acc, coord) => ({
      minLng: Math.min(acc.minLng, coord.lng),
      minLat: Math.min(acc.minLat, coord.lat),
      maxLng: Math.max(acc.maxLng, coord.lng),
      maxLat: Math.max(acc.maxLat, coord.lat),
    }),
    {
      minLng: coords[0].lng,
      minLat: coords[0].lat,
      maxLng: coords[0].lng,
      maxLat: coords[0].lat,
    }
  );
}
