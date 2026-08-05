import type { NearbyPlace, NearbyPlaceRow, SharedVenueNearbyCounts, SharedVenueNearbyGroups } from "./types";

function normalizedCategory(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function mapNearbyPlaceRow(row: NearbyPlaceRow): NearbyPlace {
  return {
    name: row.name,
    distance_meters: row.distance_meters,
    maps_url: row.maps_url,
    is_sponsor: Boolean(row.is_sponsor),
    sponsor_click_url: row.sponsor_click_url ?? null,
  };
}

export function groupNearbyPlaces(rows: NearbyPlaceRow[]): SharedVenueNearbyGroups {
  const groups: SharedVenueNearbyGroups = {
    food: [],
    coffee: [],
    hotels: [],
    sportingGoods: [],
  };

  for (const row of rows) {
    const category = normalizedCategory(row.category);
    const place = mapNearbyPlaceRow(row);

    if (category === "coffee") {
      groups.coffee.push(place);
      continue;
    }

    if (category === "hotel" || category === "hotels") {
      groups.hotels.push(place);
      continue;
    }

    if (category === "sporting_goods" || category === "big_box_fallback") {
      groups.sportingGoods.push(place);
      continue;
    }

    groups.food.push(place);
  }

  return groups;
}

export function buildNearbyCounts(groups: SharedVenueNearbyGroups): SharedVenueNearbyCounts {
  return {
    food: groups.food.length,
    coffee: groups.coffee.length,
    hotels: groups.hotels.length,
    sportingGoods: groups.sportingGoods.length,
  };
}
