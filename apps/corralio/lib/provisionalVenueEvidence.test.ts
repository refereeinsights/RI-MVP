import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIcsEvidenceFingerprints,
  CORRALIO_ELIGIBILITY_RULE_VERSION,
  evaluateProvisionalPromotionEligibilityV1,
} from "./provisionalVenueEvidence";

const key = "synthetic-test-key-that-is-never-used-outside-offline-tests";

test("ICS evidence fingerprints are deterministic, scoped, versioned, and non-raw", () => {
  const first = buildIcsEvidenceFingerprints({
    key,
    sourceId: "source-a",
    sourceEventUid: "private-event-uid",
    provisionalIdentityKey: "a".repeat(64),
  });
  const repeated = buildIcsEvidenceFingerprints({
    key,
    sourceId: "source-a",
    sourceEventUid: "private-event-uid",
    provisionalIdentityKey: "a".repeat(64),
  });
  const otherEvent = buildIcsEvidenceFingerprints({
    key,
    sourceId: "source-a",
    sourceEventUid: "other-event-uid",
    provisionalIdentityKey: "a".repeat(64),
  });
  const otherSource = buildIcsEvidenceFingerprints({
    key,
    sourceId: "source-b",
    sourceEventUid: "private-event-uid",
    provisionalIdentityKey: "a".repeat(64),
  });

  assert.deepEqual(first, repeated);
  assert.equal(first.sourceScopeFingerprint, otherEvent.sourceScopeFingerprint);
  assert.notEqual(first.observationFingerprint, otherEvent.observationFingerprint);
  assert.notEqual(first.sourceScopeFingerprint, otherSource.sourceScopeFingerprint);
  assert.match(first.sourceScopeFingerprint, /^[0-9a-f]{64}$/);
  assert.match(first.observationFingerprint, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(first), /source-a|private-event-uid/);
});

test("fingerprinting refuses missing, short, or invalid trusted inputs", () => {
  assert.throws(() => buildIcsEvidenceFingerprints({ key: "short", sourceId: "source", sourceEventUid: "event", provisionalIdentityKey: "a".repeat(64) }));
  assert.throws(() => buildIcsEvidenceFingerprints({ key, sourceId: "", sourceEventUid: "event", provisionalIdentityKey: "a".repeat(64) }));
  assert.throws(() => buildIcsEvidenceFingerprints({ key, sourceId: "source", sourceEventUid: "event", provisionalIdentityKey: "not-a-key" }));
});

test("generic ICS volume never satisfies the pure versioned eligibility rule", () => {
  const result = evaluateProvisionalPromotionEligibilityV1({
    lifecycleStatus: "active",
    evidenceTypes: Array.from({ length: 20 }, () => "ics_observation" as const),
    hasIdentityConflict: false,
    hasPrivacyBlocker: false,
    identityCoherent: true,
  });
  assert.equal(result.ruleVersion, CORRALIO_ELIGIBILITY_RULE_VERSION);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.strongEvidenceTypes, []);
});

test("future strong evidence is tested only at the pure rule boundary", () => {
  const eligible = evaluateProvisionalPromotionEligibilityV1({
    lifecycleStatus: "active",
    evidenceTypes: ["ics_observation", "overture_place_match"],
    hasIdentityConflict: false,
    hasPrivacyBlocker: false,
    identityCoherent: true,
  });
  assert.equal(eligible.eligible, true);

  const unauditedQuickCheck = evaluateProvisionalPromotionEligibilityV1({
    lifecycleStatus: "active",
    evidenceTypes: ["quick_check_verification"],
    hasIdentityConflict: false,
    hasPrivacyBlocker: false,
    identityCoherent: true,
  });
  assert.equal(unauditedQuickCheck.eligible, false);

  for (const patch of [
    { lifecycleStatus: "suppressed" as const },
    { hasIdentityConflict: true },
    { hasPrivacyBlocker: true },
    { identityCoherent: false },
  ]) {
    const blocked = evaluateProvisionalPromotionEligibilityV1({
      lifecycleStatus: "active",
      evidenceTypes: ["overture_place_match"],
      hasIdentityConflict: false,
      hasPrivacyBlocker: false,
      identityCoherent: true,
      ...patch,
    });
    assert.equal(blocked.eligible, false);
  }
});
