import assert from "node:assert/strict";
import test from "node:test";

import { buildTeamHotelBookingDestination, buildTeamHotelBookingHref } from "./teamHotelBooking";

test("buildTeamHotelBookingDestination prefers explicit destination", () => {
  assert.equal(
    buildTeamHotelBookingDestination({
      destination: "San Diego, CA",
      venueName: "San Diego Convention Center",
      city: "San Diego",
      state: "CA",
    }),
    "San Diego, CA",
  );
});

test("buildTeamHotelBookingDestination falls back to venue and locality", () => {
  assert.equal(
    buildTeamHotelBookingDestination({
      venueName: "Camp Jordan Baseball/Softball Complex",
      city: "East Ridge",
      state: "TN",
    }),
    "Camp Jordan Baseball/Softball Complex, East Ridge, TN",
  );
});

test("buildTeamHotelBookingHref preserves canonical attribution query params", () => {
  const href = buildTeamHotelBookingHref({
    venueName: "San Diego Convention Center",
    city: "San Diego",
    state: "CA",
    checkin: "2026-07-01",
    checkout: "2026-07-03",
    rooms: 12,
    tournamentId: "tid_123",
    tournamentName: "California State Games Basketball Championship",
    venueId: "vid_456",
    sport: "basketball",
    entrySource: "tournament_detail",
    entryPageType: "tournament",
    entryPath: "/tournaments/california-state-games-basketball-championship-san-diego-ca",
    entryPlacement: "tournament_detail_team_hotel_cta",
  });

  const url = new URL(`https://www.tournamentinsights.com${href}`);
  assert.equal(url.pathname, "/team-hotel-booking");
  assert.equal(url.searchParams.get("destination"), "San Diego Convention Center, San Diego, CA");
  assert.equal(url.searchParams.get("checkin"), "2026-07-01");
  assert.equal(url.searchParams.get("checkout"), "2026-07-03");
  assert.equal(url.searchParams.get("rooms"), "12");
  assert.equal(url.searchParams.get("tournament_id"), "tid_123");
  assert.equal(url.searchParams.get("venue_id"), "vid_456");
  assert.equal(url.searchParams.get("entry_source"), "tournament_detail");
  assert.equal(url.searchParams.get("entry_page_type"), "tournament");
  assert.equal(url.searchParams.get("entry_placement"), "tournament_detail_team_hotel_cta");
});
