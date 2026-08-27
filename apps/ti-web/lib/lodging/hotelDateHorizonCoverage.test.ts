import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("lodging API rejects the unsupported horizon before geocoding or provider invocation", () => {
  const route = source("../../app/api/lodging/search/route.ts");
  const post = route.slice(route.indexOf("export async function POST"));
  const guard = post.indexOf('horizon.status === "unsupported"');
  const geocode = post.indexOf("await geocodeGenericDestination");
  const provider = post.indexOf("createLodgingProvider(providerName)");

  assert.ok(guard >= 0);
  assert.ok(geocode > guard);
  assert.ok(provider > guard);
  assert.match(post, /reason: HOTEL_DATE_HORIZON_REASON/);
  assert.match(post, /showHotelFallback: false/);
  assert.match(post, /venueId,[\s\S]*tournamentId,/);
});

test("direct HotelPlanner handoff stops before target construction and persistence", () => {
  const route = source("../../app/go/hotels/route.ts");
  const get = route.slice(route.indexOf("export async function GET"));
  const guard = get.indexOf('dateHorizon.status === "unsupported"');
  const target = get.indexOf("const buildTargetForBaseUrl");
  const persistence = get.indexOf("persistHotelOutboundWithSnapshot");

  assert.ok(guard >= 0);
  assert.ok(target > guard);
  assert.ok(persistence > guard);
  assert.match(get, /return unsupportedHotelDateHorizonResponse\(\)/);
});

test("contextual and generic clients block early without a looping HotelPlanner fallback", () => {
  const contextual = source("../../app/tournaments/[slug]/hotels/TournamentHotelsClient.tsx");
  const generic = source("../../app/weekend-planner/WeekendPlannerClient.tsx");

  assert.match(contextual, /max=\{maxHotelSearchDate\}/);
  assert.match(contextual, /dateHorizonUnsupported/);
  assert.match(contextual, /HOTEL_DATE_HORIZON_HEADING/);
  assert.match(contextual, /selectedVenue/);
  assert.ok(generic.indexOf("evaluateHotelSearchDateHorizon") < generic.indexOf('fetch(new URL("/api/lodging/search"'));
  assert.match(generic, /!dateHorizonUnsupported/);
  assert.match(generic, /showHotelFallback: false/);
});
