import assert from "node:assert/strict";
import test from "node:test";

import { resolveTournamentHotelSearchCta } from "./tournamentHotelSelection";

test("resolveTournamentHotelSearchCta uses direct handoff for one usable venue", () => {
  const result = resolveTournamentHotelSearchCta({
    tournamentId: "t1",
    startDate: "2026-08-20",
    endDate: "2026-08-22",
    fallbackHref: "/book-travel?city=Denver&state=CO",
    venues: [
      {
        id: "v1",
        name: "Main Complex",
        city: "Denver",
        state: "CO",
        zip: "80202",
        latitude: 39.7392,
        longitude: -104.9903,
        isPrimary: true,
      },
    ],
  });

  assert.equal(result.mode, "direct");
  assert.equal(result.options.length, 1);
  assert.match(result.href, /venueId=v1/);
  assert.match(result.href, /checkin=2026-08-20/);
  assert.match(result.href, /checkout=2026-08-22/);
});

test("resolveTournamentHotelSearchCta uses selector when multiple usable venues exist", () => {
  const result = resolveTournamentHotelSearchCta({
    tournamentId: "t1",
    startDate: "2026-08-20",
    endDate: "2026-08-22",
    fallbackHref: "/book-travel?city=Denver&state=CO",
    venues: [
      {
        id: "v2",
        name: "Secondary Park",
        city: "Boulder",
        state: "CO",
        zip: "80301",
        createdAt: "2026-01-02T00:00:00Z",
      },
      {
        id: "v1",
        name: "Primary Complex",
        city: "Denver",
        state: "CO",
        zip: "80202",
        isPrimary: true,
        createdAt: "2026-01-03T00:00:00Z",
      },
    ],
  });

  assert.equal(result.mode, "selector");
  assert.equal(result.options.length, 2);
  assert.equal(result.options[0].id, "v1");
  assert.equal(result.options[1].id, "v2");
});

test("resolveTournamentHotelSearchCta falls back when linked venues have no usable destination", () => {
  const result = resolveTournamentHotelSearchCta({
    tournamentId: "t1",
    startDate: "2026-08-20",
    endDate: "2026-08-20",
    fallbackHref: "/book-travel?city=Denver&state=CO",
    venues: [
      {
        id: "v1",
        name: "Unknown Site",
        city: null,
        state: null,
        zip: null,
      },
    ],
  });

  assert.equal(result.mode, "fallback");
  assert.equal(result.href, "/book-travel?city=Denver&state=CO");
  assert.equal(result.options.length, 0);
});

test("resolveTournamentHotelSearchCta uses coordinate-only venues like the venue map flow", () => {
  const result = resolveTournamentHotelSearchCta({
    tournamentId: "t1",
    startDate: "2026-08-20",
    endDate: "2026-08-22",
    fallbackHref: "/book-travel?city=Denver&state=CO",
    venues: [
      {
        id: "v1",
        name: "Unnamed Complex",
        city: null,
        state: null,
        zip: null,
        latitude: 39.7392,
        longitude: -104.9903,
      },
    ],
  });

  assert.equal(result.mode, "direct");
  assert.match(result.href, /venueId=v1/);
  assert.match(result.href, /lat=39.7392/);
  assert.match(result.href, /lng=-104.9903/);
  assert.doesNotMatch(result.href, /[?&]ss=/);
});

test("resolveTournamentHotelSearchCta normalizes same-day tournament dates to a one-night stay", () => {
  const result = resolveTournamentHotelSearchCta({
    tournamentId: "t1",
    startDate: "2026-08-20",
    endDate: "2026-08-20",
    fallbackHref: "/book-travel?city=Denver&state=CO",
    venues: [
      {
        id: "v1",
        name: "Main Complex",
        city: "Denver",
        state: "CO",
        zip: "80202",
      },
    ],
  });

  assert.equal(result.mode, "direct");
  assert.match(result.href, /checkin=2026-08-20/);
  assert.match(result.href, /checkout=2026-08-21/);
});
