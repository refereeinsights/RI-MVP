import test from "node:test";
import assert from "node:assert/strict";

import { isMapLinkEligibleLocation, plannerEventLocationForMaps, resolvePlannerVenueMatches } from "./venueResolution";

function mockSupabaseWithVenues(venues: Array<{ id: string; name: string | null; address: string | null; city: string | null; state: string | null; seo_slug?: string | null }>) {
  return {
    from() {
      let stateFilter = "";
      let cityFilter = "";
      let hasStateFilter = false;
      let hasCityFilter = false;
      return {
        select() {
          return this;
        },
        eq(_column: string, value: string) {
          stateFilter = value;
          hasStateFilter = true;
          return this;
        },
        ilike(_column: string, value: string) {
          cityFilter = value.toLowerCase();
          hasCityFilter = true;
          return this;
        },
        async limit() {
          return {
            data:
              hasStateFilter || hasCityFilter
                ? venues.filter(
                    (venue) =>
                      (!hasStateFilter || String(venue.state ?? "") === stateFilter) &&
                      (!hasCityFilter || String(venue.city ?? "").toLowerCase() === cityFilter),
                  )
                : venues,
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

test("resolvePlannerVenueMatches extracts venue name from source location text with trailing city/state/country", async () => {
  const supabase = mockSupabaseWithVenues([
    { id: "v1", name: "Dwight Merkel Sports Complex", address: "Foo", city: "Spokane", state: "WA" },
    { id: "v2", name: "Another Complex", address: "Bar", city: "Spokane", state: "WA" },
  ]);

  const matches = await resolvePlannerVenueMatches(supabase as any, [
    { id: "evt1", address_text: "Dwight Merkel Sports Complex Spokane, WA, United States", city: null, state: null },
  ]);

  assert.equal(matches.get("evt1"), "v1");
});

test("resolvePlannerVenueMatches strips trailing sub-venue text from full street addresses", async () => {
  const supabase = mockSupabaseWithVenues([
    { id: "v1", name: "The Warehouse Athletic Facility", address: "800 N Hamilton St", city: "Spokane", state: "WA" },
    { id: "v2", name: "The Hub", address: "19619 E Cataldo Ave", city: "Liberty Lake", state: "WA" },
    { id: "v3", name: "Fort Missoula Regional Park", address: "3401-3499 South Ave W", city: "Missoula", state: "MT" },
  ]);

  const matches = await resolvePlannerVenueMatches(supabase as any, [
    { id: "evt1", address_text: "800 N Hamilton St, Spokane, WA 99202, USA - Warehouse Court 3", city: null, state: null },
    { id: "evt2", address_text: "19619 E Cataldo Ave, Liberty Lake, WA 99016, USA - The Hub Court 1", city: null, state: null },
    { id: "evt3", address_text: "Fort Missoula Regional Park 3401-3499 South Ave W, Missoula, MT 59804, USA #6", city: null, state: null },
  ]);

  assert.equal(matches.get("evt1"), "v1");
  assert.equal(matches.get("evt2"), "v2");
  assert.equal(matches.get("evt3"), "v3");
});

test("resolvePlannerVenueMatches does not auto-link global name matches when multiple venues share the same name", async () => {
  const supabase = mockSupabaseWithVenues([
    { id: "v1", name: "Dwight Merkel Sports Complex", address: "Foo", city: "Spokane", state: "WA" },
    { id: "v2", name: "Dwight Merkel Sports Complex", address: "Bar", city: "Seattle", state: "WA" },
  ]);

  const matches = await resolvePlannerVenueMatches(supabase as any, [
    { id: "evt1", address_text: "Dwight Merkel Sports Complex", city: null, state: null },
  ]);

  assert.equal(matches.has("evt1"), false);
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
