import { createHmac } from "node:crypto";

export const CORRALIO_EVIDENCE_FINGERPRINT_VERSION = "corralio-evidence-hmac-v1";
export const CORRALIO_ELIGIBILITY_RULE_VERSION = "corralio-promotion-eligibility-v1";

export type EligibilityEvidenceSignal =
  | "ics_observation"
  | "quick_check_verification"
  | "overture_place_match"
  | "trusted_ti_ri_verification";

const FUTURE_STRONG_EVIDENCE = new Set<EligibilityEvidenceSignal>([
  "overture_place_match",
  "trusted_ti_ri_verification",
]);

function bounded(value: string, max: number) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new Error("Invalid evidence fingerprint input");
  return trimmed;
}

function keyedFingerprint(key: string, domain: string, values: readonly string[]) {
  const secret = bounded(key, 4096);
  if (secret.length < 32) throw new Error("Evidence fingerprint key must contain at least 32 characters");
  const hmac = createHmac("sha256", secret);
  hmac.update(CORRALIO_EVIDENCE_FINGERPRINT_VERSION);
  hmac.update("\0");
  hmac.update(domain);
  for (const value of values) {
    hmac.update("\0");
    hmac.update(value);
  }
  return hmac.digest("hex");
}

export function buildIcsEvidenceFingerprints(input: {
  key: string;
  sourceId: string;
  sourceEventUid: string;
  provisionalIdentityKey: string;
}) {
  const sourceId = bounded(input.sourceId, 80);
  const sourceEventUid = bounded(input.sourceEventUid, 500);
  const identityKey = bounded(input.provisionalIdentityKey, 64);
  if (!/^[0-9a-f]{64}$/.test(identityKey)) throw new Error("Invalid provisional identity key");
  return {
    fingerprintVersion: CORRALIO_EVIDENCE_FINGERPRINT_VERSION,
    sourceScopeFingerprint: keyedFingerprint(input.key, "ics-source-scope", [sourceId]),
    observationFingerprint: keyedFingerprint(input.key, "ics-observation", [sourceId, sourceEventUid, identityKey]),
  };
}

export function evaluateProvisionalPromotionEligibilityV1(input: {
  lifecycleStatus: "active" | "suppressed" | "merged" | "reconciled";
  evidenceTypes: readonly EligibilityEvidenceSignal[];
  hasIdentityConflict: boolean;
  hasPrivacyBlocker: boolean;
  identityCoherent: boolean;
}) {
  const strongEvidenceTypes = [...new Set(input.evidenceTypes.filter((type) => FUTURE_STRONG_EVIDENCE.has(type)))];
  return {
    ruleVersion: CORRALIO_ELIGIBILITY_RULE_VERSION,
    strongEvidenceTypes,
    eligible: input.lifecycleStatus === "active"
      && input.identityCoherent
      && !input.hasIdentityConflict
      && !input.hasPrivacyBlocker
      && strongEvidenceTypes.length > 0,
  };
}
