import assert from "node:assert/strict";
import test from "node:test";

import { isProductSectionActive, PRODUCT_NAV_ITEMS } from "./productShell";

test("product navigation exposes the three required destinations in order", () => {
  assert.deepEqual(PRODUCT_NAV_ITEMS, [
    { href: "/", label: "This Weekend", key: "weekend" },
    { href: "/upcoming", label: "Upcoming", key: "upcoming" },
    { href: "/family", label: "Family", key: "family" },
  ]);
});

test("only the selected product section is active", () => {
  for (const current of PRODUCT_NAV_ITEMS) {
    const activeItems = PRODUCT_NAV_ITEMS.filter((item) => isProductSectionActive(current.key, item.key));
    assert.deepEqual(activeItems.map((item) => item.key), [current.key]);
  }
});
