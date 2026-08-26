import assert from "node:assert/strict";
import test from "node:test";

import {
  currentOvertureEnrichmentIdentities,
  overtureVenueIdentityKey,
} from "./overtureQualityMetrics";

test("builds explicit canonical and provisional identity keys", () => {
  assert.equal(overtureVenueIdentityKey({ canonical_venue_id: "canonical-1" }), "canonical:canonical-1");
  assert.equal(overtureVenueIdentityKey({ provisional_venue_id: "provisional-1" }), "provisional:provisional-1");
  assert.equal(overtureVenueIdentityKey({}), null);
});

test("uses activated scopes as the venue denominator, including empty pools", () => {
  const refreshes = [
    { id: "refresh-1", status: "active", completed_at: "2026-08-25T10:00:00Z" },
  ];
  const scopes = [
    { refresh_id: "refresh-1", canonical_venue_id: "venue-1", category: "food" },
    { refresh_id: "refresh-1", canonical_venue_id: "venue-1", category: "coffee" },
    { refresh_id: "refresh-1", provisional_venue_id: "venue-2", category: "food" },
    { refresh_id: "refresh-1", provisional_venue_id: "venue-2", category: "coffee" },
  ];

  assert.deepEqual(currentOvertureEnrichmentIdentities(refreshes, scopes), [
    "canonical:venue-1",
    "provisional:venue-2",
  ]);
});

test("ignores failed/staging scopes and superseded activated scopes", () => {
  const refreshes = [
    { id: "old", status: "active", completed_at: "2026-08-25T10:00:00Z" },
    { id: "new", status: "active", completed_at: "2026-08-26T10:00:00Z" },
    { id: "failed", status: "failed", completed_at: "2026-08-27T10:00:00Z" },
    { id: "staging", status: "staging", completed_at: null },
  ];
  const scopes = [
    { refresh_id: "old", canonical_venue_id: "venue-1", category: "food" },
    { refresh_id: "new", canonical_venue_id: "venue-1", category: "food" },
    { refresh_id: "failed", canonical_venue_id: "venue-2", category: "food" },
    { refresh_id: "staging", canonical_venue_id: "venue-3", category: "coffee" },
  ];

  assert.deepEqual(currentOvertureEnrichmentIdentities(refreshes, scopes), ["canonical:venue-1"]);
});
