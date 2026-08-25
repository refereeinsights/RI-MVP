import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20260825_corralio_slice43_leave_by.sql", import.meta.url),
  "utf8",
);
const server = readFileSync(new URL("./leaveBy.server.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
const weekendUi = readFileSync(new URL("../app/components/ThisWeekend.tsx", import.meta.url), "utf8");
const familyUi = readFileSync(new URL("../app/components/FamilySection.tsx", import.meta.url), "utf8");
const exampleEnvironment = readFileSync(new URL("../../../.env.local.example", import.meta.url), "utf8");

test("migration keeps API audit and quota tables service-role-only", () => {
  for (const table of ["corralio_external_api_calls", "corralio_external_call_daily_quota"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated`));
  }
  assert.match(migration, /grant select, insert on table public\.corralio_external_api_calls to service_role/);
  assert.doesNotMatch(migration, /grant [^;]+corralio_external_api_calls to authenticated/);
});

test("migration enforces coordinate, route, and audit state coherence", () => {
  assert.match(migration, /corralio_households_origin_coordinate_pair_check/);
  assert.match(migration, /corralio_events_location_coordinate_pair_check/);
  assert.match(migration, /corralio_events_route_success_state_check/);
  assert.match(migration, /corralio_external_api_calls_state_check/);
  assert.match(migration, /status in \('ok', 'error', 'skipped'\)/);
  assert.match(migration, /concurrent_claim_skipped/);
});

test("location and origin changes invalidate complete routing state", () => {
  assert.match(migration, /create trigger corralio_events_prepare_location/);
  assert.match(migration, /new\.route_failed_at := null/);
  const originRpc = migration.slice(
    migration.indexOf("create function public.corralio_prepare_household_origin_v1"),
    migration.indexOf("create function public.corralio_reserve_external_call_v1"),
  );
  assert.match(originRpc, /update public\.corralio_events event/);
  assert.match(originRpc, /route_failed_at = null/);
  assert.match(originRpc, /route_claimed_at = null/);
});

test("the daily quota reservation is atomic and service-role-only", () => {
  const quotaRpc = migration.slice(
    migration.indexOf("create function public.corralio_reserve_external_call_v1"),
  );
  assert.match(quotaRpc, /on conflict \(household_id, quota_date\) do update/);
  assert.match(quotaRpc, /reserved_count < p_cap/);
  assert.match(quotaRpc, /grant execute on function public\.corralio_reserve_external_call_v1\(uuid, integer\)[\s\S]*?to service_role/);
  assert.doesNotMatch(quotaRpc, /to authenticated/);
});

test("server orchestration scopes client event IDs to the authenticated household", () => {
  assert.match(actions, /const viewer = await resolveCorralioViewer\(\)/);
  assert.match(actions, /householdId: viewer\.householdId/);
  assert.match(server, /\.eq\("household_id", input\.householdId\)[\s\S]*?\.in\("id", input\.eventIds\.slice\(0, 200\)\)/);
  assert.match(server, /claim: \(\) => claimEvent/);
  assert.match(server, /reserve: \(\) => reserveVendorCall/);
  assert.ok(server.indexOf("claim: () => claimEvent") < server.indexOf("reserve: () => reserveVendorCall"));
  assert.match(server, /loadGeocodeClaimSet[\s\S]*?\.eq\("household_id", householdId\)[\s\S]*?\.order\("id", \{ ascending: true \}\)/);
  assert.match(server, /loadRouteClaimRows[\s\S]*?\.eq\("household_id", input\.householdId\)[\s\S]*?\.order\("id", \{ ascending: true \}\)/);
  assert.match(server, /vendorCalls >= EVENT_GEOCODE_CAP_PER_MOUNT/);
  assert.match(server, /vendorCalls >= MAX_ROUTES_PER_MOUNT/);
  assert.match(server, /const routeCalculatedAt = currentTimestamp\(\)[\s\S]*?routeWithOpenRouteService/);
  assert.match(server, /leave_by_computed_at: routeCalculatedAt/);
  assert.match(server, /\.eq\("location_normalized", group\.normalized\)[\s\S]*?\.in\("id", routeTargetIds\)/);
});

test("origin results are claim-bound so stale concurrent saves cannot overwrite", () => {
  assert.match(server, /claimOrigin\(admin, householdId, address\)/);
  assert.match(server, /\.eq\("origin_address", address\)[\s\S]*?\.eq\("origin_geocode_claimed_at", claimTimestamp\)/);
  assert.match(migration, /from public\.corralio_households household[\s\S]*?for update/);
});

test("provider keys are server-only placeholders and payloads never enter logs", () => {
  assert.match(exampleEnvironment, /^GEOCODIO_API_KEY=$/m);
  assert.match(exampleEnvironment, /^OPENROUTESERVICE_API_KEY=$/m);
  assert.doesNotMatch(exampleEnvironment, /NEXT_PUBLIC_(GEOCODIO|OPENROUTESERVICE)/);
  assert.doesNotMatch(server, /console\.(log|error)\([^)]*(address|coordinates|payload)/i);
  assert.doesNotMatch(server, /error(_code)?:\s*(result|payload|response)/i);
});

test("UI keeps raw navigation and labels leave-by as estimated", () => {
  assert.match(weekendUi, /Apple Maps/);
  assert.match(weekendUi, /Google Maps/);
  assert.match(weekendUi, /Waze/);
  assert.match(weekendUi, /\(est\.\).*estimated drive/);
  assert.match(familyUi, /never used as venue evidence/);
});
