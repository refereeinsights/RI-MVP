import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseScheduleAssignmentInput,
  resolveAssignmentPresentation,
  UNAVAILABLE_ASSIGNMENT_LABEL,
} from "./assignment";

const CHILD_A = "cb420000-0000-4000-8000-000000000001";
const CHILD_B = "cb420000-0000-4000-8000-000000000002";
const TEAM_A = "cb430000-0000-4000-8000-000000000001";

const children = [
  { id: CHILD_A, displayName: "Child A" },
  { id: CHILD_B, displayName: "Child B" },
];
const teams = [{ id: TEAM_A, childId: CHILD_A, displayName: "Team A" }];

test("assignment input accepts unassigned, child-only, and team-with-child shapes", () => {
  assert.deepEqual(parseScheduleAssignmentInput("", ""), { ok: true, childId: null, teamId: null });
  assert.deepEqual(parseScheduleAssignmentInput(CHILD_A, ""), { ok: true, childId: CHILD_A, teamId: null });
  assert.deepEqual(parseScheduleAssignmentInput(CHILD_A, TEAM_A), {
    ok: true,
    childId: CHILD_A,
    teamId: TEAM_A,
  });
});

test("assignment input rejects invalid IDs and a team without child context", () => {
  assert.deepEqual(parseScheduleAssignmentInput("", TEAM_A), { ok: false });
  assert.deepEqual(parseScheduleAssignmentInput("not-a-child", ""), { ok: false });
  assert.deepEqual(parseScheduleAssignmentInput(CHILD_A, "not-a-team"), { ok: false });
});

test("presentation resolves child, owning child plus team, and unassigned context", () => {
  assert.deepEqual(resolveAssignmentPresentation({ childId: CHILD_A, teamId: null }, children, teams), {
    kind: "assigned",
    label: "Child A",
  });
  assert.deepEqual(resolveAssignmentPresentation({ childId: null, teamId: TEAM_A }, children, teams), {
    kind: "assigned",
    label: "Child A · Team A",
  });
  assert.deepEqual(resolveAssignmentPresentation({ childId: null, teamId: null }, children, teams), {
    kind: "unassigned",
    label: null,
  });
});

test("archived, missing, and invalid historical assignment shapes display neutral copy", () => {
  for (const assignment of [
    { childId: "cb420000-0000-4000-8000-000000000009", teamId: null },
    { childId: null, teamId: "cb430000-0000-4000-8000-000000000009" },
    { childId: CHILD_A, teamId: TEAM_A },
  ]) {
    assert.deepEqual(resolveAssignmentPresentation(assignment, children, teams), {
      kind: "unavailable",
      label: UNAVAILABLE_ASSIGNMENT_LABEL,
    });
  }
});

