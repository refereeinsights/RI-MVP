import test from "node:test";
import assert from "node:assert/strict";

import { deriveTeamHotelAcquisitionContext } from "./teamHotelAcquisition";

const siteOrigin = "https://www.tournamentinsights.com";

test("classifies organic search and stores only the referrer origin", () => {
  assert.deepEqual(
    deriveTeamHotelAcquisitionContext({
      pageUrl: `${siteOrigin}/team-hotel-booking`,
      referrer: "https://www.google.com/search?q=team+hotels&private=value",
      siteOrigin,
    }),
    { trafficSource: "organic_search", referrer: "https://www.google.com" }
  );
});

test("UTM source takes precedence and is normalized", () => {
  assert.deepEqual(
    deriveTeamHotelAcquisitionContext({
      pageUrl: `${siteOrigin}/tournaments/example?utm_source=Coach%20Email`,
      referrer: "https://mail.example.com/inbox?id=private",
      siteOrigin,
    }),
    { trafficSource: "utm:coach_email", referrer: "https://mail.example.com" }
  );
});

test("distinguishes direct, internal, and referral acquisition", () => {
  assert.deepEqual(
    deriveTeamHotelAcquisitionContext({ pageUrl: `${siteOrigin}/`, siteOrigin }),
    { trafficSource: "direct", referrer: null }
  );
  assert.deepEqual(
    deriveTeamHotelAcquisitionContext({
      pageUrl: `${siteOrigin}/team-hotel-booking`,
      referrer: `${siteOrigin}/tournaments/example?token=private`,
      siteOrigin,
    }),
    { trafficSource: "internal", referrer: null }
  );
  assert.deepEqual(
    deriveTeamHotelAcquisitionContext({
      pageUrl: `${siteOrigin}/team-hotel-booking`,
      referrer: "https://example.org/article?token=private",
      siteOrigin,
    }),
    { trafficSource: "referral", referrer: "https://example.org" }
  );
});
