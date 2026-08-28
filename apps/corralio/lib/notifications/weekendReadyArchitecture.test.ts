import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());
const source = (file: string) => readFileSync(path.join(root, file), "utf8");

const migration = source("supabase/migrations/20260828_corralio_slice36a_weekend_ready_push.sql");
const digestRepair = source("supabase/migrations/20260828_corralio_slice36a_digest_resolution_repair.sql");
const catalog = source("scripts/analysis/corralio_slice36a_catalog_verification.sql");
const behavioral = source("scripts/analysis/corralio_slice36a_behavioral_verification.sql");
const usageReport = source("scripts/analysis/corralio_slice36a_usage_report.sql");
const prompt = source("docs/prompts/corralio-slice-3.6a-weekend-ready-web-push-prompt.md");
const actions = source("apps/corralio/app/actions.ts");
const familyUi = source("apps/corralio/app/components/FamilySection.tsx");
const productData = source("apps/corralio/app/_lib/productData.ts");
const workerRoute = source("apps/corralio/app/api/cron/weekend-ready/route.ts");
const workerServer = source("apps/corralio/lib/notifications/weekendReady.server.ts");
const browserPrompt = source("apps/corralio/app/components/WeekendReadyPrompt.tsx");
const serviceWorker = source("apps/corralio/public/sw.js");
const vercel = source("apps/corralio/vercel.json");
const middleware = source("apps/corralio/middleware.ts");
const nextConfig = source("apps/corralio/next.config.js");

