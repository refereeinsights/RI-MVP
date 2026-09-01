# Corralio — Gate 3 Isolated Auth & Runtime Verification

Execute the isolated Supabase Auth/runtime verification required before Corralio may request separate authorization for one live phone-OTP delivery.

This task authorizes bounded OTP generation inside the isolated Supabase project, genuinely signed Send SMS Hook delivery to a mock-only Corralio endpoint, isolated real Turnstile configuration, one temporary nonproduction Vercel runtime, and temporary isolated durable-policy fixtures. It authorizes at most **five** `signInWithOtp()` calls and no sixth call.

It does not authorize handset delivery, a Telnyx request or credential in the runtime, production Auth/SMS/database/Turnstile/deployment changes, 10DLC changes, Phase A+B schedule intake, commit, or push.

## Authoritative prerequisite

The durable migration was applied to the isolated project through raw `psql`. Catalog, rollback-only behavior, the four real PostgreSQL races, exact policy restoration, and cleanup zero passed. The state is:

`DURABLE GATE 3 STATE READY FOR ISOLATED PROJECT CONFIGURATION`

Record whether raw `psql` updated the Supabase migration ledger. Do not manipulate that ledger.

## Required chain

```text
isolated browser
→ isolated real Turnstile
→ Corralio OTP request authorization
→ one-use permit
→ isolated Supabase signInWithOtp(captchaToken)
→ genuinely signed Send SMS Hook
→ durable hook authorization
→ mock-only provider sink
```

The external guarantee is at-most-one provider-attempt authorization, never exactly-once delivery.

## Isolation and configuration

Before changing configuration:

1. prove the isolated Supabase reference/database association is distinct from every production/staging reference;
2. identify the isolated real Turnstile widget and authorized hostname;
3. identify the temporary Vercel project/deployment;
4. snapshot every isolated Auth, hook, CAPTCHA, Turnstile, Vercel, and durable-policy setting that will change;
5. verify the synthetic fixture namespace is empty.

Do not load an application `.env.local` wholesale. The isolated Vercel runtime may contain only its isolated Supabase URL/public key/service credential, hook verification secret, channel HMAC secret, real Turnstile public key, isolated site URL, exact isolated/forbidden project references, and fail-closed test flags.

`CORRALIO_ISOLATED_DATABASE_URL` remains operator-side. It must not be deployed. The runtime calls the existing RPCs through the isolated Supabase service-role client. No `TELNYX_*` value or provider credential may be discoverable by the deployment.

## No-delivery preflight

Before the first Auth call, prove the isolated Supabase project has no configured built-in SMS provider capable of delivery. Required order:

1. establish project identity;
2. confirm no built-in provider can deliver;
3. configure the reachable mock-only Send SMS Hook;
4. verify the hook is active;
5. verify the runtime contains no provider credentials;
6. only then permit the first bounded Auth call.

If no-fallback behavior is not established, return `GATE 3 ISOLATED AUTH/RUNTIME CONFIGURATION BLOCKED` with zero Auth calls.

## Existing runtime contracts

Reuse `deriveSmsSafetyHmac()` and its existing domains exactly:

- `corralio:sms:destination:v1\0`
- `corralio:sms:ip:v1\0`

Do not introduce another identity namespace. Reuse the service-role RPC gateway in `apps/corralio/lib/sms/durableSafety.server.ts`. Preserve the existing email-auth and household/RLS behavior.

The browser sends phone and Turnstile token only to the same-origin Corralio boundary. That boundary derives the platform-controlled trusted IP, normalizes E.164, calls the durable request RPC, and calls isolated `signInWithOtp({ phone, options: { captchaToken, shouldCreateUser: false } })` only after authorization. Supabase alone redeems Turnstile and owns OTP creation/expiry/verification/replay.

## Trusted IP

Classify evidence as `OBSERVED IN ISOLATED VERCEL RUNTIME`, `VERIFIED BY DETERMINISTIC ROUTE/HELPER TEST`, `DOCUMENTED`, or `UNPROVEN`.

Actual Vercel requests must prove caller-supplied forwarding headers cannot control the trusted identity. Missing, malformed, comma-separated, unsupported-runtime, and other invalid cases may be proven through deterministic tests. Do not claim external removal of a platform-generated header. Never retain or report a raw IP.

## Turnstile

Corralio must not redeem the token separately. Classify findings only as `DOCUMENTED`, `OBSERVED WITH TURNSTILE TEST KEYS`, `OBSERVED WITH ISOLATED REAL WIDGET`, or `UNPROVEN`. Test keys do not prove hostname/challenge behavior. The ready verdict requires a real isolated widget on the authorized test hostname.

## Signed hook and mock sink

The HTTP hook must verify the Standard Webhooks raw-body signature, timestamp, and webhook ID before parsing bounded fields or calling the durable RPC. It must retain no raw body, signature, OTP, phone, or rendered message. It must finish within the provider hook budget and terminate at a mock sink with no live-provider path.

Verify:

- authorized + mock success → successful hook response and one invocation;
- duplicate after authorization → terminal success and zero additional invocations;
- missing/expired permit and invalid input → bounded non-retryable denial;
- transient pre-authorization database failure → bounded retry-compatible failure and zero invocation;
- post-authorization ambiguity → reservation remains consumed and cannot reauthorize.

## Five-call ceiling and fixtures

Maximum isolated `signInWithOtp()` calls: **5**. Track purpose and bounded outcome without sensitive fields. Intended uses are missing CAPTCHA, invalid CAPTCHA, test-key integration, real-widget authorized path, and direct-Supabase bypass. Exercise rate/cooldown/replay/expiry/duplicate/signature/database-failure cases without extra Auth calls wherever possible.

Use one disposable isolated Auth user and `shouldCreateUser: false` where supported. Supabase Auth may hold the raw test phone as credential authority; Corralio state/evidence may not. Use the complete durable policy unchanged except temporary isolated enablement and synthetic HMAC fixtures. The exact OTP template must be verified as one actual GSM-7 segment.

## Required evidence

Verify the full 21-case matrix from the reviewed execution prompt, including email-auth non-regression, CAPTCHA failures/test/real evidence, durable denial before Auth, phone/IP/cooldown enforcement, permit creation, direct bypass denial, genuine hook authorization, duplicate/expiry/signature/database failure, post-authorization ambiguity, GSM-7, privacy, cleanup, and policy restoration.

Report exact counts for Auth calls, signed hook deliveries, Turnstile test/real interactions, Telnyx attempts (`0`), and handset deliveries (`0`).

## Restoration

Restore or disable all temporary isolated Supabase phone Auth, Send SMS Hook, CAPTCHA, hook secret, Turnstile widget/hostname, Vercel environment/deployment, disposable Auth fixtures, durable policy, allowlist, request/rate state, permits, claims, and budgets. Separately report:

- `DATABASE CLEANUP ZERO`
- `EXTERNAL ISOLATED CONFIGURATION RESTORED/DISABLED`

Both are required for readiness. Update `apps/corralio/notes.md` and `docs/corralio/CORRALIO_CPO_EXECUTION_STATE.md` with only evidence-backed state.

## Verdicts

Return exactly one:

`GATE 3 READY FOR ONE AUTHORIZED LIVE OTP TEST`

or

`GATE 3 ISOLATED AUTH/RUNTIME CONFIGURATION BLOCKED`

The ready verdict does not authorize a handset test.
