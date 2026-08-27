import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
const bookTravel = readFileSync(new URL("../../app/book-travel/page.tsx", import.meta.url), "utf8");
const tournamentHotels = readFileSync(
  new URL("../../app/tournaments/[slug]/hotels/TournamentHotelsClient.tsx", import.meta.url),
  "utf8"
);

test("homepage makes generic sports-travel discovery visible without changing its primary map job", () => {
  assert.ok(home.indexOf("Explore the map") < home.indexOf("Traveling for sports?"));
  assert.match(home, /even if your event isn&apos;t listed on TournamentInsights/);
  assert.match(home, /href="\/book-travel"[\s\S]*Find Hotels/);
});

test("book travel remains the canonical generic family flow with a distinct team path", () => {
  assert.match(bookTravel, /alternates: \{ canonical: "\/book-travel" \}/);
  assert.match(bookTravel, /Find hotels and rentals for youth sports travel/);
  assert.match(bookTravel, /Booking 1–4 rooms/);
  assert.match(bookTravel, /Planning 5\+ rooms/);
  assert.match(bookTravel, /href="\/team-hotel-booking"/);
});

test("contextual recovery preserves the attributed handoff and does not Pro-gate hotel actions", () => {
  assert.match(tournamentHotels, /attributedHref\("\/go\/hotels"/);
  assert.match(tournamentHotels, /sourcePageType: "tournament_hotels"/);
  assert.match(tournamentHotels, /tournamentId/);
  assert.match(tournamentHotels, /venueId/);
  assert.match(tournamentHotels, /cta_placement/);
  assert.match(tournamentHotels, /custom\$\{index\}/);
  assert.match(tournamentHotels, /Find Hotels/);
  assert.match(tournamentHotels, /Request Team Hotel Options/);
  assert.doesNotMatch(tournamentHotels, /weekend_pro|requires Pro|Upgrade to Weekend Pro/i);
});
