import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relative: string) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

const migration = source("../../../supabase/migrations/20260825_corralio_slice44c_provisional_lifecycle_evidence.sql");
const adapter = source("./provisionalVenues.server.ts");
const evidence = source("./provisionalVenueEvidence.ts");
const quickCheck = source("../../ti-web/app/api/venue-quick-check/route.ts");
const report = source("../../../scripts/analysis/corralio_slice44c_venue_quality.ts");
const catalogVerifier = source("../../../scripts/analysis/corralio_slice44c_catalog_verification.sql");
const behavioralVerifier = source("../../../scripts/analysis/corralio_slice44c_behavioral_verification.sql");

test("4.4C preserves isolated lifecycle vocabulary and does not create canonical venues", () => {
  assert.match(migration, /lifecycle_status in \('active', 'suppressed', 'merged', 'reconciled'\)/);
  assert.match(migration, /merged_into_provisional_id uuid/);
  assert.match(migration, /canonical_venue_id uuid/);
  assert.doesNotMatch(migration, /lifecycle_status in \([^)]*promoted|insert into public\.venues\s*\(/);
  assert.match(migration, /drop function public\.corralio_create_or_reuse_provisional_venue_v1/);
  assert.match(migration, /create function public\.corralio_create_or_reuse_provisional_venue_v2/);
});

test("production evidence is ICS-only, typed, bounded, and function-written", () => {
  const evidenceTable = migration.match(/create table public\.corralio_provisional_venue_evidence \([\s\S]*?\n\);/)?.[0] ?? "";
  assert.ok(evidenceTable);
  assert.match(migration, /create table public\.corralio_provisional_venue_evidence/);
  assert.match(migration, /check \(evidence_type = 'ics_observation'\)/);
  assert.match(migration, /unique \(provisional_venue_id, observation_fingerprint\)/);
  assert.match(migration, /revoke all on table public\.corralio_provisional_venue_evidence[\s\S]*grant select[\s\S]*to service_role/);
  assert.doesNotMatch(evidenceTable, /jsonb|strong_evidence|source_url|household_id|schedule_source_id|event_description/i);
  assert.doesNotMatch(migration, /create function[^;]*(?:insert|record).*evidence_type/i);
});

test("keyed fingerprints are server-only and runtime has no unsafe fallback", () => {
  assert.match(evidence, /createHmac\("sha256"/);
  assert.match(evidence, /ics-source-scope/);
  assert.match(evidence, /ics-observation/);
  assert.match(adapter, /CORRALIO_EVIDENCE_FINGERPRINT_KEY/);
  assert.match(adapter, /Provisional venue evidence configuration missing/);
  assert.doesNotMatch(adapter, /source_url|browser_hash|venue_notes|quick_check/i);
});

test("quick-check is correctly excluded as unauthenticated strong evidence", () => {
  assert.doesNotMatch(quickCheck, /auth\.getUser|getUser\(\)|requireAuth|authenticated user/i);
  assert.match(quickCheck, /browser_hash/);
  assert.match(quickCheck, /venue_notes/);
  assert.doesNotMatch(migration, /quick_check_verification[^\n]*check \(evidence_type/);
  assert.doesNotMatch(adapter, /quick_check_verification|overture_place_match|trusted_ti_ri_verification/);
});

test("lifecycle operations are atomic, audited, redirected, and narrow", () => {
  assert.match(migration, /create table public\.corralio_provisional_venue_transitions/);
  assert.match(migration, /grant select on table public\.corralio_provisional_venue_transitions to service_role/);
  assert.doesNotMatch(migration, /grant (?:update|delete|insert)[^;]*corralio_provisional_venue_transitions[^;]*service_role/i);
  assert.match(migration, /create function public\.corralio_suppress_provisional_venue_v2[\s\S]*insert into public\.corralio_provisional_venue_transitions/);
  assert.match(migration, /create function public\.corralio_merge_provisional_venue_exact_v1/);
  assert.match(migration, /create function public\.corralio_merge_provisional_venue_trusted_v1/);
  assert.match(migration, /p_reason_code = 'trusted_manual_duplicate'/);
  assert.match(migration, /create function public\.corralio_reconcile_provisional_venue_v1/);
  assert.match(migration, /where provisional_venue_id = p_provisional_venue_id/);
  assert.match(migration, /reconciled_canonical|redirected_provisional|suppressed/);
});

test("eligibility is derived and the production report remains aggregate-only", () => {
  assert.match(migration, /create function public\.corralio_provisional_venue_promotion_eligible_v1/);
  assert.match(migration, /With ICS-only production evidence, the correct result is false/);
  assert.doesNotMatch(migration, /add column promotion_eligible|promotion_eligible boolean/);
  assert.match(report, /promotionEligibleCount/);
  assert.match(report, /distinctIcsSourceScopeCountDistribution/);
  assert.doesNotMatch(report, /console\.log\([^)]*(?:source_scope_fingerprint|source_location_text|event_id)/);
});

test("all 4.4C functions use fixed paths and untrusted execution is revoked", () => {
  const functions = migration.match(/create function public\.corralio_[\s\S]*?\$function\$;/g) ?? [];
  assert.ok(functions.length >= 7);
  for (const fn of functions) assert.match(fn, /set search_path = pg_catalog, public/);
  assert.match(migration, /from public, anon, authenticated/g);
  assert.doesNotMatch(migration, /grant execute[^;]*to (?:public|anon|authenticated)/);
});

test("Stage 2 verification is machine-failing, rollback-only, and network-free", () => {
  assert.match(catalogVerifier, /raise exception '4\.4C catalog failed:/);
  assert.match(catalogVerifier, /SLICE 4\.4C CATALOG VERIFICATION PASSED/);
  assert.match(behavioralVerifier, /^-- Rollback-only[\s\S]*\nbegin;/);
  assert.match(behavioralVerifier, /rollback;[\s\S]*ROLLBACK CLEANUP ZERO/);
  assert.match(behavioralVerifier, /source deletion erased anonymized evidence history/);
  assert.match(behavioralVerifier, /lifecycle state committed without transition/);
  assert.doesNotMatch(
    behavioralVerifier,
    /fetch\(|api\.geocod\.io|api\.openrouteservice\.org|api\.mapbox\.com|overturemaps\.org/i,
  );
});
