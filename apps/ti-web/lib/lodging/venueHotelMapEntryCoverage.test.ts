import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const venuePage = readFileSync(new URL("../../app/venues/[venueId]/page.tsx", import.meta.url), "utf8");
const mapShell = readFileSync(
  new URL("../../app/tournaments/[slug]/map/TournamentVenueMapShellClient.tsx", import.meta.url),
  "utf8"
);
const mapClient = readFileSync(
  new URL("../../app/tournaments/[slug]/map/TournamentVenueMapClient.tsx", import.meta.url),
  "utf8"
);

test("venue hotel CTA prefers the selected or nearest upcoming tournament map", () => {
  assert.match(venuePage, /const contextTournament = selectedTournament \?\? upcomingTournaments\[0\] \?\? null/);
  assert.match(venuePage, /contextTournamentHasHotelDates/);
  assert.match(venuePage, /buildPlanningMapUrl\(\{[\s\S]*source: "venue_details"/);
  assert.match(venuePage, /href=\{hotelMapHref \?\? hotelBookingHref\}/);
  assert.match(venuePage, /See hotels & rates on map/);
  assert.match(venuePage, /target=\{hotelMapHref \? "_self" : "_blank"\}/);
});

test("preselected tournament venue map automatically loads one venue hotel pool", () => {
  assert.match(mapShell, /if \(initialSelectedVenueId\) return initialSelectedVenueId/);
  assert.match(mapClient, /if \(!selectedVenueId\) return;[\s\S]*void loadHotelPinsForVenue\(selectedVenue\)/);
  assert.match(mapClient, /tournamentId: tournament\.id/);
  assert.match(mapClient, /source: "venue_map"/);
});

test("venue page retains the attributed HotelPlanner fallback without tournament dates", () => {
  assert.match(venuePage, /const hotelBookingHref = buildHotelsHref\(/);
  assert.match(venuePage, /href=\{hotelMapHref \?\? hotelBookingHref\}/);
  assert.match(venuePage, /Find hotels near this venue/);
});
