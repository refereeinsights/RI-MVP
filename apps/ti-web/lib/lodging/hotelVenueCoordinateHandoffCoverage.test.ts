import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("selected-venue HotelPlanner handoffs suppress city when coordinates are present", () => {
  const route = source("../../app/go/hotels/route.ts");
  assert.match(route, /city: resolveHotelPlannerCityParameter\(\{[\s\S]*hasVenueCoordinates: hasHotelPlannerLatLng/);
});

test("tournament venue surfaces continue to send the selected venue coordinates", () => {
  const map = source("../../app/tournaments/[slug]/map/TournamentVenueMapClient.tsx");
  const detail = source("../../app/tournaments/[slug]/page.tsx");

  assert.match(map, /buildHotelsHref\(\{[\s\S]*latitude: args\.venue\.latitude,[\s\S]*longitude: args\.venue\.longitude/);
  assert.match(detail, /buildHotelsHref\(\{[\s\S]*latitude: venue\.latitude,[\s\S]*longitude: venue\.longitude/);
});