test("the server action uses one authenticated RPC and no direct or remote mutation path", () => {
  const actions = readFileSync(new URL("../../app/actions.ts", import.meta.url), "utf8");
  const action = actions.slice(
    actions.indexOf("export async function updateScheduleAssignment"),
    actions.indexOf("export async function replaceScheduleLink"),
  );
  assert.match(action, /createCorralioSupabaseServerClient/);
  assert.equal(action.match(/\.rpc\("corralio_update_schedule_source_assignment_v1"/g)?.length, 1);
  assert.match(action, /p_child_id: assignment\.childId/);
  assert.match(action, /p_team_id: assignment\.teamId/);
  assert.doesNotMatch(action, /createCorralioSupabaseAdminClient|\.from\(|ingestCorralioSchedule|replaceCorralioSchedule|fetch/);
});

test("the UI exposes explicit active-family assignment without source credentials", () => {
  const productData = readFileSync(new URL("../../app/_lib/productData.ts", import.meta.url), "utf8");
  const connectedList = readFileSync(
    new URL("../../app/components/ConnectedScheduleList.tsx", import.meta.url),
    "utf8",
  );
  const sourceSelect = productData.match(/\.from\("corralio_schedule_sources"\)[\s\S]*?\.select\("([^"]+)"\)/)?.[1] ?? "";
  assert.match(sourceSelect, /child_id/);
  assert.match(sourceSelect, /team_id/);
  assert.doesNotMatch(sourceSelect, /source_url/);
  assert.match(connectedList, /No assignment/);
  assert.match(connectedList, /Assign directly to/);
  assert.match(connectedList, /team\.childId === selectedChildId/);
  assert.match(connectedList, /Previous assignment unavailable|assignmentUnavailable/);
  assert.doesNotMatch(connectedList, /sourceUrl:\s*string/);
});

test("the migration preserves exact atomic, authorization, and no-network boundaries", () => {
  const migration = readFileSync(
    new URL("../../../../supabase/migrations/20260820_corralio_slice40b_schedule_assignment.sql", import.meta.url),
    "utf8",
  );
  const membershipPosition = migration.indexOf("from public.corralio_household_members");
  const sourceLockPosition = migration.indexOf("from public.corralio_schedule_sources");
  assert.ok(membershipPosition > 0 && membershipPosition < sourceLockPosition);
  assert.match(migration, /source\.household_id = v_household_id[\s\S]*?for update/);
  assert.match(migration, /source\.sync_status in \('pending', 'success', 'error'\)/);
  assert.match(migration, /p_team_id is not null and p_child_id is null/);
  assert.match(migration, /child\.archived_at is null[\s\S]*?for share/);
  assert.match(migration, /team\.child_id = v_child_id[\s\S]*?team\.archived_at is null[\s\S]*?for share/);
  assert.match(migration, /event\.household_id = v_household_id[\s\S]*?event\.schedule_source_id = v_source_id[\s\S]*?event\.origin_type = 'ics'/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = pg_catalog, public/);
  assert.match(migration, /owner to postgres/);
  assert.match(migration, /from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /create table|create index|fetchIcsSchedule|corralio_claim_ics_refresh|source_url\s*=/i);
});

test("canonical persistence continues copying assignment and the schema uses explicit event origins", () => {
  const foundation = readFileSync(
    new URL("../../../../supabase/migrations/20260818_corralio_household_rls_foundation.sql", import.meta.url),
    "utf8",
  );
  const canonical = readFileSync(
    new URL("../../../../supabase/migrations/20260819_corralio_slice33_persistent_refresh_recovery.sql", import.meta.url),
    "utf8",
  );
  assert.match(foundation, /origin_type text not null/);
  assert.match(foundation, /origin_type in \('manual', 'ics'\)/);
  assert.match(canonical, /v_source\.child_id/);
  assert.match(canonical, /v_source\.team_id/);
  assert.match(canonical, /child_id = excluded\.child_id/);
  assert.match(canonical, /team_id = excluded\.team_id/);
});

test("refresh failure, claiming, and replacement keep assignment inside canonical database boundaries", () => {
  const refresh = readFileSync(
    new URL("../../../../supabase/migrations/20260819_corralio_slice32_scheduled_ics_refresh.sql", import.meta.url),
    "utf8",
  );
  const recovery = readFileSync(
    new URL("../../../../supabase/migrations/20260819_corralio_slice33_persistent_refresh_recovery.sql", import.meta.url),
    "utf8",
  );
  const claim = recovery.slice(
    recovery.indexOf("create or replace function public.corralio_claim_ics_refresh_batch_v1"),
    recovery.indexOf("create or replace function public.corralio_persist_ics_ingestion_v1"),
  );
  const failure = recovery.slice(
    recovery.indexOf("create or replace function public.corralio_fail_claimed_ics_refresh_v1"),
    recovery.indexOf("create or replace function public.corralio_replace_schedule_source_and_persist_ics_v1"),
  );
  const replacement = recovery.slice(
    recovery.indexOf("create or replace function public.corralio_replace_schedule_source_and_persist_ics_v1"),
    recovery.indexOf("revoke all on function public.corralio_claim_ics_refresh_batch_v1"),
  );
  assert.doesNotMatch(claim, /child_id\s*=|team_id\s*=/);
  assert.doesNotMatch(failure, /child_id\s*=|team_id\s*=/);
  assert.match(replacement, /corralio_persist_ics_ingestion_v1/);
  assert.doesNotMatch(replacement, /child_id\s*=|team_id\s*=/);
  assert.match(refresh, /source\.refresh_claimed_at <= now\(\) - interval '10 minutes'/);
});

test("database verification stays synthetic, rollback-only, and network-free", () => {
  const verification = readFileSync(
    new URL("../../../../scripts/analysis/corralio_slice40b_assignment_verification.sql", import.meta.url),
    "utf8",
  );
  const cleanup = readFileSync(
    new URL("../../../../scripts/analysis/corralio_slice40b_assignment_cleanup_verification.sql", import.meta.url),
    "utf8",
  );
  assert.match(verification, /^begin;/m);
  assert.match(verification, /^rollback;/m);
  assert.match(verification, /corralio_slice40b_forced_event_failure/);
  assert.match(verification, /public\.corralio_persist_ics_ingestion_v1/);
  assert.match(verification, /'\[\]'::jsonb/);
  assert.match(verification, /synthetic-canonical-new/);
  assert.doesNotMatch(verification, /fetchIcsSchedule|https:\/\/[^'\s]*calendar|curl|cron\/schedule-refresh/i);
  assert.match(cleanup, /Expected: 0 \/ 0 \/ 0 \/ 0 \/ 0 \/ 0 \/ 0/);
  assert.doesNotMatch(cleanup, /delete from|update |insert into/i);
});
