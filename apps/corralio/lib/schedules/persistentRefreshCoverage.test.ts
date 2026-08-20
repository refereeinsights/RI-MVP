import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const migration = source("../../../../supabase/migrations/20260819_corralio_slice33_persistent_refresh_recovery.sql");

test("persistent refresh migration uses the fixed three-failure state model", () => {
  assert.match(migration, /consecutive_refresh_failures integer not null default 0/);
  assert.match(migration, /consecutive_refresh_failures between 0 and 3/);
  assert.match(migration, /consecutive_refresh_failures = 3 and refresh_paused_at is not null/);
  assert.match(migration, /least\(source\.consecutive_refresh_failures \+ 1, 3\)/);
  assert.match(migration, /source\.refresh_paused_at is null/);
  assert.doesNotMatch(migration, /sync_status\s*=\s*'paused'/);
  assert.doesNotMatch(migration, /create table|create index/i);
});

test("only an owned live claim can record a bounded failure", () => {
  const failureFunction = migration.slice(
    migration.indexOf("create or replace function public.corralio_fail_claimed_ics_refresh_v1"),
    migration.indexOf("create or replace function public.corralio_replace_schedule_source_and_persist_ics_v1"),
  );
  for (const code of [
    "invalid_url", "unsupported_protocol", "private_url", "fetch_failed",
    "not_ics", "too_large", "event_limit", "persistence",
  ]) assert.match(failureFunction, new RegExp(`'${code}'`));
  assert.match(failureFunction, /source\.refresh_claim_token = p_claim_token/);
  assert.match(failureFunction, /source\.refresh_claimed_at > now\(\) - interval '10 minutes'/);
  assert.match(failureFunction, /return found/);
});

test("canonical success and validated replacement reset recovery state atomically", () => {
  const canonical = migration.slice(
    migration.indexOf("create or replace function public.corralio_persist_ics_ingestion_v1"),
    migration.indexOf("create or replace function public.corralio_fail_claimed_ics_refresh_v1"),
  );
  assert.match(canonical, /consecutive_refresh_failures = 0/);
  assert.match(canonical, /refresh_paused_at = null/);
  assert.match(canonical, /last_refresh_error_code = null/);

  const replacement = migration.slice(
    migration.indexOf("create or replace function public.corralio_replace_schedule_source_and_persist_ics_v1"),
    migration.indexOf("revoke all on function public.corralio_claim_ics_refresh_batch_v1"),
  );
  assert.match(replacement, /corralio_persist_ics_ingestion_v1/);
  assert.match(replacement, /last_refresh_attempted_at = now\(\)/);
  assert.doesNotMatch(replacement, /insert into public\.corralio_events/);
});

test("failure counter stays private while the safe pause marker is browser-readable", () => {
  assert.match(migration, /grant select \(refresh_paused_at\)[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /grant select \([^)]*consecutive_refresh_failures[^)]*\)[\s\S]*to authenticated/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
});
