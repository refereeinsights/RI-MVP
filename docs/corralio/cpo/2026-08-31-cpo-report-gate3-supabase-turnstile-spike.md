# Corralio — Gate 3 Supabase Phone Auth / Turnstile / Send SMS Hook Spike

**Date:** 2026-08-31
**Scope:** Repository, current primary contracts, and offline/mock verification only
**Verdict:** `GATE 3 BLOCKED`

No live OTP or SMS was authorized or attempted. No Cloudflare, Supabase, Telnyx, Vercel, DNS, deployment, Auth, database, 10DLC, or `/sms` configuration was changed. Existing email authentication was not modified.

## A. Gate 3 Verdict

`GATE 3 BLOCKED`

The proposed chain is implementable, and the Supabase, Turnstile, and Send SMS Hook contracts are sufficiently established to design the later boundary. It is not ready for an isolated live OTP because:

1. no separately identified isolated Supabase test project/configuration exists in the repository environment;
2. no Turnstile site key/secret or configured test hostname exists;
3. no Send SMS HTTP Hook secret or reachable signed hook endpoint exists;
4. the current spike ledger is safely persistent/atomic across local processes but is file-backed and cannot be treated as shared durable state across Vercel function instances; and
5. there is no centralized durable, atomic `webhook-id` claim joining Supabase retry idempotency to OTP request limits and the SMS segment reservation.

The fifth item is mandatory before a live OTP. Supabase may retry an HTTP Hook on retryable failure. A provider request may have succeeded even when the hook response is lost. A retry must return from durable prior state and must never reserve/send a second segment for the same `webhook-id`.

## B. Supabase Phone Auth Contract

### Repository evidence

- Corralio uses `@supabase/supabase-js` `^2.95.3` and `@supabase/ssr`.
- Existing email magic-link and password flows live in `SignInForm.tsx`; email confirmation/recovery use their existing callback/route boundaries. None needs modification for this spike.
- Installed runtime types support `signInWithOtp({ phone, options: { shouldCreateUser, captchaToken, channel: "sms" } })` and `verifyOtp({ phone, token, type: "sms" })`.
- Phone verification returns a normal Supabase session. It does not require the email callback route and can coexist through a separate phone form/server orchestration without changing email behavior.

### Current primary contract

- `signInWithOtp({ phone })` initiates phone OTP; new-user creation defaults to enabled unless `shouldCreateUser: false` is supplied.
- `verifyOtp({ phone, token, type: "sms" })` verifies the manually entered code and creates the authenticated session.
- Phone input must be normalized to E.164 before either operation. This spike permits only a U.S. founder-controlled test handset; that is a test restriction, not permanent product geography policy.
- Supabase documents a configurable project-wide OTP-send limit, a same-identifier resend interval (default 60 seconds), and an IP-limited `/verify` endpoint. The currently configured project values were not observable without a management token and remain `UNPROVEN`.
- Supabase documentation currently contains inconsistent phone-OTP expiry descriptions (60 seconds in part of the phone guide versus one hour elsewhere). The isolated project's actual configured expiry must be recorded rather than inferred.
- User-facing request results must stay generic. The offline fixture returns the same bounded response without disclosing whether a phone/account exists.

