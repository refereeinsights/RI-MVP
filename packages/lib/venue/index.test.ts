import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVenueClusterCandidates,
  buildVenueAirportQuery,
  buildNearbyCounts,
  buildSharedVenueFromRow,
  bucketVenueAirportDistance,
  formatVenueAirportCode,
  formatVenueAddress,
  groupNearbyPlaces,
  hasValidVenueCoordinates,
  parseLegacyVenueAddressSlug,
  resolveSharedVenueByParam,
  selectVenueAirport,
  sortSharedVenueTournaments,
  type SharedVenueDbClient,
  type SharedVenue,
  type SharedVenueSourceRow,
} from "./index";

test("formatVenueAddress joins available parts", () => {
  assert.equal(
    formatVenueAddress({ address: "111 W Harbor Dr", city: "San Diego", state: "CA", zip: "92101" }),
    "111 W Harbor Dr, San Diego, CA, 92101"
  );
  assert.equal(formatVenueAddress({ address: null, city: null, state: null, zip: null }), null);
});

test("hasValidVenueCoordinates validates numeric lat/lng ranges", () => {
  assert.equal(hasValidVenueCoordinates(32.71, -117.16), true);
  assert.equal(hasValidVenueCoordinates(120, -117.16), false);
});

test("parseLegacyVenueAddressSlug recognizes legacy TI address slugs", () => {
  assert.deepEqual(parseLegacyVenueAddressSlug("425-woodward-st-austin-tx"), {
    state: "TX",
    number: "425",
    keyword: "woodward",
  });
  assert.equal(parseLegacyVenueAddressSlug("not-a-venue"), null);
});

test("sortSharedVenueTournaments orders future first, then past, then undated", () => {
  const sorted = sortSharedVenueTournaments(
    [
      { id: "3", slug: "past", name: "Past", sport: null, city: null, state: null, startDate: "2026-07-01", endDate: "2026-07-02" },
      { id: "2", slug: "future-b", name: "Future B", sport: null, city: null, state: null, startDate: "2026-08-09", endDate: "2026-08-10" },
      { id: "1", slug: "future-a", name: "Future A", sport: null, city: null, state: null, startDate: "2026-08-06", endDate: "2026-08-07" },
      { id: "4", slug: "undated", name: "Undated", sport: null, city: null, state: null, startDate: null, endDate: null },
    ],
    new Date("2026-08-05T12:00:00Z")
  );
  assert.deepEqual(
    sorted.map((row) => row.id),
    ["1", "2", "3", "4"]
  );
});

test("buildSharedVenueFromRow normalizes address, coordinates, tournaments, and readiness", () => {
  const sourceRow: SharedVenueSourceRow = {
    id: "venue-1",
    seo_slug: "venue-one",
    name: "Venue One",
    address: "111 W Harbor Dr",
    city: "San Diego",
    state: "CA",
    zip: "92101",
    latitude: 32.71,
    longitude: -117.16,
    notes: "Public note",
    venue_url: "https://example.com",
    sport: "basketball",
    restroom_cleanliness_avg: 4.2,
    shade_score_avg: 3.8,
    vendor_score_avg: 3.6,
    parking_convenience_score_avg: 4.1,
    review_count: 12,
    reviews_last_updated_at: "2026-08-01T00:00:00Z",
    tournament_venues: [
      { is_inferred: false, tournaments: { id: "future", slug: "future", name: "Future", sport: "basketball", city: "San Diego", state: "CA", start_date: "2026-08-10", end_date: "2026-08-12" } },
      { is_inferred: true, tournaments: { id: "skip", slug: "skip", name: "Skip", sport: "basketball", city: "San Diego", state: "CA", start_date: "2026-08-01", end_date: "2026-08-02" } },
    ],
  };

  const venue = buildSharedVenueFromRow(sourceRow, new Date("2026-08-05T12:00:00Z"));
  assert.equal(venue.routeKey, "venue-one");
  assert.equal(venue.address.formatted, "111 W Harbor Dr, San Diego, CA, 92101");
  assert.equal(venue.coordinates.valid, true);
  assert.equal(venue.tournaments.length, 1);
  assert.equal(venue.tournaments[0]?.id, "future");
  assert.equal(venue.readiness.hotelSearchReady, true);
  assert.equal(venue.readiness.hotelSearchNotReadyReason, null);
});

