import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTournamentMapFeatureCollection,
  buildTournamentMapHref,
  buildTournamentMapSearchParams,
  calculateMapBounds,
  hasValidCoordinates,
  normalizeLngLat,
  type TournamentMapItem,
} from "./index";

const sampleItems: TournamentMapItem[] = [
  {
    id: "one",
    tournamentId: "t-1",
    tournamentSlug: "alpha",
    tournamentName: "Alpha Classic",
    sport: "soccer",
    city: "San Diego",
    state: "CA",
    startDate: "2026-08-01",
    endDate: "2026-08-03",
    venue: {
      id: "v-1",
      slug: "alpha-park",
      name: "Alpha Park",
      address: "123 Main St",
      city: "San Diego",
      state: "CA",
      latitude: 32.72,
      longitude: -117.16,
    },
  },
  {
    id: "two",
    tournamentId: "t-2",
    tournamentSlug: "beta",
    tournamentName: "Beta Cup",
    sport: "baseball",
    city: "Irvine",
    state: "CA",
    startDate: "2026-08-04",
    endDate: "2026-08-05",
    venue: {
      id: "v-2",
      slug: "beta-field",
      name: "Beta Field",
      address: "456 Center Rd",
      city: "Irvine",
      state: "CA",
      latitude: 33.68,
      longitude: -117.82,
    },
  },
  {
    id: "three",
    tournamentId: "t-3",
    tournamentSlug: "gamma",
    tournamentName: "Gamma Games",
    sport: "softball",
    city: "Phoenix",
    state: "AZ",
    startDate: "2026-08-06",
    endDate: "2026-08-07",
    venue: {
      id: "v-3",
      slug: "gamma-grounds",
      name: "Gamma Grounds",
      address: null,
      city: "Phoenix",
      state: "AZ",
      latitude: null,
      longitude: null,
    },
  },
];

test("coordinate helpers reject invalid values", () => {
  assert.equal(hasValidCoordinates(null, -117.16), false);
  assert.equal(hasValidCoordinates(95, -117.16), false);
  assert.equal(hasValidCoordinates(0, 0), false);
  assert.deepEqual(normalizeLngLat("32.72", "-117.16"), { lat: 32.72, lng: -117.16 });
});

test("bounds are calculated from valid tournament venues only", () => {
  assert.deepEqual(calculateMapBounds(sampleItems), {
    minLng: -117.82,
    minLat: 32.72,
    maxLng: -117.16,
    maxLat: 33.68,
  });
});

test("geojson skips tournaments without valid coordinates", () => {
  const featureCollection = buildTournamentMapFeatureCollection(sampleItems);
  assert.equal(featureCollection.features.length, 2);
  assert.equal(featureCollection.features[0]?.properties.tournamentSlug, "alpha");
  assert.deepEqual(featureCollection.features[1]?.geometry.coordinates, [-117.82, 33.68]);
});

test("map href builder preserves stable filter query params", () => {
  const params = buildTournamentMapSearchParams({
    q: "cup",
    state: ["ca", "az"],
    month: "2026-08",
    sports: ["soccer"],
    reviewed: true,
    includePast: false,
    city: "San Diego",
    sourcePage: "directory",
  });

  assert.equal(
    params.toString(),
    "q=cup&month=2026-08&city=San+Diego&reviewed=true&includePast=false&sourcePage=directory&state=CA&state=AZ&sports=soccer"
  );
  assert.equal(
    buildTournamentMapHref("/tournaments/map", {
      q: "cup",
      state: ["ca"],
      sports: ["soccer"],
      reviewed: true,
      includePast: false,
    }),
    "/tournaments/map?q=cup&reviewed=true&includePast=false&state=CA&sports=soccer"
  );
});
