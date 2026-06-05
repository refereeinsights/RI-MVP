import test from "node:test";
import assert from "node:assert/strict";

import { isMapLinkEligibleLocation, plannerEventLocationForMaps, resolvePlannerVenueMatches } from "./venueResolution";

function mockSupabaseWithVenues(venues: Array<{ id: string; name: string | null; address: string | null; city: string | null; state: string | null; seo_slug?: string | null }>) {
  return {
    from() {
      let stateFilter = "";
      let cityFilter = "";
      return {
        select() {
          return this;
        },
        eq(_column: string, value: string) {
          stateFilter = value;
          return this;
        },
        ilike(_column: string, value: string) {
          cityFilter = value.toLowerCase();
          return this;
        },
        async limit() {
          return {
            data: venues.filter((venue) => String(venue.state ?? "") === stateFilter && String(venue.city ?? "").toLowerCase() === cityFilter),
            error: null,
          };
        },
      };
    },
  };
}

test("isMapLinkEligibleLocation excludes field-only labels", () => {
  assert.equal(isMapLinkEligibleLocation("Field 1"), false);
  assert.equal(isMapLinkEligibleLocation("Gym B"), false);
  assert.equal(isMapLinkEligibleLocation("Avery Sports Complex, Spokane, WA"), true);
  assert.equal(isMapLinkEligibleLocation("123 Main St, Spokane, WA"), true);
});

test("plannerEventLocationForMaps prefers linked venue and suppresses ambiguous source-only labels", () => {
  assert.equal(
    plannerEventLocationForMaps({
      linkedVenue: { name: "Avery Sports Complex", address: "123 Main St", city: "Spokane", state: "WA" },
      address_text: "Field 1",
      city: null,
      state: null,
    }),
    "Avery Sports Complex, 123 Main St, Spokane, WA",
  );

  assert.equal(
    plannerEventLocationForMaps({
      linkedVenue: null,
      address_text: "Field 1",
      city: null,
      state: null,
    }),
    null,
  );
});

test("resolvePlannerVenueMatches matches exact address within city/state", async () => {
  const supabase = mockSupabaseWithVenues([
    { id: "v1", name: "Avery Sports Complex", address: "123 Main Street", city: "Spokane", state: "WA" },
  ]);

  const matches = await resolvePlannerVenueMatches(supabase as any, [
    { id: "evt1", address_text: "123 Main St, Spokane, WA", city: null, state: null },
  ]);

  assert.equal(matches.get("evt1"), "v1");
});

test("resolvePlannerVenueMatches matches exact venue name with city/state context", async () => {
  const supabase = mockSupabaseWithVenues([
    { id: "v1", name: "Avery Sports Complex", address: "123 Main Street", city: "Spokane", state: "WA" },
    { id: "v2", name: "Another Complex", address: "999 Elsewhere", city: "Spokane", state: "WA" },
  ]);

  const matches = await resolvePlannerVenueMatches(supabase as any, [
    { id: "evt1", address_text: "Avery Sports Complex, Spokane, WA", city: null, state: null },
  ]);

  assert.equal(matches.get("evt1"), "v1");
});

test("resolvePlannerVenueMatches does not auto-link when multiple candidates share an exact address", async () => {
  const supabase = mockSupabaseWithVenues([
    { id: "v1", name: "North Complex", address: "123 Main Street", city: "Spokane", state: "WA" },
    { id: "v2", name: "South Complex", address: "123 Main Street", city: "Spokane", state: "WA" },
  ]);

  const matches = await resolvePlannerVenueMatches(supabase as any, [
    { id: "evt1", address_text: "123 Main St, Spokane, WA", city: null, state: null },
  ]);

  assert.equal(matches.has("evt1"), false);
});
