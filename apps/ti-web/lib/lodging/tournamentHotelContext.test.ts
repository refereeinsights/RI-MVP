import test from "node:test";
import assert from "node:assert/strict";

import { issueTournamentHotelContext, verifyTournamentHotelContext } from "./tournamentHotelContext";

const secret = "test-only-tournament-hotel-context-secret";
const tournamentId = "11111111-1111-4111-8111-111111111111";
const otherTournamentId = "22222222-2222-4222-8222-222222222222";
const issuedAt = 1_800_000_000;

test("server-issued tournament context verifies only for its bound tournament", () => {
  const token = issueTournamentHotelContext(tournamentId, { secret, nowSeconds: issuedAt, ttlSeconds: 600 });
  assert.ok(token);
  assert.deepEqual(
    verifyTournamentHotelContext(token, tournamentId, { secret, nowSeconds: issuedAt + 60 }),
    { ok: true, tournamentId }
  );
  assert.deepEqual(
    verifyTournamentHotelContext(token, otherTournamentId, { secret, nowSeconds: issuedAt + 60 }),
    { ok: false, reason: "mismatch" }
  );
});

test("missing, tampered, and expired tournament context fails closed", () => {
  const token = issueTournamentHotelContext(tournamentId, { secret, nowSeconds: issuedAt, ttlSeconds: 600 });
  assert.ok(token);
  assert.deepEqual(
    verifyTournamentHotelContext(null, tournamentId, { secret, nowSeconds: issuedAt }),
    { ok: false, reason: "missing" }
  );
  assert.deepEqual(
    verifyTournamentHotelContext(`${token}x`, tournamentId, { secret, nowSeconds: issuedAt }),
    { ok: false, reason: "signature" }
  );
  assert.deepEqual(
    verifyTournamentHotelContext(token, tournamentId, { secret, nowSeconds: issuedAt + 601 }),
    { ok: false, reason: "expired" }
  );
});

test("a tournament ID without a server-issued token is not trusted", () => {
  assert.deepEqual(
    verifyTournamentHotelContext("", tournamentId, { secret, nowSeconds: issuedAt }),
    { ok: false, reason: "missing" }
  );
});
