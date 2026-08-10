import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPSPOT_AWIN_ADVERTISER_ID,
  CAMPSPOT_AWIN_AFFILIATE_ID,
  CAMPSPOT_CTA_PLACEMENTS,
  buildCampingHref,
  buildCampspotAffiliateUrl,
  buildCampspotUrl,
  createCampspotAttributionId,
  deriveCampspotTournamentDates,
  hasValidCampspotDestination,
  isValidCampspotSourcePlacement,
  normalizeCampspotDatePair,
} from "./campspot";

test("builds the verified Campspot search URL with dates and guest defaults", () => {
  const url = new URL(
    buildCampspotUrl({
      city: "Kissimmee",
      stateName: "Florida",
      latitude: 28.291956,
      longitude: -81.40757,
      checkin: "2026-09-18",
      checkout: "2026-09-20",
    }),
  );
  assert.equal(url.origin + url.pathname, "https://www.campspot.com/search");
  assert.equal(url.searchParams.get("location"), "Kissimmee, Florida");
  assert.equal(url.searchParams.get("latitude"), "28.291956");
  assert.equal(url.searchParams.get("longitude"), "-81.40757");
  assert.equal(url.searchParams.get("checkin"), "2026-09-18");
  assert.equal(url.searchParams.get("checkout"), "2026-09-20");
  assert.equal(url.searchParams.get("adults"), "2");
  assert.equal(url.searchParams.get("children"), "0");
  assert.equal(url.searchParams.get("pets"), "0");
});

test("omits both dates when a complete valid pair is unavailable", () => {
  const url = new URL(
    buildCampspotUrl({
      city: "Denver",
      stateName: "Colorado",
      latitude: 39.7392,
      longitude: -104.9903,
      checkin: "2026-09-18",
      checkout: null,
    }),
  );
  assert.equal(url.searchParams.has("checkin"), false);
  assert.equal(url.searchParams.has("checkout"), false);
  assert.equal(normalizeCampspotDatePair({ checkin: "2026-09-20", checkout: "2026-09-18" }), null);
});

test("derives a tournament stay and omits past or implausibly long ranges", () => {
  assert.deepEqual(
    deriveCampspotTournamentDates({ startDate: "2026-09-18", endDate: "2026-09-20", todayIso: "2026-08-10" }),
    { checkin: "2026-09-18", checkout: "2026-09-21" },
  );
  assert.deepEqual(
    deriveCampspotTournamentDates({ startDate: "2026-09-18", endDate: "2026-09-18", todayIso: "2026-08-10" }),
    { checkin: "2026-09-18", checkout: "2026-09-19" },
  );
  assert.equal(deriveCampspotTournamentDates({ startDate: "2026-07-01", endDate: "2026-07-02", todayIso: "2026-08-10" }), null);
  assert.equal(deriveCampspotTournamentDates({ startDate: "2026-09-01", endDate: "2026-10-01", todayIso: "2026-08-10" }), null);
});

test("wraps the exact Campspot URL and canonical attribution ID for Awin", () => {
  const campspotUrl = buildCampspotUrl({
    city: "Kissimmee",
    stateName: "Florida",
    latitude: 28.291956,
    longitude: -81.40757,
    checkin: "2026-09-18",
    checkout: "2026-09-20",
  });
  const attributionId = createCampspotAttributionId(() => "11111111-1111-4111-8111-111111111111");
  const awinUrl = new URL(buildCampspotAffiliateUrl({ campspotUrl, outboundAttributionId: attributionId }));
  assert.equal(awinUrl.searchParams.get("awinmid"), CAMPSPOT_AWIN_ADVERTISER_ID);
  assert.equal(awinUrl.searchParams.get("awinaffid"), CAMPSPOT_AWIN_AFFILIATE_ID);
  assert.equal(awinUrl.searchParams.get("clickref"), attributionId);
  assert.equal(awinUrl.searchParams.get("ued"), campspotUrl);
});

test("accepts only supported destination and source/placement combinations", () => {
  assert.equal(hasValidCampspotDestination({ city: "Denver", state: "CO", latitude: 39.7392, longitude: -104.9903 }), true);
  assert.equal(hasValidCampspotDestination({ city: "Denver", state: "CO", latitude: 91, longitude: -104.9903 }), false);
  assert.equal(isValidCampspotSourcePlacement("venue_detail", CAMPSPOT_CTA_PLACEMENTS.venueDetail), true);
  assert.equal(isValidCampspotSourcePlacement("venue_detail", CAMPSPOT_CTA_PLACEMENTS.venueMap), false);
  assert.equal(isValidCampspotSourcePlacement("venue_map", CAMPSPOT_CTA_PLACEMENTS.venueMapVenueList), true);
  assert.equal(
    buildCampingHref({
      venueId: "00000000-0000-4000-8000-000000000000",
      tournamentId: "11111111-1111-4111-8111-111111111111",
      sourceSurface: "venue_map",
      ctaPlacement: CAMPSPOT_CTA_PLACEMENTS.venueMap,
    }),
    "/go/camping?venue_id=00000000-0000-4000-8000-000000000000&source_surface=venue_map&cta_placement=venue_map_camping&tournament_id=11111111-1111-4111-8111-111111111111",
  );
});
