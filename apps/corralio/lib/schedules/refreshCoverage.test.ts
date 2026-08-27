import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("migration fixes freshness, claim recovery, ordering, and service-role-only grants", () => {
  const sql = source("../../../../supabase/migrations/20260819_corralio_slice32_scheduled_ics_refresh.sql");
  assert.match(sql, /interval '23 hours'/);
  assert.match(sql, /interval '10 minutes'/);
  assert.match(sql, /nulls first/);
  assert.match(sql, /source\.id asc/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /limit v_limit/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(sql, /create index/i);
});

test("Slice 3.5.5 supersedes the applied freshness gate without editing history", () => {
  const sql = source("../../../../supabase/migrations/20260827_corralio_slice355_schedule_freshness.sql");
  assert.match(sql, /interval '3 hours'/);
  assert.match(sql, /interval '5 minutes'/);
  assert.match(sql, /interval '24 hours'/);
  assert.match(sql, /least\(greatest\(coalesce\(p_limit, 10\), 1\), 10\)/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /corralio_claim_ics_refresh_source_v1/);
  assert.match(sql, /source\.household_id = p_household_id/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /to service_role/);
});

test("claimed persistence delegates to the canonical ingestion function", () => {
  const sql = source("../../../../supabase/migrations/20260819_corralio_slice32_scheduled_ics_refresh.sql");
  const claimedPersistence = sql.slice(
    sql.indexOf("create or replace function public.corralio_persist_claimed_ics_refresh_v1"),
    sql.indexOf("create or replace function public.corralio_fail_claimed_ics_refresh_v1"),
  );
  assert.match(claimedPersistence, /corralio_persist_ics_ingestion_v1/);
  assert.doesNotMatch(claimedPersistence, /insert into public\.corralio_events/);
});

test("cron route uses only the admin client and returns no-store responses", () => {
  const route = source("../../app/api/cron/schedule-refresh/route.ts");
  assert.match(route, /createCorralioSupabaseAdminClient/);
  assert.doesNotMatch(route, /createCorralioSupabaseServerClient|auth\.getUser|cookies\(/);
  assert.match(route, /no-store/);
  assert.match(route, /isCorralioCronAuthorized/);
});

test("one four-hour Vercel cron targets the protected API route", () => {
  const vercel = JSON.parse(source("../../vercel.json")) as { crons?: Array<{ path: string; schedule: string }> };
  assert.deepEqual(vercel.crons, [{ path: "/api/cron/schedule-refresh", schedule: "17 */4 * * *" }]);
});
