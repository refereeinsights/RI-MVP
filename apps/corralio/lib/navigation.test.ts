import assert from "node:assert/strict";
import test from "node:test";

import { buildNavigationLinks } from "./navigation";

test("navigation links encode only the authorized event location", () => {
  const links = buildNavigationLinks("123 Main St, Spokane, WA");
  assert.deepEqual(links, {
    appleMaps: "https://maps.apple.com/?daddr=123%20Main%20St%2C%20Spokane%2C%20WA",
    googleMaps: "https://www.google.com/maps/dir/?api=1&destination=123%20Main%20St%2C%20Spokane%2C%20WA",
    waze: "https://waze.com/ul?q=123%20Main%20St%2C%20Spokane%2C%20WA&navigate=yes",
  });
  assert.equal(buildNavigationLinks("  "), null);
});
