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

test("venue hotel CTA uses the dated map only for explicit tournament context", () => {
  assert.match(venuePage, /const contextTournament = selectedTournament \?\? upcomingTournaments\[0\] \?\? null/);
  assert.match(venuePage, /const selectedTournamentHasHotelDates = Boolean\([\s\S]*selectedTournament\?\.startDate/);
  assert.match(venuePage, /selectedTournamentHasHotelDates && selectedTournament\?\.slug/);
  assert.match(venuePage, /tournamentSlug: selectedTournament\.slug/);
  assert.match(venuePage, /href=\{hotelMapHref \?\? hotelBookingHref\}/);
  assert.match(venuePage, /See hotels & rates on map/);
  assert.match(venuePage, /target=\{hotelMapHref \? "_self" : "_blank"\}/);
});

test("direct venue map does not silently enter an inferred tournament", () => {
  assert.doesNotMatch(venuePage, /const mapContextTournamentSlug =/);
  assert.doesNotMatch(
    venuePage,
    /selectedTournamentSlug=\{[\s\S]*upcomingTournaments[\s\S]*\}/
  );
  assert.match(
    venuePage,
    /selectedTournamentSlug=\{\(selectedTournament\?\.slug \?\? ""\)\.trim\(\) \|\| null\}/
  );
});

test("preselected tournament venue map automatically loads one venue hotel pool", () => {
  assert.match(mapShell, /if \(initialSelectedVenueId\) return initialSelectedVenueId/);
  assert.match(mapClient, /if \(!selectedVenueId\) return;[\s\S]*void loadHotelPinsForVenue\(selectedVenue\)/);
  assert.match(mapClient, /tournamentId: tournament\.id/);
  assert.match(mapClient, /source: "venue_map"/);
});

test("hotel map changes dates only through the explicit update action", () => {
  assert.match(mapClient, /Stay: <strong>\{hotelDateRangeLabel\}<\/strong>/);
  assert.match(mapClient, /isHotelDateEditorOpen \? "Cancel" : "Change dates"/);
  assert.match(mapClient, /<form id="hotel-date-editor"[\s\S]*onSubmit=\{handleUpdateHotelDates\}/);
  assert.match(mapClient, /validateHotelSearchDateRange\(hotelDateCheckIn, hotelDateCheckOut\)/);
  assert.match(mapClient, /checkin: explicitDates\?\.checkIn/);
  assert.match(mapClient, /checkout: explicitDates\?\.checkOut/);
  assert.match(mapClient, /checkin: activeHotelSearchCheckIn/);
  assert.match(mapClient, /checkout: activeHotelSearchCheckOut/);
  assert.match(mapClient, /Update hotels/);
});

test("venue page uses an undated attributed broad search when tournament context is only inferred", () => {
  assert.match(venuePage, /const hotelBookingHref = buildHotelsHref\(/);
  assert.match(venuePage, /tournamentId: selectedTournament\?\.id \?\? null/);
  assert.match(venuePage, /checkin: selectedTournament\?\.startDate \?\? null/);
  assert.match(venuePage, /checkout: selectedTournament\?\.endDate \?\? null/);
  assert.match(venuePage, /selectedTournamentId=\{selectedTournament\?\.id \?\? null\}/);
  assert.match(venuePage, /selectedTournamentStartDate=\{selectedTournament\?\.startDate \?\? null\}/);
  assert.match(venuePage, /selectedTournamentEndDate=\{selectedTournament\?\.endDate \?\? null\}/);
  assert.match(venuePage, /href=\{hotelMapHref \?\? hotelBookingHref\}/);
  assert.match(venuePage, /Find hotels near this venue/);
});
