import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20260823_corralio_slice41b_family_schedule_lifecycle.sql", import.meta.url),
  "utf8",
);
const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
const familyUi = readFileSync(new URL("../app/components/FamilySection.tsx", import.meta.url), "utf8");
const sourceUi = readFileSync(new URL("../app/components/ConnectedScheduleList.tsx", import.meta.url), "utf8");
const confirmationUi = readFileSync(new URL("../app/components/LifecycleConfirmation.tsx", import.meta.url), "utf8");
const databaseVerification = readFileSync(
  new URL("../../../scripts/analysis/corralio_slice41b_lifecycle_verification.sql", import.meta.url),
  "utf8",
);
const cleanupVerification = readFileSync(
  new URL("../../../scripts/analysis/corralio_slice41b_lifecycle_cleanup_verification.sql", import.meta.url),
  "utf8",
);

test("migration closes destructive and archive-state browser bypasses", () => {
  assert.match(migration, /revoke delete on table public\.corralio_schedule_sources from authenticated/);
  assert.match(migration, /drop policy if exists corralio_schedule_sources_delete_member/);
  assert.match(migration, /revoke update on table public\.corralio_children from authenticated/);
  assert.match(migration, /grant update \(display_name, color_token, sort_order\)/);
  assert.match(migration, /revoke update on table public\.corralio_teams from authenticated/);
  assert.match(migration, /grant update \(display_name, sport, sort_order\)/);
  assert.doesNotMatch(migration, /grant update \([^)]*archived_at/);
});

test("disconnect is owner-authorized, non-destructive, and invalidates only active claim state", () => {
  const disconnect = migration.slice(
    migration.indexOf("create or replace function public.corralio_disconnect_schedule_source_v1"),
    migration.indexOf("create or replace function public.corralio_archive_team_v1"),
  );
  assert.match(disconnect, /auth\.uid\(\)/);
  assert.match(disconnect, /member\.role = 'owner'/);
  assert.match(disconnect, /source\.household_id = v_household_id/);
  assert.match(disconnect, /source\.sync_status in \('pending', 'success', 'error'\)[\s\S]*?for update/);
  assert.match(disconnect, /sync_status = 'disconnected'/);
  assert.match(disconnect, /refresh_claim_token = null/);
  assert.match(disconnect, /refresh_claimed_at = null/);
  assert.doesNotMatch(disconnect, /delete from|source_url\s*=|last_synced_at\s*=|consecutive_refresh_failures\s*=|last_refresh_error_code\s*=/i);
});

test("team and child lifecycle atomically unassign sources and imported events", () => {
  const team = migration.slice(
    migration.indexOf("create or replace function public.corralio_archive_team_v1"),
    migration.indexOf("create or replace function public.corralio_archive_child_v1"),
  );
  const child = migration.slice(
    migration.indexOf("create or replace function public.corralio_archive_child_v1"),
    migration.indexOf("-- Keep Slice 4.0B behavior"),
  );
  for (const lifecycle of [team, child]) {
    assert.match(lifecycle, /for update/);
    assert.match(lifecycle, /set child_id = null,[\s\S]*?team_id = null/);
    assert.match(lifecycle, /event\.origin_type = 'ics'/);
    assert.doesNotMatch(lifecycle, /delete from/i);
  }
  assert.match(team, /source\.team_id = v_team_id/);
  assert.doesNotMatch(team, /sync_status in/);
  assert.match(child, /source\.child_id = v_child_id[\s\S]*?source\.team_id = any\(v_team_ids\)/);
  assert.match(child, /archived_at = coalesce\(team\.archived_at, now\(\)\)/);
});

test("lifecycle RPCs use locked definer boundaries and one bounded false result", () => {
  for (const functionName of [
    "corralio_disconnect_schedule_source_v1",
    "corralio_archive_team_v1",
    "corralio_archive_child_v1",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${functionName}`));
    assert.match(migration, new RegExp(`alter function public\\.${functionName}\\(uuid\\) owner to postgres`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${functionName}\\(uuid\\)[\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}\\(uuid\\)[\\s\\S]*?to authenticated, service_role`));
  }
  assert.equal(migration.match(/set search_path = pg_catalog, public/g)?.length, 4);
  assert.ok((migration.match(/return false;/g)?.length ?? 0) >= 9);
});

test("assignment lock order is aligned before source locking", () => {
  const assignment = migration.slice(migration.indexOf("-- Keep Slice 4.0B behavior"));
  const childLock = assignment.indexOf("from public.corralio_children");
  const teamLock = assignment.indexOf("from public.corralio_teams");
  const sourceLock = assignment.indexOf("from public.corralio_schedule_sources");
  assert.ok(childLock > 0 && childLock < sourceLock);
  assert.ok(teamLock > childLock && teamLock < sourceLock);
  assert.match(assignment, /event\.origin_type = 'ics'/);
});

test("server actions use only authenticated lifecycle RPCs", () => {
  const lifecycleActions = [
    actions.slice(actions.indexOf("export async function disconnectSchedule"), actions.indexOf("export async function replaceScheduleLink")),
    actions.slice(actions.indexOf("export async function removeTeam"), actions.indexOf("export async function removeChild")),
    actions.slice(actions.indexOf("export async function removeChild"), actions.indexOf("export async function signOut")),
  ].join("\n");
  for (const rpc of [
    "corralio_disconnect_schedule_source_v1",
    "corralio_archive_team_v1",
    "corralio_archive_child_v1",
  ]) assert.match(lifecycleActions, new RegExp(`\\.rpc\\("${rpc}"`));
  assert.doesNotMatch(lifecycleActions, /createCorralioSupabaseAdminClient|\.delete\(|archived_at|source_url|fetch\(/);
});

test("Family UI uses explicit accessible confirmations and accurate consequence copy", () => {
  assert.match(sourceUi, /Disconnect schedule/);
  assert.match(sourceUi, /not permanently erased/);
  assert.match(familyUi, /Remove team/);
  assert.match(familyUi, /stay connected and become unassigned/);
  assert.match(familyUi, /Remove child/);
  assert.match(familyUi, /active teams will leave your family plan/);
  assert.match(confirmationUi, /<dialog/);
  assert.match(confirmationUi, /aria-labelledby/);
  assert.match(confirmationUi, /aria-describedby/);
  assert.match(confirmationUi, /aria-haspopup="dialog"/);
  assert.doesNotMatch(`${familyUi}\n${sourceUi}\n${confirmationUi}`, /window\.confirm|source_url|ICS URL/);
});

test("database verification is synthetic, rollback-only, failure-aware, and network-free", () => {
  assert.match(databaseVerification, /^begin;/m);
  assert.match(databaseVerification, /^rollback;/m);
  assert.match(databaseVerification, /corralio_slice41b_forced_event_failure/);
  assert.match(databaseVerification, /example\.invalid/);
  assert.match(databaseVerification, /manual event was rewritten/);
  assert.match(databaseVerification, /Household B control source changed/);
  assert.doesNotMatch(databaseVerification, /fetch\(|curl|cron\/schedule-refresh|https:\/\/[^'\s]*\.ics[^'\s]*['"]\s*\)/i);
  assert.match(cleanupVerification, /Expected: 0 \/ 0 \/ 0 \/ 0 \/ 0 \/ 0 \/ 0/);
  assert.doesNotMatch(cleanupVerification, /delete from|update |insert into/i);
});
