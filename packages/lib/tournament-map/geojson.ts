import { normalizeLngLat } from "./coordinates";
import type { TournamentMapFeatureProperties, TournamentMapItem } from "./types";

type PointGeometry = {
  type: "Point";
  coordinates: [number, number];
};

type MapFeature = {
  type: "Feature";
  id: string;
  geometry: PointGeometry;
  properties: TournamentMapFeatureProperties;
};

type MapFeatureCollection = {
  type: "FeatureCollection";
  features: MapFeature[];
};

export function buildTournamentMapFeatureCollection(items: TournamentMapItem[]) {
  const features = items
    .map<MapFeature | null>((item) => {
      const coordinates = normalizeLngLat(item.venue?.latitude, item.venue?.longitude);
      if (!coordinates) return null;

      return {
        type: "Feature",
        id: item.id,
        geometry: {
          type: "Point",
          coordinates: [coordinates.lng, coordinates.lat],
        },
        properties: {
          id: item.id,
          tournamentId: item.tournamentId,
          tournamentSlug: item.tournamentSlug,
          tournamentName: item.tournamentName,
          sport: item.sport,
          city: item.city,
          state: item.state,
          venueId: item.venue?.id ?? null,
          venueSlug: item.venue?.slug ?? null,
          venueName: item.venue?.name ?? null,
        },
      };
    })
    .filter((feature): feature is MapFeature => Boolean(feature));

  return {
    type: "FeatureCollection",
    features,
  } satisfies MapFeatureCollection;
}
