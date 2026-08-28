import assert from "node:assert/strict";
import test from "node:test";

import { extractIcsTextProperty } from "./icsProperty";

test("extracts only plain or parameterized string ICS properties", () => {
  assert.equal(extractIcsTextProperty("Plain text"), "Plain text");
  assert.equal(extractIcsTextProperty({ params: { LANGUAGE: "en-us" }, val: "Parameterized text" }), "Parameterized text");
  assert.equal(extractIcsTextProperty({ params: { LANGUAGE: "en-us" } }), "");
  assert.equal(extractIcsTextProperty({ val: 42 }), "");
  assert.equal(extractIcsTextProperty({ val: { nested: true } }), "");
  assert.equal(extractIcsTextProperty(null), "");
});
