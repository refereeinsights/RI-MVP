import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relative: string) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

const migration = source("../../../supabase/migrations/20260825_corralio_slice44b_shared_provisional_venues.sql");
const foundation = source("../../../supabase/migrations/20260825_corralio_slice44_location_foundation.sql");
const adapter = source("./provisionalVenues.server.ts");
const leaveBy = source("./leaveBy.server.ts");

test("provisional storage is structurally separate, forced-RLS, and service-only", () => {
  assert.match(migration, /create table public\.corralio_provisional_venues/);
  assert.doesNotMatch(migration, /alter table public\.venues|insert into public\.venues/);
  assert.match(migration, /enable row level security[\s\S]*force row level security/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant select[\s\S]*to authenticated/);
});

test("association states enforce canonical/provisional exclusivity and cascading private evidence", () => {
  assert.match(migration, /add column provisional_venue_id uuid/);
  assert.match(migration, /match_status = 'matched'[\s\S]*provisional_venue_id is null/);
  assert.match(migration, /match_status = 'provisional'[\s\S]*venue_id is null[\s\S]*provisional_venue_id is not null/);
  assert.match(migration, /references public\.corralio_provisional_venues\(id\)[\s\S]*on delete restrict/);
  assert.match(foundation, /references public\.corralio_events[\s\S]*on delete cascade/);
});

test("trusted RPC is atomic, ICS/geocode gated, and preserves suppression tombstones", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_event\.origin_type <> 'ics'/);
  assert.match(migration, /v_event\.location_geocoded_at is null/);
  assert.match(migration, /v_match\.match_status <> 'unmatched'/);
  assert.match(migration, /lifecycle_status = 'suppressed'/);
  assert.match(migration, /security invoker[\s\S]*set search_path = pg_catalog, public/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
});

test("runtime reuses persisted geocodes and keeps enrichment best effort", () => {
  assert.match(adapter, /location_geocoded_at/);
  assert.match(adapter, /corralio_create_or_reuse_provisional_venue_v1/);
  assert.doesNotMatch(adapter, /source_url|notes|field_label|fetch\(|GEOCODIO_API_KEY|OPENROUTESERVICE_API_KEY|overture|mapbox/i);
  assert.match(leaveBy, /matchPersistedCorralioEventIds/);
  assert.match(leaveBy, /post-geocode evaluation failed/);
});