test("buildSharedVenueFromRow exposes hotel search not-ready reason when coordinates and city/state fallback are missing", () => {
  const sourceRow: SharedVenueSourceRow = {
    id: "venue-2",
    seo_slug: "venue-two",
    name: "Venue Two",
    address: "Unknown complex",
    city: null,
    state: null,
    zip: null,
    latitude: null,
    longitude: null,
    notes: null,
    venue_url: null,
    sport: null,
    restroom_cleanliness_avg: null,
    shade_score_avg: null,
    vendor_score_avg: null,
    parking_convenience_score_avg: null,
    review_count: null,
    reviews_last_updated_at: null,
    tournament_venues: [],
  };

  const venue = buildSharedVenueFromRow(sourceRow, new Date("2026-08-05T12:00:00Z"));
  assert.equal(venue.readiness.hotelSearchReady, false);
  assert.equal(venue.readiness.hotelSearchNotReadyReason, "no_city_state");
});

test("groupNearbyPlaces maps shared nearby rows into stable RI/TI categories", () => {
  const groups = groupNearbyPlaces([
    { run_id: "run-1", category: "coffee", name: "Cafe", distance_meters: 120, maps_url: "https://maps.example/cafe", is_sponsor: false, sponsor_click_url: null },
    { run_id: "run-1", category: "restaurant", name: "Diner", distance_meters: 240, maps_url: "https://maps.example/diner", is_sponsor: false, sponsor_click_url: null },
    { run_id: "run-1", category: "hotel", name: "Hotel", distance_meters: 500, maps_url: "https://maps.example/hotel", is_sponsor: true, sponsor_click_url: "https://sponsor.example/hotel" },
    { run_id: "run-1", category: "sporting_goods", name: "Sports Store", distance_meters: 640, maps_url: "https://maps.example/store", is_sponsor: false, sponsor_click_url: null },
    { run_id: "run-1", category: "big_box_fallback", name: "Big Box", distance_meters: 720, maps_url: "https://maps.example/bigbox", is_sponsor: false, sponsor_click_url: null },
  ]);

  const counts = buildNearbyCounts(groups);
  assert.equal(counts.coffee, 1);
  assert.equal(counts.food, 1);
  assert.equal(counts.hotels, 1);
  assert.equal(counts.sportingGoods, 2);
  assert.equal(groups.hotels[0]?.sponsor_click_url, "https://sponsor.example/hotel");
});

test("selectVenueAirport prefers major airport, formats code/query, and buckets distance", () => {
  const selection = selectVenueAirport({
    nearest_airport: {
      id: "airport-1",
      ident: "KHIO",
      iata_code: null,
      name: "Hillsboro Airport",
      municipality: "Hillsboro",
      iso_country: "US",
      iso_region: "OR",
      airport_type: "medium_airport",
      scheduled_service: true,
      is_commercial: true,
      is_major: false,
      distance_miles: 8.3,
    },
    nearest_major_airport: {
      id: "airport-2",
      ident: "KPDX",
      iata_code: "PDX",
      name: "Portland International Airport",
      municipality: "Portland",
      iso_country: "US",
      iso_region: "OR",
      airport_type: "large_airport",
      scheduled_service: true,
      is_commercial: true,
      is_major: true,
      distance_miles: 24.8,
    },
  });

  assert.equal(selection?.sourceKind, "nearest_major_airport");
  assert.equal(selection?.airport.name, "Portland International Airport");
  assert.equal(formatVenueAirportCode(selection?.airport), "PDX");
  assert.equal(buildVenueAirportQuery(selection?.airport), "Portland International Airport, Portland, OR, US");
  assert.equal(bucketVenueAirportDistance(selection?.airport.distance_miles), "under_25");
});

test("airport helpers omit malformed values cleanly", () => {
  assert.equal(selectVenueAirport(null), null);
  assert.equal(buildVenueAirportQuery(null), null);
  assert.equal(formatVenueAirportCode({} as any), null);
  assert.equal(bucketVenueAirportDistance(null), null);
});

