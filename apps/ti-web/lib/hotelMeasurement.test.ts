import test from "node:test";
import assert from "node:assert/strict";

import {
  appendHotelMeasurementParams,
  directorHotelTrafficSource,
  HOTEL_DISTRIBUTION_SOURCES,
  isKnownAutomatedHotelUserAgent,
  normalizeHotelDistributionSource,
  normalizeHotelMeasurementProperties,
  resolveHotelTrafficSource,
} from "./hotelMeasurement";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

test("accepts only bounded hotel distribution sources", () => {
  for (const source of HOTEL_DISTRIBUTION_SOURCES) {
    assert.equal(normalizeHotelDistributionSource(source), source);
  }
  assert.equal(normalizeHotelDistributionSource("newsletter"), null);
  assert.equal(normalizeHotelDistributionSource("director_email<script>"), null);
  assert.equal(normalizeHotelDistributionSource(null), null);
});

test("suppresses only recognizable automated hotel user agents", () => {
  assert.equal(isKnownAutomatedHotelUserAgent("Mozilla/5.0"), false);
  assert.equal(isKnownAutomatedHotelUserAgent(null), false);
  assert.equal(isKnownAutomatedHotelUserAgent("Slackbot-LinkExpanding 1.0"), true);
  assert.equal(isKnownAutomatedHotelUserAgent("Googlebot/2.1"), true);
});

test("director attribution takes precedence without concatenating traffic sources", () => {
  assert.equal(directorHotelTrafficSource("team_manager_email"), "director:team_manager_email");
  assert.equal(resolveHotelTrafficSource({
    distributionSource: "director_email",
    existingTrafficSource: "utm:newsletter",
  }), "director:director_email");
  assert.equal(resolveHotelTrafficSource({
    distributionSource: "invalid",
    existingTrafficSource: "utm:newsletter",
  }), "utm:newsletter");
});

test("normalizes measurement properties without treating a session as proof of humanity", () => {
  assert.deepEqual(normalizeHotelMeasurementProperties({
    session_id: SESSION_ID.toUpperCase(),
    distribution_source: "qr_code",
  }), {
    session_id: SESSION_ID,
    distribution_source: "qr_code",
  });
  assert.deepEqual(normalizeHotelMeasurementProperties({
    session_id: "not-a-uuid",
    distribution_source: "arbitrary",
  }), {
    session_id: null,
    distribution_source: null,
  });
});

test("appends only validated measurement values to first-party handoffs", () => {
  const url = appendHotelMeasurementParams(new URL("https://ti.test/go/hotels"), {
    sessionId: SESSION_ID,
    distributionSource: "tournament_website",
  });
  assert.equal(url.searchParams.get("session_id"), SESSION_ID);
  assert.equal(url.searchParams.get("distribution_source"), "tournament_website");

  const invalid = appendHotelMeasurementParams(new URL("https://ti.test/go/hotels"), {
    sessionId: "invalid",
    distributionSource: null,
  });
  assert.equal(invalid.searchParams.has("session_id"), false);
  assert.equal(invalid.searchParams.has("distribution_source"), false);
});
