import assert from "node:assert/strict";
import test from "node:test";

import { buildTeamHotelTournamentCalloutConfig } from "./teamHotelTournamentCallout";

test("buildTeamHotelTournamentCalloutConfig returns the secondary tournament callout contract", () => {
  const config = buildTeamHotelTournamentCalloutConfig();

  assert.equal(config.headline, "Traveling with the whole team?");
  assert.equal(config.label, "Request team hotel options →");
  assert.equal(config.target, "_blank");
  assert.equal(config.rel, "noopener noreferrer");
  assert.equal(config.title, "Request team hotel options");
});
