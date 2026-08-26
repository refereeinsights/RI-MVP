import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relative: string) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

const migration = source("../../../supabase/migrations/20260826_corralio_slice44d_incomplete_ics_venue_resolution.sql");
const matcher = source("./venueMatching.server.ts");

test("4.4D aliases are private service-only validated relationships", () => {
  assert.match(migration, /create table public\.corralio_venue_aliases/);
  assert.match(migration, /canonical_venue_id uuid null references public\.venues\(id\) on delete restrict/);
  assert.match(migration, /provisional_venue_id uuid null[\s\S]*references public\.corralio_provisional_venues\(id\) on delete restrict/);
  assert.match(migration, /corralio_venue_aliases_target_exactly_one_check/);
  assert.match(migration, /unique nulls not distinct \(alias_kind, normalized_alias, normalized_city, state\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.corralio_venue_aliases[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert on table public\.corralio_venue_aliases to service_role/);
  assert.doesNotMatch(migration, /household_id|event_id|source_url|child_id|team_id/);
});

test("4.4D unique canonical name lookup is complete, indexed, and service-only", () => {
  assert.match(migration, /venues_identity_normalized_name_idx/);
  assert.match(migration, /corralio_find_unique_canonical_venue_by_name_v1/);
  assert.match(migration, /limit 2/);
  assert.match(migration, /where \(select count\(\*\) from matches\) = 1/);
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog, public/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
  assert.match(matcher, /corralio_find_unique_canonical_venue_by_name_v1/);
  assert.doesNotMatch(matcher, /overture|foursquare|global search/i);
});

test("4.4D never writes canonical venues", () => {
  assert.doesNotMatch(migration, /insert into public\.venues|update public\.venues|delete from public\.venues/i);
  assert.doesNotMatch(matcher, /\.from\("venues"\)\.(?:insert|update|delete|upsert)/);
});

test("4.4D reprocessing is bounded, dry-run explicit, and aggregate-only", () => {
  assert.match(matcher, /reprocessCorralioVenueMatches/);
  assert.match(matcher, /Math\.max\(1, Math\.min\(input\.maxEvents \?\? 200, 200\)\)/);
  assert.match(matcher, /if \(input\.dryRun\)[\s\S]*eventsReprocessed: 0/);
  assert.match(matcher, /forceRematch: true/);
  assert.doesNotMatch(matcher, /console\.(?:log|info|warn)[^;]*(?:source_location|display_location)/);
});
