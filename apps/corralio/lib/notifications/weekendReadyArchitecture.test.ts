import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());
const source = (file: string) => readFileSync(path.join(root, file), "utf8");

const migration = source("supabase/migrations/20260828_corralio_slice36a_weekend_ready_push.sql");
const catalog = source("scripts/analysis/corralio_slice36a_catalog_verification.sql");
const behavioral = source("scripts/analysis/corralio_slice36a_behavioral_verification.sql");
const usageReport = source("scripts/analysis/corralio_slice36a_usage_report.sql");
const prompt = source("docs/prompts/corralio-slice-3.6a-weekend-ready-web-push-prompt.md");

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
  assert.doesNotMatch(migration, /grant [^;]+ to authenticated/);
  assert.match(migration, /endpoint_hash bytea generated always as \(digest\(endpoint, 'sha256'\)\) stored/);
  assert.match(migration, /auth_secret text not null/);
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
