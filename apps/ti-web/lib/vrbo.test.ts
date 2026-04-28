import test from "node:test";
import assert from "node:assert/strict";
import { buildCjVrboUrl, buildVrboSearchUrl } from "./vrbo";

test("buildVrboSearchUrl: includes destination and latLong and dates when valid", () => {
  const url = buildVrboSearchUrl({
    destination: "Tukwila, WA, United States",
    latitude: 47.4569,
    longitude: -122.2703,
    checkin: "2099-06-01",
    checkout: "2099-06-04",
    adults: 2,
  });
  assert.match(url, /^https:\/\/www\.vrbo\.com\/search\?/);
  assert.ok(url.includes("destination=Tukwila%2C+WA%2C+United+States"));
  assert.ok(url.includes("latLong=47.4569%2C-122.2703") || url.includes("latLong=47.4569,-122.2703"));
  assert.ok(url.includes("startDate=2099-06-01"));
  assert.ok(url.includes("endDate=2099-06-04"));
});

test("buildVrboSearchUrl: omits dates when checkin is in the past", () => {
  const url = buildVrboSearchUrl({
    destination: "Spokane, WA, United States",
    checkin: "2000-01-01",
    checkout: "2000-01-03",
  });
  assert.ok(!url.includes("startDate="));
  assert.ok(!url.includes("endDate="));
});

test("buildCjVrboUrl: fails when env vars missing", () => {
  const oldPub = process.env.VRBO_CJ_PUBLISHER_ID;
  const oldLink = process.env.VRBO_CJ_LINK_ID;
  delete process.env.VRBO_CJ_PUBLISHER_ID;
  delete process.env.VRBO_CJ_LINK_ID;
  const res = buildCjVrboUrl("https://www.vrbo.com/search?destination=X");
  assert.equal(res.ok, false);
  process.env.VRBO_CJ_PUBLISHER_ID = oldPub;
  process.env.VRBO_CJ_LINK_ID = oldLink;
});