Primary references: [phone login](https://supabase.com/docs/guides/auth/phone-login), [`signInWithOtp`](https://supabase.com/docs/reference/javascript/auth-signinwithotp), [`verifyOtp`](https://supabase.com/docs/reference/javascript/auth-verifyotp), and [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

## C. Turnstile Contract

Cloudflare Turnstile is founder-approved. The minimum Stage 1 contract is:

1. browser renders a widget using a public test-environment site key;
2. browser obtains a bounded Turnstile token;
3. Corralio's server-side OTP request orchestration enforces its own durable request controls and passes the token to Supabase as `captchaToken`; and
4. Supabase performs the one authoritative Turnstile validation using the secret configured in Supabase Auth.

Do **not** call Cloudflare Siteverify independently and then submit the same token to Supabase. Turnstile tokens are single-use; redeeming one twice makes the second validation fail. Supabase's native CAPTCHA path should own redemption for this flow.

Contract facts:

- the site key is public and may be exposed only as the widget configuration;
- the secret is private and belongs in the Supabase Auth CAPTCHA configuration, not browser code;
- tokens expire after 300 seconds and are single-use;
- Cloudflare requires server-side validation; the widget alone is not protection;
- the widget must be restricted to the exact isolated-test hostname; and
- a failed/missing/expired token or validation outage fails closed before OTP generation/provider work.

The installed Supabase client accepts `captchaToken` on phone `signInWithOtp`. Actual Supabase/Turnstile validation is `UNPROVEN` because neither service is configured for this spike.

Primary references: [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha), [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), and [Turnstile setup/security requirements](https://developers.cloudflare.com/turnstile/get-started/).

## D. Send SMS Hook Contract

Use a Supabase HTTP Send SMS Hook, not an unauthenticated generic webhook and not a broad service-role endpoint.

- Supabase signs the exact raw, uncompressed body using the Standard Webhooks contract.
- Required headers are `webhook-id`, `webhook-timestamp`, and `webhook-signature`.
- The symmetric secret format is `v1,whsec_<base64-secret>`; verification signs `webhook-id.webhook-timestamp.raw-body` with HMAC-SHA-256.
- Verify signature and timestamp against the raw body before parsing. Claim `webhook-id` durably before provider work.
- The documented payload provides the destination at `user.phone` and OTP at `sms.otp`.
- A successful Send SMS Hook requires no body; JSON-compatible `200`, `202`, or `204` is accepted for this hook.
- All responses, including errors, require `Content-Type: application/json`.
- HTTP Hook requests have a 20 KB payload bound and a five-second total invocation budget.
- `429` or `503` with non-empty `retry-after` may be retried up to three times with two-second backoff inside that total budget. `400`/`403` surface as internal errors rather than retryable outcomes.

Minimum future orchestration:

`verify Standard Webhook → validate schema/E.164/test geography → durable webhook-id claim → enforce allowlist → atomically enforce request/segment limits and reserve → one Telnyx attempt → persist bounded outcome → return normalized JSON`

The centralized durable claim must distinguish:

- never attempted;
- reserved/attempting;
- provider accepted;
- conclusively rejected; and
- ambiguous outcome.

Provider-accepted or ambiguous outcomes must not be sent again when Supabase retries. The raw phone, OTP, message, secret, and provider response must not enter logs or the idempotency record.

Primary references: [Supabase Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks), [Send SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook), and [Standard Webhooks specification](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md).

## E. Abuse-Control Contract

No production application-limit values are founder-approved. The following values were used only for deterministic fixtures and are **TEST-ONLY**, not product policy:

| Control | TEST-ONLY value |
|---|---:|
| OTP requests per trusted-IP bucket/hour | 5 |
| OTP requests per phone-HMAC bucket/hour | 3 |
| Same-phone resend cooldown | 60 seconds |
| Verification failures per challenge | 5 |
| Supabase isolated-project OTP/SMS total | 5/hour for the one-test environment |
| Telnyx global segment cap | 20/UTC day |
| Telnyx destination cap | 5/UTC day |
| Segments per message | 1 |

Requirements:

- The future Corralio request and verification boundaries must use centralized durable state. Missing/unavailable state fails closed.
- Phone buckets use HMAC-SHA-256 with `CORRALIO_SMS_CHANNEL_HMAC_SECRET`; do not store raw phone values merely for limiting.
- IP buckets must likewise avoid raw long-term storage. On Vercel, derive the client IP from the platform request boundary (`ipAddress(request)`/Vercel-overwritten forwarding headers), never from an arbitrary caller-supplied application header.
- Turnstile is one layer, not the cost boundary. Supabase project limits, Corralio per-IP/per-phone/cooldown/attempt limits, the persistent segment ledger, Telnyx destination/global caps, allowlist, and provider $5/day cap all remain independent.
- `CORRALIO_SMS_CHANNEL_HMAC_SECRET` is only a privacy-safe deterministic bucketing key. It is independent of the Telnyx key, Supabase hook secret, Supabase service secret, and Turnstile secret.

Vercel Functions have no instance affinity and must not use instance-local state as durable coordination. The existing local file ledger remains valid proof of the safety algorithm, not a deployable distributed ledger. See [Vercel request headers](https://vercel.com/docs/headers/request-headers) and [Vercel Functions](https://vercel.com/docs/functions).

## F. Safety Verification Results

Thirteen offline tests passed:

- 7 Gate 3 integration-contract tests:
  - valid U.S. E.164 and malformed/unsupported geography rejection;
  - Turnstile missing/rejected/action/hostname fail-closed fixtures;
  - per-IP/per-phone/cooldown and unavailable-state request rejection;
  - verification-attempt limit and unavailable-state rejection;
  - Supabase Standard Webhook raw-body signature, stale timestamp, malformed payload, and replay rejection;
  - mocked Send SMS Hook → one-segment reservation → provider failure propagation, with the ambiguous reservation retained; and
  - enumeration-safe response containing no identifier/account-existence disclosure.
- 6 reused Telnyx safety tests:
  - exact test configuration, allowlist, and one-segment enforcement;
  - persistent global/per-destination caps across instances;
  - lock/corruption fail closed;
  - ambiguous reservation retention;
  - two-process 19/20 concurrency; and
  - fixture-only Telnyx webhook signature/freshness/type/replay rejection.

Actual OTP/SMS/provider counts were all zero. Fixture phone numbers, OTPs, secrets, and ledgers were synthetic and temporary.

The fixtures prove pure/single-host safety behavior. They do not prove a distributed runtime, configured Supabase Auth, configured Turnstile, or configured-account hook delivery.

## G. Founder Configuration Checklist

### Cloudflare

- Create a separate Turnstile widget for the isolated test environment.
- Restrict it to the exact test hostname.
- Record the public site key without exposing the secret.
- Enter the private secret only into the isolated Supabase Auth CAPTCHA configuration.
- Do not use production keys or an unrestricted hostname.

### Supabase

- Provide a separately identified isolated test project; current local root/app variables point to the same existing project and do not establish isolation.
- Human-enable Phone Auth only in that isolated project.
- Human-enable Cloudflare Turnstile CAPTCHA and enter its secret.
- Set test-only OTP/SMS rate limit to 5/hour and same-identifier resend interval to 60 seconds; record actual OTP expiry and verification limits.
- Configure the HTTP Send SMS Hook only after its signed endpoint and durable state exist.
- Generate/store the `v1,whsec_...` hook secret and configure the exact endpoint URL.
- Do not enable/change existing Corralio production email Auth.

### Corralio

- Add only the public Turnstile site key to client-visible test configuration.
- Store the full Supabase Send SMS Hook secret server-only.
- Preserve all existing Telnyx test-mode, allowlist, HMAC, and segment-cap values.
- Provide centralized durable test state for request/verification limits, `webhook-id` idempotency, and atomic segment reservations; a Vercel filesystem file is insufficient.
- Provide a signed HTTP Hook endpoint with raw-body access, 20 KB rejection, five-second completion budget, bounded JSON errors, and no sensitive logging.
- Provide separate server-side request and verify orchestration so browser calls cannot bypass Corralio rate/attempt controls.
- Use a test-only success/OTP observation surface that does not create a Corralio household merely by landing on the normal authenticated core loop.

### Telnyx

- Keep the existing profile/number association, allowlist, segment caps, and $5/day cap unchanged.
- Obtain 10DLC campaign approval or explicit written Telnyx authorization for the single pre-campaign OTP test.
- Do not configure the Telnyx inbound webhook or test START/STOP/HELP for this OTP-only test.

### Test handset

- Founder-controlled U.S. mobile number.
- Exact E.164 value present as the sole secret test allowlist entry.
- Separate explicit authorization for one OTP send/segment.
- No screenshot/log/report may expose the full number or OTP.

## H. Exact Isolated Live OTP Test Plan

Do not execute until every checklist item above is verified and the founder separately authorizes one segment.

| Step | Expected browser state | Expected Supabase/Auth state | Expected Corralio state | SMS ledger | Expected Telnyx outcome | Pass criterion |
|---|---|---|---|---:|---|---|
| 0. Preflight | Test page only; email auth unchanged | Isolated project, phone/CAPTCHA/hook enabled | Hook/config healthy; allowlist exact | 0 | No call | Every gate passes before user input |
| 1. Challenge | Turnstile completes on allowed test host | No Auth mutation yet | No OTP/request reservation yet | 0 | No call | One fresh token obtained |
| 2. Request code | Generic pending/result copy | `signInWithOtp` receives E.164 + `captchaToken` | Durable IP/phone request claim succeeds | 0 | No call yet | Missing/duplicate token cannot pass |
| 3. Send SMS Hook | No sensitive detail rendered | Supabase emits one signed hook with OTP | Raw signature verified; `webhook-id` claimed; allowlist/geography/message checked | +1 reserved | Exactly one one-segment request | Accepted or bounded failure; no retry resend |
| 4. Receive code | Manual OTP field visible | OTP challenge remains pending | No household/channel identity created | remains +1 | One test SMS received if accepted | One message, no link/PII beyond code |
| 5. Verify code | Generic success/failure | `verifyOtp(type: "sms")` creates one disposable session on success | Attempt counter advances atomically; no email flow change | remains +1 | No call | Correct code succeeds; wrong attempts bounded |
| 6. Observe | Isolated success surface | One disposable Auth identity/session | No household/schedule/analytics/provider rows beyond approved safety records | remains +1 through UTC expiry | No call | Identity/session verified without core-loop side effects |
| 7. Cleanup | Browser session removed | Disposable Auth user/session deleted | Disposable request/attempt/idempotency data removed where policy permits | non-PII cap reservation retained until expiry | No call | Independent cleanup confirms zero disposable identity/product rows |

Any timeout or ambiguous provider outcome retains the reservation and the durable `webhook-id` claim. It is a failed UAT, not permission to retry.

## I. Remaining Full Gate 3 Requirements

"This Telnyx-only spike cannot authorize Track A implementation. Full Gate 3 still requires the isolated Supabase phone Auth, Cloudflare Turnstile, rate-limit, and Send SMS Hook spike defined by the canonical Phase A+B prompt."

This spike completed the repository/documentation/offline portion of that remaining work, but Full Gate 3 still requires:

- the isolated Cloudflare/Supabase configuration above;
- a centralized durable rate/idempotency/segment boundary suitable for the actual runtime;
- a signed reachable Send SMS Hook endpoint;
- current 10DLC approval or explicit written Telnyx test authorization;
- one separately founder-authorized end-to-end live OTP segment;
- verification of the disposable Auth identity/session lifecycle and cleanup; and
- recorded actual configured Supabase OTP expiry/rate/verification behavior.

Completing those items would permit reconsidering `GATE 3 READY FOR ISOLATED LIVE OTP TEST`; it would still not authorize Track A implementation or production SMS.

## J. Next Execution Prompt

Not produced because the verdict is `GATE 3 BLOCKED`.

No product phone-auth UI, production route, migration, database mutation, external configuration, deployment, 10DLC submission, `/sms` activation, commit, or push was performed.
