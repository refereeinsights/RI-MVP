import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const migration = source("supabase/migrations/20260831_corralio_sms_durable_safety_state.sql");
const runtime = source("apps/corralio/lib/sms/durableSafety.ts");
const server = source("apps/corralio/lib/sms/durableSafety.server.ts");
const isolatedRoute = source("apps/corralio/app/api/gate3/otp/request/route.ts");
const isolatedHookRoute = source("apps/corralio/app/api/gate3/sms-hook/route.ts");
const catalog = source("scripts/analysis/corralio_sms_durable_state_catalog_verification.sql");
const behavioral = source("scripts/analysis/corralio_sms_durable_state_behavioral_verification.sql");
const concurrency = source("scripts/analysis/corralio_sms_durable_state_concurrency_verification.mjs");

test("keeps all durable SMS state forced-RLS and function-only", () => {
  for (const table of [
    "test_policy", "test_allowlist", "request_rate_state", "request_decisions", "phone_send_permits",
    "webhook_claims", "daily_segment_budgets", "destination_segment_budgets",
  ]) assert.match(migration, new RegExp(`alter table public\\.corralio_sms_${table} force row level security`));
  assert.match(migration, /revoke all on table[\s\S]*from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant [^;]+ on table [^;]+ to (?:anon|authenticated|service_role)/i);
  assert.match(migration, /grant execute on function public\.corralio_authorize_sms_otp_request_v1[^;]+to service_role/);
  assert.match(migration, /grant execute on function public\.corralio_authorize_sms_hook_attempt_v1[^;]+to service_role/);
});

test("stores only bounded policy and HMAC safety identities", () => {
  assert.match(migration, /global_daily_segment_limit smallint not null default 20/);
  assert.match(migration, /destination_daily_segment_limit smallint not null default 5/);
  assert.match(migration, /max_segments_per_message smallint not null default 1/);
  for (const forbidden of ["raw_phone", "raw_ip", "otp_code", "turnstile_token", "message_body", "hmac_secret", "provider_payload"])
    assert.doesNotMatch(migration, new RegExp(forbidden, "i"));
  assert.match(catalog, /forbidden sensitive columns/);
});

test("uses atomic database functions and permanently increments budgets", () => {
  assert.match(migration, /create function public\.corralio_authorize_sms_otp_request_v1/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /corralio_sms_phone_send_permits_one_live_idx/);
  assert.match(migration, /create function public\.corralio_authorize_sms_hook_attempt_v1/);
  assert.match(migration, /on conflict \(webhook_id\) do nothing/);
  assert.match(migration, /for update/);
  assert.match(migration, /reserved_segments = reserved_segments \+ p_segments/g);
  assert.doesNotMatch(migration, /reserved_segments\s*=\s*reserved_segments\s*-|release_sms|refund/i);
});

test("verifies before database work and permits a provider call only after authorization", () => {
  assert.match(runtime, /verified = verifyStandardWebhook\(\{[\s\S]*?secret: input\.webhookSecret/);
  assert.match(runtime, /decision = await input\.gateway\.authorizeHookAttempt/);
  assert.match(runtime, /if \(decision !== "authorized"\)\s*\{/);
  assert.match(runtime, /await input\.provider\.send/);
  assert.doesNotMatch(runtime, /telnyx\.com|TELNYX_API_KEY|PersistentSegmentLedger|gate3-sms-ledger/);
  assert.doesNotMatch(server, /filesystem|readFile|writeFile|PersistentSegmentLedger/);
});

test("Gate 3 diagnostics retain only bounded contract and Auth error metadata", () => {
  assert.match(isolatedRoute, /sanitizeSupabaseAuthError\(error\)/);
  assert.match(isolatedRoute, /transportStatus: authTransport\?\.httpStatus/);
  assert.match(isolatedRoute, /requestId: authTransport\?\.requestId/);
  assert.match(isolatedRoute, /durationMs: authTransport\?\.durationMs/);
  assert.doesNotMatch(isolatedRoute, /console\.(?:warn|error)\([^\n]*(?:phone|captchaToken|error\s*[,}])/);
  for (const field of ["hookStatus", "contentType", "responseBodyBytes", "durationMs", "retryObserved", "mockInvocations"])
    assert.match(isolatedHookRoute, new RegExp(field));
  assert.doesNotMatch(isolatedHookRoute, /console\.(?:info|warn|error)\([^\n]*(?:rawBody|webhook-signature|phone|otp)/i);
});

test("Gate 3 Turnstile handling is one-use and delegates its only redemption to Supabase", () => {
  const client = source("apps/corralio/app/gate3-isolated/Gate3IsolatedClient.tsx");
  const route = source("apps/corralio/app/api/gate3/otp/request/route.ts");
  const diagnostics = source("apps/corralio/lib/sms/turnstileDiagnostics.ts");
  const combined = `${client}\n${route}\n${diagnostics}`;
  assert.match(client, /claimFreshTurnstileToken/);
  assert.match(client, /submissionInFlight\.current/);
  assert.match(client, /tokenState\.current = claim\.nextState/);
  assert.match(route, /options: \{ captchaToken, shouldCreateUser: false \}/);
  assert.equal((route.match(/auth\.auth\.signInWithOtp\(/g) ?? []).length, 1);
  assert.doesNotMatch(combined, /siteverify/i);
  for (const category of [
    "missing_token",
    "expired_or_reused_token",
    "wrong_secret_sitekey_pairing",
    "hostname_or_configuration_mismatch",
    "generic_captcha_failed",
  ]) assert.match(diagnostics, new RegExp(category));
});

test("ships catalog, rollback behavior and true concurrent-session verification artifacts", () => {
  assert.match(catalog, /DURABLE GATE 3 CATALOG VERIFICATION PASSED/);
  assert.match(behavioral, /^begin;/m);
  assert.match(behavioral, /^rollback;/m);
  assert.match(behavioral, /ROLLBACK CLEANUP ZERO/);
  assert.match(concurrency, /Promise\.all/);
  assert.match(concurrency, /same_webhook|global_19_20|destination_cap|permit_collision/);
  assert.match(concurrency, /cleanup zero/i);
  assert.doesNotMatch(concurrency, /telnyx|fetch\([^)]*https:/i);
});