test("keeps subscription capabilities behind service-only tables and functions", () => {
  for (const table of [
    "corralio_push_subscriptions",
    "corralio_weekend_ready_campaigns",
    "corralio_weekend_ready_deliveries",
    "corralio_push_interactions",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(migration, /revoke all on table[\s\S]+from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant [^;]*on table public\.corralio_(?:push|weekend)[^;]+to authenticated/i);
  assert.match(migration, /endpoint_hash bytea generated always as \(digest\(endpoint, 'sha256'\)\) stored/);
  assert.match(migration, /auth_secret text not null/);
});

test("resolves pgcrypto digest through the trusted extension schema", () => {
  assert.match(digestRepair, /extensions\.digest\(v_endpoint, 'sha256'\)/);
  assert.match(digestRepair, /extensions\.digest\(btrim\(coalesce\(p_endpoint, ''\)\), 'sha256'\)/);
  assert.match(digestRepair, /set search_path = pg_catalog, public/g);
  assert.match(catalog, /trusted digest resolution/);
});

test("implements separate campaign and delivery idempotency with bounded retry", () => {
  assert.match(migration, /unique \(household_id, planning_weekend_start\)/);
  assert.match(migration, /unique \(campaign_id, subscription_hash\)/);
  assert.match(migration, /for update of delivery skip locked/);
  assert.match(migration, /delivery\.attempt_count < 2/);
  assert.match(migration, /interval '90 minutes'/);
  assert.match(migration, /deactivation_reason = 'dead_endpoint'/);
  assert.match(migration, /membership_lost/);
});

test("stores confirmed household timezone separately and schedules against local time", () => {
  assert.match(migration, /add column planning_timezone text null/);
  assert.match(migration, /pg_catalog\.pg_timezone_names/);
  assert.match(migration, /corralio_households_planning_timezone_idx/);
  assert.match(migration, /eligible_zones as materialized/);
  assert.match(migration, /extract\(isodow from p_now at time zone zone\.name\) = 4/);
  assert.match(migration, /extract\(hour from p_now at time zone zone\.name\) = 16/);
  assert.match(migration, /extract\(minute from p_now at time zone zone\.name\) >= 37/);
  assert.doesNotMatch(migration, /window_strategy|fixed_us_v1|reference_timezone/);
  assert.match(behavioral, /null-timezone household was silently scheduled/);
  assert.match(behavioral, /travel event timezone changed while household timezone was saved/);
  assert.match(prompt, /Thursday at 4:37 PM/);
  assert.match(prompt, /7,22,37,52 2-23 \* \* 4/);
  assert.match(prompt, /7,22,37,52 0-6 \* \* 5/);
});

test("keeps browser suggestion explicit and server validation authoritative", () => {
  assert.match(familyUi, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(familyUi, /Confirm it before Weekend Ready is enabled/);
  assert.match(actions, /parseIanaTimeZone\(formData\.get\("timezone"\)\)/);
  assert.match(actions, /corralio_set_household_timezone_v1/);
  assert.match(productData, /origin_address,planning_timezone/);
  assert.doesNotMatch(actions, /origin_address|event\.timezone|venue.*timezone/i);
});

test("does not overload the routing ledger or enter deferred notification scope", () => {
  assert.doesNotMatch(migration, /alter table public\.corralio_external_api_calls/i);
  assert.doesNotMatch(migration, /resend|email digest|mapbox|traffic|sms/i);
  assert.match(catalog, /routing ledger was widened/);
  assert.match(prompt, /### Email[\s\S]{0,120}Deliberately deferred/);
});

test("ships read-only catalog and rollback-only network-free verification", () => {
  assert.match(catalog, /SLICE 3\.6A CATALOG VERIFICATION PASSED/);
  assert.match(behavioral, /^begin;/m);
  assert.match(behavioral, /^rollback;/m);
  assert.match(behavioral, /ROLLBACK CLEANUP ZERO/);
  assert.doesNotMatch(behavioral, /fetch\(|curl|https:\/\/[^']+\.ics/i);
  assert.match(usageReport, /post_send_return_campaigns/);
  assert.match(usageReport, /provider_accepted_campaigns/);
  assert.doesNotMatch(usageReport, /endpoint|p256dh|auth_secret|child|team|location/i);
});

test("keeps the final founder corrections in the canonical prompt", () => {
  for (const phrase of [
    "service-only",
    "one campaign claim per household/planning weekend",
    "one delivery record per campaign/subscription",
    "same-origin/CSRF validation",
    "separate push route/cron",
    "UNVERIFIED ON PHYSICAL DEVICE",
    "CORRALIO_SITE_URL",
  ]) assert.match(prompt, new RegExp(phrase.replace("/", "\\/"), "i"));
});

test("ships an isolated authenticated bounded Weekend Ready worker", () => {
  assert.match(workerRoute, /isCorralioCronAuthorized/);
  assert.match(workerRoute, /createCorralioSupabaseAdminClient/);
  assert.match(workerRoute, /maxDuration = 300/);
  assert.doesNotMatch(workerRoute, /schedule-refresh|source_url|endpoint|p256dh|auth_secret/);
  assert.match(workerServer, /corralio_claim_weekend_ready_deliveries_v1/);
  assert.match(workerServer, /corralio_finish_weekend_ready_delivery_v1/);
  assert.match(workerServer, /CORRALIO_VAPID_PRIVATE_KEY/);
  assert.match(workerServer, /getCorralioSiteOrigin\(\)/);
  assert.doesNotMatch(workerServer, /request\.headers|host|forwarded/i);
  assert.match(vercel, /7,22,37,52 2-23 \* \* 4/);
  assert.match(vercel, /7,22,37,52 0-6 \* \* 5/);
});

test("keeps subscription capability behind server actions and bounded browser states", () => {
  assert.match(actions, /parsePushSubscriptionInput/);
  assert.match(actions, /createCorralioSupabaseAdminClient\(\)\.rpc\(/);
  assert.match(actions, /corralio_upsert_push_subscription_v1/);
  assert.match(actions, /corralio_deactivate_push_subscription_v1/);
  assert.match(browserPrompt, /Notification\.requestPermission\(\)/);
  assert.match(browserPrompt, /permission_denied/);
  assert.match(browserPrompt, /permission_dismissed/);
  assert.match(browserPrompt, /Add to Home Screen/);
  assert.match(browserPrompt, /localStorage\.setItem\(DISMISSED_KEY/);
  assert.doesNotMatch(browserPrompt, /getCorralioSupabaseBrowserClient|\.from\(|\.rpc\(/);
});

test("uses a root service worker only for private-copy push and same-origin navigation", () => {
  assert.match(serviceWorker, /self\.addEventListener\("push"/);
  assert.match(serviceWorker, /self\.registration\.showNotification/);
  assert.match(serviceWorker, /self\.addEventListener\("notificationclick"/);
  assert.match(serviceWorker, /candidate\.origin === self\.location\.origin/);
  assert.doesNotMatch(serviceWorker, /child_name|team_name|event_name|origin_address|source_url|private_note/i);
  assert.doesNotMatch(serviceWorker, /addEventListener\("fetch"|caches\./);
  assert.match(middleware, /manifest\.webmanifest\|sw\.js/);
  assert.match(nextConfig, /Service-Worker-Allowed/);
  assert.match(nextConfig, /no-cache, no-store, must-revalidate/);
});
