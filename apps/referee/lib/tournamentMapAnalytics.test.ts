import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRiTournamentMapEventPayload,
  getRiMapDeviceType,
  getRiMapTrafficSource,
} from "./tournamentMapAnalytics";

test("device type buckets reflect viewport width", () => {
  assert.equal(getRiMapDeviceType(375), "mobile");
  assert.equal(getRiMapDeviceType(900), "tablet");
  assert.equal(getRiMapDeviceType(1440), "desktop");
});

test("traffic source prefers utm_source and otherwise classifies referrers", () => {
  assert.equal(
    getRiMapTrafficSource("https://www.refereeinsights.com/tournaments/map?utm_source=mailchimp", ""),
    "mailchimp"
  );
  assert.equal(getRiMapTrafficSource("https://www.refereeinsights.com/tournaments/map", ""), "direct");
  assert.equal(
    getRiMapTrafficSource("https://www.refereeinsights.com/tournaments/map", "https://www.google.com/search?q=referee"),
    "organic_search"
  );
});

test("analytics payload builder keeps RI map namespace properties stable", () => {
  assert.deepEqual(
    buildRiTournamentMapEventPayload({
      sourcePage: "directory",
      mapListState: "split",
      resultCount: 42,
      sport: "soccer",
      state: "CA",
      city: "San Diego",
      month: "2026-08",
      tournamentId: "t-1",
      tournamentSlug: "alpha",
      venueId: "v-1",
    }),
    {
      site: "refereeinsights",
      source_page: "directory",
      map_list_state: "split",
      result_count: 42,
      sport: "soccer",
      state: "CA",
      city: "San Diego",
      month: "2026-08",
      tournament_id: "t-1",
      tournament_slug: "alpha",
      venue_id: "v-1",
    }
  );
});
