import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTravelPropertyHandoff,
  normalizeTravelHotel,
  parseTravelSearchInput,
  RI_TRAVEL_CUSTOM8,
  RI_TRAVEL_SOURCE,
} from "./travelContracts";

const venueId = "11111111-1111-4111-8111-111111111111";

test("generic and venue travel searches validate without carrying a venue destination", () => {
  assert.deepEqual(parseTravelSearchInput({ destination: " Spokane, WA ", checkin: "2026-09-10", checkout: "2026-09-12" }), {
    ok: true,
    value: { mode: "generic", destination: "Spokane, WA", venueId: null, checkin: "2026-09-10", checkout: "2026-09-12" },
  });
  assert.deepEqual(parseTravelSearchInput({ venueId, destination: "must be dropped", checkin: "2026-09-10", checkout: "2026-09-12" }), {
    ok: true,
    value: { mode: "anchored", destination: null, venueId, checkin: "2026-09-10", checkout: "2026-09-12" },
  });
  assert.equal(parseTravelSearchInput({ destination: "", checkin: "2026-09-10", checkout: "2026-09-12" }).ok, false);
  assert.equal(parseTravelSearchInput({ destination: "Spokane", checkin: "2026-09-12", checkout: "2026-09-10" }).ok, false);
});

test("provider hotels are bounded to safe presentation fields", () => {
  assert.deepEqual(normalizeTravelHotel({ id: "42", name: "Test Hotel", detailUrl: "https://provider.invalid/secret", fromPrice: 99 }), {
    id: "42", idTypeId: "0", name: "Test Hotel", city: null, state: null, addressLine1: null,
    distanceMiles: null, rating: null, reviewCount: null, currency: null, fromPrice: 99,
  });
});

test("property handoff uses TI attribution and never includes a raw destination", () => {
  const parsed = parseTravelSearchInput({ destination: "Spokane, WA", checkin: "2026-09-10", checkout: "2026-09-12" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const href = buildTravelPropertyHandoff({
    tiOrigin: "https://www.tournamentinsights.com",
    hotel: { id: "42", idTypeId: "0", name: "Test", city: null, state: null, addressLine1: null, distanceMiles: null, rating: null, reviewCount: null, currency: "USD", fromPrice: 99 },
    search: parsed.value,
    lodgingSearchId: venueId,
  });
  const url = new URL(href);
  assert.equal(url.pathname, "/go/hotels/property");
  assert.equal(url.searchParams.get("source"), RI_TRAVEL_SOURCE);
  assert.equal(url.searchParams.get("request_source"), RI_TRAVEL_SOURCE);
  assert.equal(url.searchParams.get("page_type"), "referee");
  assert.equal(url.searchParams.get("custom8"), RI_TRAVEL_CUSTOM8);
  assert.equal(url.searchParams.get("destination"), null);
  assert.equal(url.searchParams.get("ss"), null);
});
