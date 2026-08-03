export function normalizeCoordinate(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasValidCoordinates(latitude: number | string | null | undefined, longitude: number | string | null | undefined) {
  const lat = normalizeCoordinate(latitude);
  const lng = normalizeCoordinate(longitude);

  if (lat === null || lng === null) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;

  return true;
}

export function normalizeLngLat(latitude: number | string | null | undefined, longitude: number | string | null | undefined) {
  if (!hasValidCoordinates(latitude, longitude)) return null;
  return {
    lat: normalizeCoordinate(latitude) as number,
    lng: normalizeCoordinate(longitude) as number,
  };
}
