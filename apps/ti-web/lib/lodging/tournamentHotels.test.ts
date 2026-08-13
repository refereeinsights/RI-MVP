import test from "node:test";
import assert from "node:assert/strict";

import {
  initialTournamentHotelDates,
  isValidHotelSearchCoordinates,
  selectInitialTournamentHotelVenue,
  tournamentHotelsSeoEligible,
  type TournamentHotelsVenue,
} from "./tournamentHotels";

const venue = (overrides: Partial<TournamentHotelsVenue> = {}): TournamentHotelsVenue => ({
  id: "venue-1",
  name: "Main Complex",
  address: null,
  city: "Phoenix",
  state: "AZ",
  zip: null,
  latitude: 33.45,
  longitude: -112.07,
  timezone: "America/Phoenix",
  isPrimary: false,
  order: 0,
  ...overrides,
});

test("validates hotel coordinates and rejects known artifacts", () => {
  assert.equal(isValidHotelSearchCoordinates(33.45, -112.07), true);
  assert.equal(isValidHotelSearchCoordinates(0, 0), false);
  assert.equal(isValidHotelSearchCoordinates(null, -112), false);
  assert.equal(isValidHotelSearchCoordinates(91, -112), false);
  assert.equal(isValidHotelSearchCoordinates(33, -181), false);
  assert.equal(isValidHotelSearchCoordinates(Number.NaN, -112), false);
});

test("selects the confirmed primary searchable venue then stable order", () => {
  const first = venue({ id: "first", order: 0 });
  const primary = venue({ id: "primary", order: 1, isPrimary: true });
  const invalid = venue({ id: "invalid", order: 2, isPrimary: true, latitude: 0, longitude: 0 });
  assert.equal(selectInitialTournamentHotelVenue([first, primary, invalid])?.id, "primary");
  assert.equal(selectInitialTournamentHotelVenue([invalid, first])?.id, "first");
});

test("applies shared SEO qualification boundaries", () => {
  const now = new Date("2026-08-13T12:00:00Z");
  const base = { status: "published", name: "Classic", city: "Phoenix", state: "AZ", venues: [venue()] };
  assert.equal(tournamentHotelsSeoEligible({ ...base, startDate: "2025-08-13" }, now), true);
  assert.equal(tournamentHotelsSeoEligible({ ...base, startDate: "2025-08-12" }, now), false);
  assert.equal(tournamentHotelsSeoEligible({ ...base, status: "draft", startDate: "2026-09-01" }, now), false);
  assert.equal(tournamentHotelsSeoEligible({ ...base, name: "", startDate: "2026-09-01" }, now), false);
  assert.equal(tournamentHotelsSeoEligible({ ...base, city: "", state: "", startDate: "2026-09-01" }, now), false);
  assert.equal(
    tournamentHotelsSeoEligible({ ...base, startDate: "2026-09-01", venues: [venue({ latitude: 0, longitude: 0 })] }, now),
    false
  );
});

test("uses tournament dates only when booking safe and otherwise matches the existing fallback window", () => {
  const now = new Date("2026-08-13T12:00:00Z");
  assert.deepEqual(initialTournamentHotelDates({ startDate: "2026-09-05", endDate: "2026-09-07" }, now), {
    checkin: "2026-09-05",
    checkout: "2026-09-08",
    source: "tournament",
  });
  assert.deepEqual(initialTournamentHotelDates({ startDate: "2026-08-10", endDate: "2026-08-14" }, now), {
    checkin: "2026-08-13",
    checkout: "2026-08-15",
    source: "booking_safe_fallback",
  });
  assert.deepEqual(initialTournamentHotelDates({ startDate: "2026-07-01", endDate: "2026-07-03" }, now), {
    checkin: "2026-08-27",
    checkout: "2026-08-29",
    source: "booking_safe_fallback",
  });
});