function createMockVenueDb(rows: SharedVenueSourceRow[]): SharedVenueDbClient {
  class Query {
    private readonly rows: SharedVenueSourceRow[];
    private filters: Array<(row: SharedVenueSourceRow) => boolean> = [];
    private maxRows: number | null = null;

    constructor(rows: SharedVenueSourceRow[]) {
      this.rows = rows;
    }

    eq(column: string, value: string) {
      this.filters.push((row) => String((row as any)[column] ?? "") === value);
      return this;
    }

    ilike(column: string, value: string) {
      const needle = value.replace(/%/g, "").toLowerCase();
      this.filters.push((row) => String((row as any)[column] ?? "").toLowerCase().includes(needle));
      return this;
    }

    limit(value: number) {
      this.maxRows = value;
      return this.executeMany();
    }

    maybeSingle<T>() {
      const rows = this.filtered();
      return Promise.resolve({ data: (rows[0] ?? null) as T | null, error: null });
    }

    private executeMany() {
      return Promise.resolve({ data: this.filtered(), error: null });
    }

    private filtered() {
      const rows = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
      return this.maxRows == null ? rows : rows.slice(0, this.maxRows);
    }
  }

  return {
    from() {
      return {
        select() {
          return new Query(rows);
        },
      };
    },
  };
}

test("resolveSharedVenueByParam resolves slug, id redirect, and legacy address lookup", async () => {
  const rows: SharedVenueSourceRow[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      seo_slug: "san-diego-convention-center",
      name: "San Diego Convention Center",
      address: "111 W Harbor Dr",
      city: "San Diego",
      state: "CA",
      zip: "92101",
      latitude: 32.71,
      longitude: -117.16,
      notes: null,
      venue_url: null,
      sport: "basketball",
      restroom_cleanliness_avg: null,
      shade_score_avg: null,
      vendor_score_avg: null,
      parking_convenience_score_avg: null,
      review_count: null,
      reviews_last_updated_at: null,
      tournament_venues: [],
    },
  ];
  const db = createMockVenueDb(rows);

  const bySlug = await resolveSharedVenueByParam(db, "san-diego-convention-center");
  assert.equal(bySlug.venue?.id, rows[0]?.id);
  assert.equal(bySlug.canonicalParam, null);

  const byId = await resolveSharedVenueByParam(db, "11111111-1111-4111-8111-111111111111");
  assert.equal(byId.venue?.id, rows[0]?.id);
  assert.equal(byId.canonicalParam, "san-diego-convention-center");

  const byLegacy = await resolveSharedVenueByParam(db, "111-w-harbor-dr-san-diego-ca", { allowLegacyAddressSlugLookup: true });
  assert.equal(byLegacy.venue?.id, rows[0]?.id);
  assert.equal(byLegacy.canonicalParam, "san-diego-convention-center");
});

function makeSharedVenue(input: Partial<SharedVenue> & Pick<SharedVenue, "id" | "routeKey" | "address" | "coordinates" | "tournaments">): SharedVenue {
  return {
    id: input.id,
    routeKey: input.routeKey,
    seoSlug: input.seoSlug ?? input.routeKey,
    name: input.name ?? input.routeKey,
    address: input.address,
    coordinates: input.coordinates,
    notes: null,
    venueUrl: null,
    sport: null,
    reviewAverages: {
      restroomCleanliness: null,
      shade: null,
      vendors: null,
      parkingConvenience: null,
    },
    reviewCount: null,
    reviewsLastUpdatedAt: null,
    tournaments: input.tournaments,
    directions: {
      destinationLabel: input.name ?? input.routeKey,
      destinationAddress: input.address.formatted,
      destinationLatitude: input.coordinates.latitude,
      destinationLongitude: input.coordinates.longitude,
    },
    readiness: {
      addressReady: true,
      mapReady: true,
      hotelSearchReady: true,
      hotelSearchNotReadyReason: null,
      nearbyEnrichmentReady: true,
    },
  };
}

