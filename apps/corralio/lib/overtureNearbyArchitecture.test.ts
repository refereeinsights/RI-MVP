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
