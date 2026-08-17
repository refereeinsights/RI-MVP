import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { familyColorFromKey } from "./familyColors";
import { SOURCE_COLOR_PALETTE } from "./getSourceColor";

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

test("Rose keeps its persisted key with the accessible fuchsia-family palette", () => {
  const rose = familyColorFromKey("rose");
  assert.deepEqual(rose, {
    main: "#a21caf",
    soft: "#fae8ff",
    text: "#86198f",
    border: "#f0abfc",
  });
  assert.ok(contrastRatio(rose!.text, rose!.soft) >= 4.5);
  assert.ok(contrastRatio("#ffffff", rose!.main) >= 4.5);
});

test("conflict explanation is readable without changing the source-calendar amber", () => {
  const plannerCss = readFileSync(
    new URL("../../app/_components/planner/Planner.module.css", import.meta.url),
    "utf8"
  );
  assert.match(plannerCss, /\.eventConflictNote\s*\{[\s\S]*?color:\s*#8a5c14;/);
  assert.ok(contrastRatio("#8a5c14", "#ffffff") >= 4.5);
  assert.ok(contrastRatio("#8a5c14", "#fff1f2") >= 4.5);
  assert.ok(SOURCE_COLOR_PALETTE.includes("#c9933a"));
});