test("buildVenueClusterCandidates prioritizes same-tournament venues and rejects same-city venues without activity", () => {
  const currentVenue = makeSharedVenue({
    id: "venue-1",
    routeKey: "venue-one",
    address: { line1: "1 Main", city: "Coral Springs", state: "FL", postalCode: "33065", formatted: "1 Main, Coral Springs, FL" },
    coordinates: { latitude: 26.27, longitude: -80.29, valid: true },
    tournaments: [
      {
        id: "tournament-a",
        slug: "amerigol",
        name: "AMERIGOL",
        sport: "hockey",
        city: "Coral Springs",
        state: "FL",
        startDate: "2026-08-10",
        endDate: "2026-08-12",
      },
    ],
  });
  const sameTournamentVenue = makeSharedVenue({
    id: "venue-2",
    routeKey: "venue-two",
    address: { line1: "2 Main", city: "Lake Worth", state: "FL", postalCode: "33461", formatted: "2 Main, Lake Worth, FL" },
    coordinates: { latitude: 26.61, longitude: -80.12, valid: true },
    tournaments: [
      {
        id: "tournament-a",
        slug: "amerigol",
        name: "AMERIGOL",
        sport: "hockey",
        city: "Coral Springs",
        state: "FL",
        startDate: "2026-08-10",
        endDate: "2026-08-12",
      },
    ],
  });
  const sameCityActive = makeSharedVenue({
    id: "venue-3",
    routeKey: "venue-three",
    address: { line1: "3 Main", city: "Coral Springs", state: "FL", postalCode: "33065", formatted: "3 Main, Coral Springs, FL" },
    coordinates: { latitude: 26.28, longitude: -80.30, valid: true },
    tournaments: [
      {
        id: "tournament-b",
        slug: "fall-classic",
        name: "Fall Classic",
        sport: "baseball",
        city: "Coral Springs",
        state: "FL",
        startDate: "2026-09-01",
        endDate: "2026-09-03",
      },
    ],
  });
  const sameCityInactive = makeSharedVenue({
    id: "venue-4",
    routeKey: "venue-four",
    address: { line1: "4 Main", city: "Coral Springs", state: "FL", postalCode: "33065", formatted: "4 Main, Coral Springs, FL" },
    coordinates: { latitude: 26.29, longitude: -80.31, valid: true },
    tournaments: [
      {
        id: "tournament-old",
        slug: "old-event",
        name: "Old Event",
        sport: "hockey",
        city: "Coral Springs",
        state: "FL",
        startDate: "2026-07-01",
        endDate: "2026-07-03",
      },
    ],
  });

  const candidates = buildVenueClusterCandidates({
    currentVenue,
    sameTournamentVenues: [sameTournamentVenue],
    sameCityVenues: [sameTournamentVenue, sameCityActive, sameCityInactive],
    now: new Date("2026-08-06T12:00:00Z"),
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.venue.id),
    ["venue-2", "venue-3"]
  );
  assert.equal(candidates[0]?.tier, "same_tournament");
  assert.equal(candidates.some((candidate) => candidate.venue.id === "venue-4"), false);
});

test("buildVenueClusterCandidates omits weak result sets below threshold and dedupes self/current venue", () => {
  const currentVenue = makeSharedVenue({
    id: "venue-10",
    routeKey: "venue-ten",
    address: { line1: "10 Main", city: "Cheney", state: "WA", postalCode: "99004", formatted: "10 Main, Cheney, WA" },
    coordinates: { latitude: 47.48, longitude: -117.57, valid: true },
    tournaments: [],
  });
  const sameCitySingle = makeSharedVenue({
    id: "venue-11",
    routeKey: "venue-eleven",
    address: { line1: "11 Main", city: "Cheney", state: "WA", postalCode: "99004", formatted: "11 Main, Cheney, WA" },
    coordinates: { latitude: 47.49, longitude: -117.58, valid: true },
    tournaments: [
      {
        id: "future-1",
        slug: "future-one",
        name: "Future One",
        sport: "baseball",
        city: "Cheney",
        state: "WA",
        startDate: "2026-08-20",
        endDate: "2026-08-21",
      },
    ],
  });

  const candidates = buildVenueClusterCandidates({
    currentVenue,
    sameTournamentVenues: [currentVenue],
    sameCityVenues: [currentVenue, sameCitySingle, sameCitySingle],
    now: new Date("2026-08-06T12:00:00Z"),
  });

  assert.equal(candidates.length, 0);
});
