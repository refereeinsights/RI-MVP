import assert from "node:assert/strict";
import test from "node:test";

import { evaluateTournamentTeamTravelEligibility, evaluateVenueTeamTravelEligibility } from "./teamTravelEligibility";

test("tournament detail eligibility stays visible for future multi-day travel context", () => {
  const eligibility = evaluateTournamentTeamTravelEligibility({
    tournamentId: "t1",
    tournamentName: "Future Cup",
    venueId: "v1",
    venueName: "Big Arena",
    city: "San Diego",
    state: "CA",
    startDate: "2026-09-10",
    endDate: "2026-09-12",
    todayIso: "2026-08-05",
  });

  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.intentLevel, "strong");
  assert.equal(eligibility.ctaLevel, "secondary");
  assert.equal(eligibility.reason, "future_tournament_with_destination");
});

test("tournament detail eligibility hides past tournaments", () => {
  const eligibility = evaluateTournamentTeamTravelEligibility({
    tournamentId: "t1",
    venueName: "Big Arena",
    city: "San Diego",
    state: "CA",
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    todayIso: "2026-08-05",
  });

  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.ctaLevel, "hidden");
  assert.equal(eligibility.reason, "past_event");
});

test("venue detail prefers selected future tournament", () => {
  const eligibility = evaluateVenueTeamTravelEligibility({
    selectedTournament: {
      id: "selected",
      name: "Selected Classic",
      startDate: "2026-08-20",
      endDate: "2026-08-22",
    },
    upcomingTournaments: [{ id: "other", name: "Other Open", startDate: "2026-08-10", endDate: "2026-08-11" }],
    venueId: "v1",
    venueName: "Venue",
    city: "Portland",
    state: "OR",
    todayIso: "2026-08-05",
  });

  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, "venue_with_selected_future_tournament");
  assert.equal(eligibility.tournamentId, "selected");
});

test("venue detail falls back to earliest upcoming tournament when none selected", () => {
  const eligibility = evaluateVenueTeamTravelEligibility({
    upcomingTournaments: [
      { id: "late", name: "Late Event", startDate: "2026-09-01", endDate: "2026-09-02" },
      { id: "early", name: "Early Event", startDate: "2026-08-14", endDate: "2026-08-16" },
    ],
    venueId: "v1",
    venueName: "Venue",
    city: "Portland",
    state: "OR",
    todayIso: "2026-08-05",
  });

  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, "venue_with_upcoming_tournament");
  assert.equal(eligibility.tournamentId, "early");
});

test("venue detail downgrades to destination-only passive discovery without future tournaments", () => {
  const eligibility = evaluateVenueTeamTravelEligibility({
    venueId: "v1",
    venueName: "Venue",
    city: "Portland",
    state: "OR",
    todayIso: "2026-08-05",
  });

  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.intentLevel, "passive");
  assert.equal(eligibility.ctaLevel, "link");
  assert.equal(eligibility.reason, "venue_destination_only");
  assert.equal(eligibility.tournamentId, null);
});
