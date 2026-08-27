import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const prompt = readFileSync(
  new URL("../../../docs/prompts/corralio-slice-3.5-mobile-experience-hardening.md", import.meta.url),
  "utf8",
);

test("mobile primary actions preserve the established 44px touch-target floor", () => {
  assert.match(styles, /\.passwordInputRow button \{[^}]*min-height: 44px/);
  assert.match(styles, /\.passwordLabelRow a \{[^}]*min-height: 44px/);
  assert.match(styles, /\.whatFitsModes button \{[^}]*min-height: 44px/);
  assert.match(styles, /\.whatFitsActionRow button, \.whatFitsSeeMore \{[^}]*min-height: 44px/);
  assert.match(styles, /\.whatFitsModes button\.active \{ color: var\(--link\); \}/);
  assert.match(styles, /\.whatFitsSeeMore \{ border-color: var\(--link\); color: var\(--link\); \}/);
  assert.match(styles, /\.sourceAssignment \{ color: var\(--accent\);/);
});

test("the canonical mobile prompt preserves automated and physical evidence boundaries", () => {
  assert.match(prompt, /mobile-sized browser experience/);
  assert.match(prompt, /UNVERIFIED ON PHYSICAL DEVICE/);
  assert.match(prompt, /Do not add or modify analytics schemas/);
  assert.match(prompt, /openrouteservice calls/i);
  assert.doesNotMatch(prompt, /feel excellent on a real phone/);
});
