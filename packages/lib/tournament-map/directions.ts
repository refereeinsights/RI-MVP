import { hasValidCoordinates, normalizeCoordinate } from "./coordinates";

type DirectionsInput = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  label?: string | null;
  address?: string | null;
};

export type MapDirectionsLinks = {
  google: string;
  apple: string;
  waze: string;
  query: string;
};

function clean(value: string | null | undefined) {
  return (value ?? "").trim();
}

function encode(value: string) {
  return encodeURIComponent(value);
}

export function buildDirectionsQuery(input: DirectionsInput) {
  const label = clean(input.label);
  const address = clean(input.address);
  return [label, address].filter(Boolean).join(", ") || address || label;
}

export function buildMapDirectionsLinks(input: DirectionsInput): MapDirectionsLinks | null {
  const query = buildDirectionsQuery(input);
  if (!query) return null;

  if (hasValidCoordinates(input.latitude, input.longitude)) {
    const lat = normalizeCoordinate(input.latitude) as number;
    const lng = normalizeCoordinate(input.longitude) as number;
    const encodedQuery = encode(query);
    const encodedCoords = encode(`${lat},${lng}`);

    return {
      google: `https://www.google.com/maps/search/?api=1&query=${encodedCoords}&query_place_id=&travelmode=driving`,
      apple: `https://maps.apple.com/?ll=${lat},${lng}&q=${encodedQuery}`,
      waze: `https://waze.com/ul?ll=${lat},${lng}&q=${encodedQuery}&navigate=yes`,
      query,
    };
  }

  const encodedQuery = encode(query);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`,
    apple: `https://maps.apple.com/?q=${encodedQuery}`,
    waze: `https://waze.com/ul?q=${encodedQuery}&navigate=yes`,
    query,
  };
}
