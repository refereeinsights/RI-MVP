# Corralio CPO Report — Gate 3 Isolated Auth/Runtime Verification

**Date:** 2026-09-02

**Scope:** Isolated Supabase Phone Auth, real Cloudflare Turnstile, signed Send SMS Hook, durable PostgreSQL safety state, and mock-only provider sink

**Verdict:** `GATE 3 ISOLATED AUTH/RUNTIME VERIFICATION PASSED — MOCK PROVIDER ONLY`

This record closes the isolated Auth/runtime sub-gate that remained open in `2026-08-31-cpo-report-gate3-supabase-turnstile-spike.md`. It does not rewrite that historical audit result and does not authorize Telnyx, handset delivery, production configuration, or Phase A+B product implementation.

## Verified end-to-end chain

The controlled isolated session proved:

```text
real Turnstile
→ Corralio same-origin OTP request boundary
→ durable phone/IP authorization
→ one-use short-lived phone permit
→ Supabase signInWithOtp(captchaToken)
→ genuinely signed Send SMS Hook
→ signature and bounded payload verification
→ atomic permit consumption + webhook claim + segment reservation
→ exactly one mock-provider invocation
→ JSON HTTP 200 hook response
→ Supabase Auth HTTP 202 completion
```

Supabase remained authoritative for Turnstile redemption and OTP creation. Corralio did not redeem the Turnstile token independently. The browser received only bounded `pending`/`denied` state. The provider sink was mock-only and the isolated runtime contained no `TELNYX_*` credential.

## Evidence-backed corrections

### 1. Hook-secret pairing

The first call reached the signed hook but failed before durable hook authorization with the bounded category `signature_mismatch`. The saved isolated Supabase hook secret was securely synchronized to the isolated Vercel runtime and the runtime was redeployed. No signature algorithm or architecture was changed.

### 2. HTTP response content type

The second call passed signature verification, durable authorization, permanent one-segment reservation, and one mock invocation. Supabase then returned typed code `hook_payload_invalid_content_type`. The hook success response was corrected to declare `Content-Type: application/json`.

### 3. HTTP response body

The third call again passed the full durable/mock path but Supabase returned `unexpected_failure` after receiving an empty JSON HTTP 200 response. Current Supabase Auth source reads and JSON-decodes HTTP 200/202 response bodies into the empty Send SMS output type. The success body was therefore corrected to the minimal JSON object `{}`. This is the smallest response compatible with the observed hosted behavior and current parser.

### 4. Final confirmation

The fourth Auth call returned HTTP 202. Its Send SMS Hook returned HTTP 200, `application/json`, a two-byte `{}` body, and completed in 61 ms. The hook was delivered once, the durable decision was `authorized`, one segment was reserved permanently for the test UTC day, and the mock provider was invoked exactly once. No duplicate or retry occurred.

One intervening browser submission was rejected as `rate_limited` by the existing durable three-per-destination/hour policy. It stopped before permit issuance and `signInWithOtp()`, so it was not counted as an Auth call and caused no hook delivery, segment reservation, or mock invocation. The safety policy was not weakened for testing.

## Privacy-safe diagnostics

The Send SMS Hook now classifies only these closed pre-authorization outcomes:

- `hook_secret_unavailable`
- `header_contract_invalid`
- `timestamp_invalid`
- `signature_mismatch`
- `payload_json_invalid`
- `payload_shape_invalid`
- `phone_invalid`
- `otp_invalid`
- `unknown_pre_authorization_failure`

The handler may log only the closed category. It does not log or persist the raw phone number, OTP, Turnstile token, raw hook body, hook signature, hook secret, credentials, session tokens, rendered SMS body, or arbitrary provider/Auth messages. Tests prove these failures never reach durable hook authorization or provider work.

## Exact call accounting

| Measure | Result |
|---|---:|
| Maximum additional `signInWithOtp()` calls authorized | 5 |
| Actual `signInWithOtp()` calls | 4 |
| Authorized calls unused | 1 |
| Signed Send SMS Hook deliveries | 4 |
| Durable provider-attempt authorizations | 3 |
| Permanently reserved test segments | 3 |
| Mock-provider invocations | 3 |
| Hook retries/duplicates | 0 |
| Telnyx attempts | 0 |
| Handset OTP deliveries | 0 |

The first signed-hook delivery failed signature verification and correctly reached neither durable hook authorization nor the provider. Each of the three subsequent signed-hook deliveries independently authorized at most one mock attempt and permanently consumed one segment, including the two calls whose final Supabase response failed. This confirms the intended at-most-one provider-attempt invariant under ambiguous downstream Auth outcomes.

## Verification

- 24 focused durable-safety/isolated-runtime tests passed.
- Explicit Corralio TypeScript passed.
- Corralio lint passed with zero warnings or errors.
- Isolated Corralio production builds passed after each response correction.
- `git diff --check` passed.
- Real Turnstile and hosted Supabase were used only in the isolated project.
- All provider sends were mocked.

## Cleanup and restoration

- Disposable isolated Auth identity removed.
- Synthetic fixtures removed across all eight durable-state tables.
- Original durable test-policy row restored exactly, including `updated_at`.
- `DATABASE CLEANUP ZERO` confirmed.
- Isolated Supabase Send SMS Hook deleted.
- Isolated Supabase CAPTCHA disabled.
- Isolated Supabase Phone Auth disabled.
- Temporary isolated Vercel secrets and runtime enable flag removed.
- Retained isolated page and SMS endpoints fail closed with HTTP 404.
- Cloudflare widget and repository test surface retained for future separately authorized testing.
- Temporary local helpers removed and clipboard cleared.
- `EXTERNAL ISOLATED CONFIGURATION RESTORED/DISABLED` confirmed.

A temporary hook secret appeared in browser-automation output while deleting the isolated hook. The hook was deleted and its paired Vercel secret removed immediately, invalidating that temporary credential. No secret value is reproduced in this record.

## CPO interpretation and remaining boundary

The previously open Supabase/Turnstile/signed-hook interoperability question is resolved. Corralio's durable request/permit/webhook/segment design works against real hosted Supabase Auth while the provider boundary remains mocked.

This result does **not** establish:

- a Telnyx provider attempt;
- handset receipt or OTP verification;
- production Phone Auth, Turnstile, Send SMS Hook, or runtime configuration;
- 10DLC/campaign authorization;
- production SMS rate policy; or
- authorization to begin or deploy Phase A+B product behavior.

Any live Telnyx/handset step or Phase A+B execution still requires its own explicit founder authorization and all remaining provider/compliance gates. No push or production deployment occurred in this verification.
