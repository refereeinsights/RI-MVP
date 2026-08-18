import test from "node:test";
import assert from "node:assert/strict";

import { verifyTournamentHotelContext } from "../lodging/tournamentHotelContext";
import { buildTournamentHotelsHref } from "./tournamentTravelLinks";

const tournamentId = "11111111-1111-4111-8111-111111111111";

test("tournament-specific hotel links include a server-issued tournament-bound context", () => {
  const previousSecret = process.env.TI_HOTEL_CONTEXT_SECRET;
  process.env.TI_HOTEL_CONTEXT_SECRET = "test-only-tournament-link-secret";
  try {
    const href = buildTournamentHotelsHref({
      source: "tournament_directory",
      tournamentId,
      city: "Denver",
      state: "CO",
    });
    const url = new URL(href, "https://www.tournamentinsights.com");
    assert.equal(url.searchParams.get("tournamentId"), tournamentId);
    assert.equal(url.searchParams.get("ss"), "Denver, CO");
    assert.equal(
      verifyTournamentHotelContext(url.searchParams.get("tournament_context"), tournamentId).ok,
      true
    );
  } finally {
    if (previousSecret === undefined) delete process.env.TI_HOTEL_CONTEXT_SECRET;
    else process.env.TI_HOTEL_CONTEXT_SECRET = previousSecret;
  }
});

test("missing signing configuration keeps tournament links functional but non-authoritative", () => {
  const previousContextSecret = process.env.TI_HOTEL_CONTEXT_SECRET;
  const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.TI_HOTEL_CONTEXT_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const href = buildTournamentHotelsHref({
      source: "tournament_directory",
      tournamentId,
      city: "Denver",
      state: "CO",
    });
    const url = new URL(href, "https://www.tournamentinsights.com");
    assert.equal(url.searchParams.has("tournament_context"), false);
  } finally {
    if (previousContextSecret === undefined) delete process.env.TI_HOTEL_CONTEXT_SECRET;
    else process.env.TI_HOTEL_CONTEXT_SECRET = previousContextSecret;
    if (previousServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
  }
});
