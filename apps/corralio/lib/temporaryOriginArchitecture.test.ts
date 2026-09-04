import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const migration = source("../../../supabase/migrations/20260904_corralio_slice36b_phase3a_temporary_routing_origin.sql");
const catalog = source("../../../scripts/analysis/corralio_slice36b_phase3a_catalog_verification.sql");
const behavioral = source("../../../scripts/analysis/corralio_slice36b_phase3a_behavioral_verification.sql");
const server = source("./temporaryOrigin.server.ts");
const pure = source("./temporaryOrigin.ts");
const actions = source("../app/actions.ts");
const productData = source("../app/_lib/productData.ts");
const control = source("../app/components/EventRoutingOriginControl.tsx");
const cron = source("../app/api/cron/temporary-origin-cleanup/route.ts");
const vercel = source("../vercel.json");
const privacy = source("../../../docs/corralio/CORRALIO_SECURITY_PRIVACY.md");

test("migration separates durable alternate origins from payload-free current-location claims", () => {
  assert.match(migration, /create table public\.corralio_event_routing_origins/);
  assert.match(migration, /origin_kind = 'alternate_address'/);
  assert.match(migration, /create table public\.corralio_current_location_route_claims[\s\S]*household_id uuid[\s\S]*event_id uuid[\s\S]*claim_token uuid[\s\S]*claimed_at timestamptz/);
  const claimTable = migration.match(/create table public\.corralio_current_location_route_claims \(([\s\S]*?)\n\);/)?.[1] ?? "";
  assert.doesNotMatch(claimTable, /lat|lng|coordinate|estimated_drive|route_result|address/i);
  assert.match(migration, /force row level security/g);
  assert.match(migration, /on delete cascade/);
});

test("database boundaries are owner-derived, service-only where required, and use current event timing", () => {
  assert.match(migration, /corralio_prepare_event_routing_origin_v1[\s\S]*auth\.uid\(\)[\s\S]*member\.role = 'owner'[\s\S]*member\.status = 'active'/);
  assert.match(migration, /coalesce\(event\.ends_at, event\.starts_at\) \+ interval '24 hours'/);
  assert.match(migration, /corralio_claim_current_location_route_v1[\s\S]*auth\.role\(\)[\s\S]*service_role/);
  assert.match(migration, /corralio_cleanup_event_routing_origins_v1[\s\S]*p_limit > 500[\s\S]*skip locked/);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[^;]*authenticated/i);
});

test("single-event orchestration authorizes and claims before quota/provider access", () => {
  assert.ok(pure.indexOf("dependencies.loadEvent()") < pure.indexOf("dependencies.claim()"));
  assert.ok(pure.indexOf("dependencies.claim()") < pure.indexOf("dependencies.reserve()"));
  assert.ok(pure.indexOf("dependencies.reserve()") < pure.indexOf("dependencies.route(event)"));
  assert.match(pure, /providerAttemptAuthorized = true[\s\S]*dependencies\.route\(event\)/);
  assert.match(pure, /if \(!providerAttemptAuthorized\) await dependencies\.release\(\)/);
  assert.match(server, /\.eq\("id", eventId\)[\s\S]*\.eq\("household_id", householdId\)[\s\S]*\.gte\("starts_at", window\.from\)[\s\S]*\.lt\("starts_at", window\.to\)/);
  assert.doesNotMatch(server, /computeWeekendLeaveBy/);
  assert.ok(actions.indexOf("resolveCorralioViewer()") < actions.indexOf("routeFromCurrentLocation({"));
});

test("required-arrival and alternate-route freshness remain shared and dynamic", () => {
  assert.match(pure, /resolveRequiredArrival/);
  assert.match(productData, /resolveRequiredArrival/);
  assert.match(productData, /isAlternateRouteFresh\([\s\S]*routeComputedAt:[\s\S]*originGeocodedAt:[\s\S]*locationGeocodedAt:/);
  assert.match(productData, /estimatedLeaveByIso\(requiredArrival\.requiredArrivalAt, selectedDriveMinutes\)/);
  assert.doesNotMatch(migration, /required_arrival|arrival_buffer|leave_by_at/);
});

test("current location is one-use, disclosed, and never persisted", () => {
  assert.match(control, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(control, /maximumAge: 0/);
  assert.match(control, /used once, sent to our routing provider to estimate the drive, and not retained/);
  assert.doesNotMatch(control, /watchPosition/);
  assert.doesNotMatch(server, /insert[^;]*(origin_lat|origin_lng)[^;]*current_location/i);
  assert.match(control, /Leaving from[\s\S]*· Change/);
});

test("cleanup is separate, bounded, authenticated, and does not couple to existing workers", () => {
  assert.match(cron, /isCorralioCronAuthorized/);
  assert.match(cron, /TEMPORARY_ORIGIN_CLEANUP_LIMIT/);
  assert.doesNotMatch(cron, /schedule-refresh|weekend-ready|computeWhatFits/);
  assert.match(vercel, /\/api\/cron\/temporary-origin-cleanup/);
  assert.match(privacy, /retains neither the raw coordinates nor the derived route/);
  assert.match(privacy, /Temporary origins never affect What Fits/);
});

test("catalog and rollback verifiers cover security, lifecycle, concurrency, and cleanup zero", () => {
  assert.match(catalog, /forced RLS/);
  assert.match(catalog, /current-location persistence/);
  assert.match(catalog, /function hardening/);
  assert.match(behavioral, /cross-household prepare unexpectedly succeeded/);
  assert.match(behavioral, /duplicate current-location claim succeeded/);
  assert.match(behavioral, /rescheduled expired override was not hard-deleted/);
  assert.match(behavioral, /ROLLBACK CLEANUP ZERO/);
  assert.doesNotMatch(behavioral, /https?:\/\//);
});
