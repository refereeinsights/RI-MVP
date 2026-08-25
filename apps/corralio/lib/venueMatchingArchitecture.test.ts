import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relative: string) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

const adapter = source("./venueMatching.server.ts");
const migration = source("../../../supabase/migrations/20260825_corralio_slice44_location_foundation.sql");

test("venue adapter reads only the trusted view and paginates complete state scopes", () => {
  assert.match(adapter, /\.from\("venues_public"\)/);
  assert.doesNotMatch(adapter, /\.from\("venues"\)/);
  assert.match(adapter, /\.eq\("state", state\)[\s\S]*?\.order\("id"[\s\S]*?\.range\(/);
  assert.doesNotMatch(adapter, /\.ilike\("city"/);
  assert.doesNotMatch(adapter, /\.limit\(5000\)|latitude|longitude|location_lat|location_lng/);
});

test("match persistence contains provenance only and cannot overwrite event geocodes", () => {
  const upsert = adapter.slice(adapter.indexOf("corralio_event_venue_matches"));
  assert.match(upsert, /location_fingerprint/);
  assert.doesNotMatch(upsert, /raw_location_text|location_lat|location_lng|estimated_drive_minutes/);
});

test("migration enforces household-safe cardinality, coherent states, RLS, and service-only access", () => {
  assert.match(migration, /unique \(household_id, id\)/i);
  assert.match(migration, /primary key[\s\S]*foreign key \(household_id, event_id\)[\s\S]*on delete cascade/i);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /references public\.venues|raw_location_text|latitude|longitude/);
});
