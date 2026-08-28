import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../../supabase/migrations/20260828_corralio_slice37_arbiter_schedule_sources.sql", import.meta.url),
  "utf8",
);
const catalogVerifier = readFileSync(
  new URL("../../../../scripts/analysis/corralio_slice37_catalog_verification.sql", import.meta.url),
  "utf8",
);
const behavioralVerifier = readFileSync(
  new URL("../../../../scripts/analysis/corralio_slice37_behavioral_verification.sql", import.meta.url),
  "utf8",
);

test("Slice 3.7 widens only the existing bounded platform constraint", () => {
  assert.match(migration, /drop constraint corralio_schedule_connection_events_platform_check/);
  assert.match(migration, /add constraint corralio_schedule_connection_events_platform_check/);
  for (const platform of ["gamechanger", "teamsnap", "stack_team_app", "arbiterlive", "arbiter_officials", "other"]) {
    assert.match(migration, new RegExp(`'${platform}'`));
  }
  assert.doesNotMatch(migration, /create table|add column|create function|event_name|reason text/i);
});

test("Slice 3.7 ships catalog and rollback-only behavioral verification", () => {
  assert.match(catalogVerifier, /count\(\*\)[\s\S]*<> 6/);
  assert.match(catalogVerifier, /SLICE 3\.7 CATALOG VERIFICATION PASSED/);
  assert.match(behavioralVerifier, /begin;[\s\S]*rollback;/);
  assert.match(behavioralVerifier, /'platform_selected', 'arbiterlive'/);
  assert.match(behavioralVerifier, /'platform_selected', 'arbiter_officials'/);
  assert.match(behavioralVerifier, /ROLLBACK CLEANUP ZERO/);
});
