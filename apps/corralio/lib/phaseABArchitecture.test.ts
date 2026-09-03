import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(__dirname, "../../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("product phone auth is fail-closed and distinct from the Gate 3 harness", () => {
  const requestRoute = read("apps/corralio/app/api/auth/phone/request/route.ts");
  const configuration = read("apps/corralio/lib/phoneAuth.ts");
  const auth = read("apps/corralio/lib/phoneAuth.server.ts");
  assert.match(requestRoute, /readPhoneAuthConfiguration/);
  assert.match(configuration, /CORRALIO_PHONE_AUTH_ENABLED/);
  assert.match(auth, /shouldCreateUser: true/);
  assert.doesNotMatch(auth, /requestIsolatedSmsOtp|gate3-isolated/);
  const form = read("apps/corralio/app/components/PhoneAuthForm.tsx");
  assert.match(form, /submissionInFlight\.current = true/);
  assert.match(form, /captchaToken\.current = null/);
  const hook = read("apps/corralio/app/api/auth/phone/sms-hook/route.ts");
  assert.match(hook, /CORRALIO_PHONE_AUTH_SMS_HOOK_ENABLED/);
  assert.match(hook, /handleVerifiedSmsHook/);
  assert.doesNotMatch(hook, /gate3-isolated|assertIsolatedSmsRuntimeConfiguration/);
});

test("projection follows server-verified OTP user and no credential enters a URL", () => {
  const auth = read("apps/corralio/lib/phoneAuth.server.ts");
  assert.match(auth, /user\.phone_confirmed_at/);
  assert.match(auth, /verifiedPhone: normalizeVerifiedPhone|verifiedPhone,/);
  assert.doesNotMatch(auth, /URLSearchParams|redirect.*phone|token_hash/);
});

test("inbound and outbound webhook idempotency domains remain separate", () => {
  const migration = read("supabase/migrations/20260903_corralio_phase_ab_phone_schedule_intake.sql");
  assert.match(migration, /corralio_telnyx_inbound_claims/);
  assert.doesNotMatch(migration, /insert into public\.corralio_sms_webhook_claims/);
});

test("pending intake stores only encrypted envelope and separately keyed fingerprint", () => {
  const gateway = read("apps/corralio/lib/sms/scheduleIntake.server.ts");
  assert.match(gateway, /secrets\.encrypt\(normalizedUrl\)/);
  assert.match(gateway, /secrets\.fingerprint\(normalizedUrl\)/);
  assert.doesNotMatch(read("supabase/migrations/20260903_corralio_phase_ab_phone_schedule_intake.sql"), /source_url text|calendar_url text|phone_number text/);
});

test("no arrival, origin, analytics, or email intake implementation enters Phase A+B", () => {
  const migration = read("supabase/migrations/20260903_corralio_phase_ab_phone_schedule_intake.sql");
  assert.doesNotMatch(migration, /arrival_buffer|origin_|analytics/);
  assert.equal(fs.existsSync(path.join(root, "apps/corralio/app/api/webhooks/resend/inbound/route.ts")), false);
});
