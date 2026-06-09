import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlannerGuestShareToken,
  buildPlannerGuestShareUrl,
  generatePlannerGuestShareTokenNonce,
  hashPlannerGuestShareToken,
} from "./guestShares";

test("planner guest share tokens hash to stable 64-char sha256 hex", () => {
  const originalSecret = process.env.TI_GUEST_SHARE_SECRET;
  process.env.TI_GUEST_SHARE_SECRET = "test-secret";

  try {
    const token = buildPlannerGuestShareToken({
      ownerUserId: "owner-123",
      scopeType: "family",
      scopeTargetId: null,
      tokenNonce: "nonce-abc",
      tokenVersion: "2026-06-09T00:00:00.000Z",
    });

    const hash = hashPlannerGuestShareToken(token);
    assert.match(token, /^nonce-abc\./);
    assert.match(hash, /^[0-9a-f]{64}$/);
  } finally {
    process.env.TI_GUEST_SHARE_SECRET = originalSecret;
  }
});

test("planner guest share token changes when nonce or token version changes", () => {
  const originalSecret = process.env.TI_GUEST_SHARE_SECRET;
  process.env.TI_GUEST_SHARE_SECRET = "test-secret";

  try {
    const base = {
      ownerUserId: "owner-123",
      scopeType: "family" as const,
      scopeTargetId: null,
    };

    const tokenA = buildPlannerGuestShareToken({
      ...base,
      tokenNonce: "nonce-a",
      tokenVersion: "2026-06-09T00:00:00.000Z",
    });
    const tokenB = buildPlannerGuestShareToken({
      ...base,
      tokenNonce: "nonce-b",
      tokenVersion: "2026-06-09T00:00:00.000Z",
    });
    const tokenC = buildPlannerGuestShareToken({
      ...base,
      tokenNonce: "nonce-a",
      tokenVersion: "2026-06-09T01:00:00.000Z",
    });

    assert.notEqual(tokenA, tokenB);
    assert.notEqual(tokenA, tokenC);
    assert.notEqual(hashPlannerGuestShareToken(tokenA), hashPlannerGuestShareToken(tokenB));
  } finally {
    process.env.TI_GUEST_SHARE_SECRET = originalSecret;
  }
});

test("planner guest share helpers build url-safe nonce and shared urls", () => {
  const nonce = generatePlannerGuestShareTokenNonce();
  assert.ok(nonce.length >= 43);
  assert.match(nonce, /^[A-Za-z0-9_-]+$/);

  const shareUrl = buildPlannerGuestShareUrl("https://www.tournamentinsights.com/", "abc.def");
  assert.equal(shareUrl, "https://www.tournamentinsights.com/weekend-planner/shared/abc.def");
});
