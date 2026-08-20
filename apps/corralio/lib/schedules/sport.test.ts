import assert from "node:assert/strict";
import test from "node:test";

import {
  CORRALIO_SPORTS,
  corralioSportIcon,
  corralioSportLabel,
  parseCorralioSport,
} from "./sport";

test("source sports use the bounded Corralio taxonomy", () => {
  assert.deepEqual(CORRALIO_SPORTS, [
    "baseball", "softball", "soccer", "basketball", "volleyball",
    "hockey", "lacrosse", "football", "tennis", "swimming",
    "gymnastics", "track_field", "golf", "wrestling", "cheer",
    "dance", "other",
  ]);
  assert.equal(parseCorralioSport(" Soccer "), "soccer");
  assert.equal(parseCorralioSport("Tennis"), "tennis");
  assert.equal(parseCorralioSport("Track_Field"), "track_field");
  assert.equal(parseCorralioSport("curling"), null);
  assert.equal(parseCorralioSport(""), null);
  assert.equal(corralioSportLabel("volleyball"), "Volleyball");
  assert.equal(corralioSportIcon("softball"), "🥎");
});

test("broader sports use exact presentation-only labels and icons", () => {
  const expected = {
    tennis: ["Tennis", "🎾"],
    swimming: ["Swimming", "🏊"],
    gymnastics: ["Gymnastics", "🤸"],
    track_field: ["Track & Field", "🏃"],
    golf: ["Golf", "⛳"],
    wrestling: ["Wrestling", "🤼"],
    cheer: ["Cheer", "📣"],
    dance: ["Dance", "💃"],
  } as const;

  for (const [sport, [label, icon]] of Object.entries(expected)) {
    const token = parseCorralioSport(sport);
    assert.ok(token);
    assert.equal(corralioSportLabel(token), label);
    assert.equal(corralioSportIcon(token), icon);
  }
  assert.equal(corralioSportLabel("other"), "Other");
  assert.equal(corralioSportIcon("other"), "🏅");
});
