import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("RI travel keeps provider access server-side and uses only the TI property handoff", () => {
  const client = read("../../app/travel/TravelSearchClient.tsx");
  const server = read("./travelHotels.server.ts");
  assert.match(client, /fetch\("\/api\/travel\/hotels"/);
  assert.doesNotMatch(client, /HotelPlanner|Mapbox|detailUrl|destination.*searchParams/i);
  assert.match(server, /\/api\/lodging\/search/);
  assert.doesNotMatch(server, /HOTELPLANNER_API_KEY|MAPBOX/);
});

test("RI travel analytics and sitemap use the exact bounded vocabulary", () => {
  const client = read("../../app/travel/TravelSearchClient.tsx");
  const events = read("../riAnalyticsEvents.ts");
  const sitemap = read("../sitemaps.ts");
  for (const event of ["ri_travel_page_viewed", "ri_travel_search_submitted", "ri_travel_results_returned"]) {
    assert.match(client, new RegExp(event));
    assert.match(events, new RegExp(event));
  }
  assert.doesNotMatch(client, /destination:/g);
  assert.match(sitemap, /"\/travel"/);
});
