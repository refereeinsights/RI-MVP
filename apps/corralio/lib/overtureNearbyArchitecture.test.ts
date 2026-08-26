import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20260825_corralio_slice45_overture_nearby_foundation.sql", import.meta.url),
  "utf8",
);
const activationRepair = readFileSync(
  new URL("../../../supabase/migrations/20260825_corralio_slice45_activation_completeness_fix.sql", import.meta.url),
  "utf8",
);
const qualityMigration = readFileSync(
  new URL("../../../supabase/migrations/20260825_corralio_slice45a_candidate_quality_hardening.sql", import.meta.url),
  "utf8",
);
const qualityCatalogVerifier = readFileSync(
  new URL("../../../scripts/analysis/corralio_slice45a_catalog_verification.sql", import.meta.url),
  "utf8",
);
const qualityBehavioralVerifier = readFileSync(
  new URL("../../../scripts/analysis/corralio_slice45a_behavioral_verification.sql", import.meta.url),
  "utf8",
);
const behavioralVerifier = readFileSync(
  new URL("../../../scripts/analysis/corralio_slice45_behavioral_verification.sql", import.meta.url),
  "utf8",
);
const runtime = readFileSync(new URL("./overtureNearby.server.ts", import.meta.url), "utf8");

test("uses explicit exactly-one venue identities and trusted canonical coordinates", () => {
  assert.match(migration, /canonical_venue_id uuid null/);
  assert.match(migration, /provisional_venue_id uuid null[\s\S]*references public\.corralio_provisional_venues/);
  assert.match(migration, /canonical_venue_id is not null\)::integer[\s\S]*provisional_venue_id is not null\)::integer = 1/);
  assert.match(migration, /corralio_read_canonical_venue_coordinate_v1/);
  assert.doesNotMatch(migration, /create or replace view public\.venues_public/);
});

test("storage separates feature identity, release, version, and existence confidence", () => {
  assert.match(migration, /overture_feature_id text not null/);
  assert.match(migration, /overture_release text not null/);
  assert.match(migration, /overture_feature_version bigint not null/);
  assert.match(migration, /overture_existence_confidence double precision not null/);
  assert.doesNotMatch(migration, /match_confidence/);
});

test("4.5A preserves broad pools and adds constrained intent and operating status", () => {
  assert.match(qualityMigration, /add column intent_category text null/);
  assert.match(qualityMigration, /'quick_service', 'pizza', 'sandwiches', 'coffee', 'brewery', 'other_food'/);
  assert.match(qualityMigration, /category = 'coffee' and intent_category = 'coffee'/);
  assert.match(qualityMigration, /confirmed_open', 'confirmed_closed', 'status_unknown/);
  assert.match(qualityMigration, /candidate-quality-legacy-v0/);
  assert.match(qualityMigration, /dedupe-legacy-v0/);
  assert.match(qualityMigration, /corralio-overture-candidate-quality-v1/);
  assert.match(qualityMigration, /corralio-overture-dedupe-v1/);
  assert.match(qualityMigration, /corralio_overture_refresh_scopes scope/);
  assert.doesNotMatch(qualityMigration, /update public\.venues|insert into public\.venues/);
});

test("4.5A food tags are constrained, provenance-linked, service-only metadata", () => {
  assert.match(qualityMigration, /create table public\.corralio_overture_candidate_food_tags/);
  assert.match(qualityMigration, /primary key \(candidate_id, food_tag\)/);
  assert.match(qualityMigration, /foreign key \(provenance_id, candidate_id\)/);
  assert.match(qualityMigration, /references public\.corralio_overture_provenance\(id, candidate_id\)[\s\S]*on delete cascade/);
  assert.match(qualityMigration, /'mexican', 'chinese', 'italian', 'japanese',[\s\S]*'sushi', 'american', 'burgers', 'bbq'/);
  assert.match(qualityMigration, /corralio-overture-food-tags-v1/);
  assert.match(qualityMigration, /force row level security/);
  assert.match(qualityMigration, /revoke all on table public\.corralio_overture_candidate_food_tags[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(qualityMigration, /grant select, insert on table public\.corralio_overture_candidate_food_tags[\s\S]*to service_role/);
  assert.doesNotMatch(qualityMigration, /grant (?:select|insert|update|delete)[\s\S]*corralio_overture_candidate_food_tags[\s\S]*to authenticated/);
  assert.match(runtime, /deriveAcceptedOvertureFoodTags/);
  assert.match(runtime, /corralio_overture_candidate_food_tags/);
});

test("4.5A verifiers split catalog/database behavior from pure TypeScript classification", () => {
  assert.match(qualityCatalogVerifier, /SLICE 4\.5A CATALOG VERIFICATION PASSED/);
  assert.match(qualityBehavioralVerifier, /SLICE 4\.5A BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO/);
  assert.match(qualityBehavioralVerifier, /invalid pool\/intent coherence unexpectedly accepted/);
  assert.match(qualityBehavioralVerifier, /unsupported food tag unexpectedly accepted/);
  assert.match(qualityBehavioralVerifier, /pool\/tag incoherence unexpectedly accepted/);
  assert.match(qualityBehavioralVerifier, /failed refresh did not preserve prior typed pool and food tags/);
});

test("normalizes provenance and excludes unapproved Foursquare", () => {
  assert.match(migration, /create table public\.corralio_overture_provenance/);
  assert.match(migration, /lower\(dataset\) <> 'foursquare'/);
  assert.match(runtime, /normalizeOvertureProvenance/);
});

test("refresh is staged, bounded, atomic, and failure preserving", () => {
  assert.match(migration, /status in \('staging', 'active', 'failed'\)/);
  assert.match(migration, /create table public\.corralio_overture_refresh_scopes/);
  assert.match(migration, /create function public\.corralio_activate_overture_refresh_v1/);
  assert.match(migration, /from public\.corralio_overture_refresh_scopes scope/);
  assert.match(migration, /create function public\.corralio_fail_overture_refresh_v1/);
  assert.match(activationRepair, /not exists \([\s\S]*corralio_overture_provenance provenance/);
  assert.match(activationRepair, /having count\(\*\) > v_refresh\.max_candidates_per_category/);
  assert.match(runtime, /if \(input\.dryRun\) return aggregate/);
});

test("server adapter has no household-origin inputs or query", () => {
  assert.doesNotMatch(runtime, /household|origin_address|origin_lat|origin_lng/);
  assert.match(runtime, /SupabaseClient/);
  assert.match(runtime, /corralio_read_canonical_venue_coordinate_v1/);
  assert.match(runtime, /\.eq\("lifecycle_status", "active"\)/);
  assert.match(runtime, /corralio_activate_overture_refresh_v1/);
});

test("behavioral verification sequences activation before observing state", () => {
  const activation = behavioralVerifier.indexOf("v_activated := public.corralio_activate_overture_refresh_v1");
  const stateCheck = behavioralVerifier.indexOf("atomic activation state was not visible");
  assert.ok(activation >= 0 && stateCheck > activation);
  assert.doesNotMatch(behavioralVerifier, /if not public\.corralio_activate_overture_refresh_v1/);
  assert.match(behavioralVerifier, /rollback;/);
});
