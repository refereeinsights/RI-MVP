# Corralio — Gate 3 Durable Distributed Safety State

Implement the minimum centralized durable state required to unblock Corralio Gate 3 for one isolated live phone-OTP test.

This is not general SMS product implementation, public phone-auth activation, production SMS enablement, or a 10DLC submission task.

## Current Gate 3 verdict

`GATE 3 BLOCKED`

Repository, documentation, and offline-spike evidence established:

- Existing email authentication can remain unchanged.
- Supabase phone Auth supports `signInWithOtp`, `verifyOtp({ type: "sms" })`, and `captchaToken`.
- Supabase must remain the authoritative Turnstile-token redemption and OTP-verification boundary.
- Supabase Send SMS Hooks use signed Standard Webhooks and may retry retryable failures.
- The current file-backed SMS ledger is safe for bounded local tests but is not authoritative across Vercel instances.
- Before a live OTP, Corralio requires centralized durable state so direct Supabase Auth calls, duplicate hooks, concurrent requests, retries, restarts, and ambiguous provider outcomes cannot bypass Corralio's economic and rate controls.
- No live OTP or SMS is authorized by this prompt.

## Authoritative architecture invariant

### Browser request

```text
Trusted client IP + normalized phone
        ↓
Corralio OTP-request boundary
        ↓
ONE atomic database authorization
- verify durable test policy is enabled
- phone-HMAC rate limit
- IP-HMAC rate limit
- resend cooldown
- HMAC allowlist eligibility
        ↓
One-use, short-lived phone send permit
        ↓
Supabase signInWithOtp({ phone, options: { captchaToken } })
        ↓
Supabase validates Turnstile
```

### Send hook

```text
Signed Supabase Send SMS Hook
        ↓
Verify Standard Webhooks signature
        ↓
ONE atomic database transaction
- insert or resolve webhook ID
- consume one matching unexpired phone send permit
- verify durable test policy is enabled
- verify destination-HMAC allowlist
- verify one-segment maximum
- verify global UTC-day budget
- verify destination UTC-day budget
- reserve the segment permanently for the test day
- mark one provider attempt authorized
        ↓
AUTHORIZED / bounded denial
        ↓
At most one Telnyx provider attempt
```

The final safety question is:

> **May this authenticated SMS-send attempt reserve one segment and authorize at most one Telnyx provider attempt?**

Never describe SMS delivery, provider acceptance, or the provider attempt as exactly-once. The guaranteed property is **at-most-one provider attempt** for one authorized hook/send permit. Once durable state authorizes that attempt, no retry, replay, restart, or ambiguous network result may authorize another attempt.

This safety choice may occasionally lose an OTP if the process fails after authorization but before a conclusively observed provider response. That is acceptable for this isolated test; a possible duplicate charge/message is not.

## Goal

Build the smallest production-grade durable safety boundary for the isolated phone-auth test path. It must support:

1. atomic browser-side OTP-request authorization;
2. privacy-safe per-phone request rate state;
3. privacy-safe per-IP request rate state;
4. resend cooldown state;
5. one-use, short-lived phone send permits;
6. webhook-ID idempotency;
7. durable test-policy authority;
8. global UTC-day SMS segment budget;
9. per-destination UTC-day segment budget;
10. a one-segment message maximum;
11. permanent reservation before the provider call; and
12. conservative handling of ambiguous provider outcomes.

Do not implement verification-attempt state unless the audit proves Corralio must own it. Prefer Supabase's authoritative OTP verification, expiry, invalidation, replay, and attempt controls where sufficient.

Corralio owns send authorization, request/resend rate control, one-use permits, webhook idempotency, and segment economics. Do not build broader conversational SMS behavior.

## Storage authority

Use repository-consistent shared durable storage. Prefer existing Supabase PostgreSQL unless the repository audit finds a concrete blocker.

Do not introduce Redis, Upstash, KV, or another infrastructure vendor without explicit founder approval.

Authoritative state must be shared across Vercel instances and survive process restarts. Do not rely on:

- filesystem state;
- in-memory maps;
- process-local mutexes;
- operator procedure; or
- one-instance assumptions.

The deployed path must never silently fall back to the local file ledger. If the durable database boundary is unavailable, SMS authorization fails closed.

## Durable policy authority

For this isolated Gate 3 test, authoritative policy lives durably in PostgreSQL. Secrets remain outside PostgreSQL.

Durable policy may contain only the minimum bounded controls, including:

- send mode: `test_allowlist`;
- enabled/disabled state;
- global daily segment limit: `20`;
- per-destination daily segment limit: `5`;
- maximum segments per message: `1`; and
- allowed destination HMACs.

Do not make deployment environment variables a competing policy authority for these values. Environment configuration may identify the intended mode for startup validation, but the atomic database decisions must use the durable policy state.

PostgreSQL must not contain:

- the HMAC secret;
- raw phone numbers;
- raw IP addresses;
- OTP codes;
- Turnstile tokens;
- SMS message bodies;
- Telnyx credentials; or
- raw provider/webhook payloads.

Use `CORRALIO_SMS_CHANNEL_HMAC_SECRET` only within trusted server code to derive deterministic privacy-safe phone and IP bucket identities. Do not print or expose derived HMAC values unnecessarily.

## Credential authority and phone normalization

Supabase Auth remains authoritative for the raw verified phone credential.

Use one canonical E.164 normalization and validation rule before deriving the destination HMAC. The raw phone may exist transiently inside the trusted request/hook/provider path where required, but it must not be persisted in the safety-state tables, returned to the browser from server status responses, logged, or added to analytics.

The durable channel/safety projection is a privacy-safe authorization index, not a duplicate credential store.

## Trusted IP boundary

Audit the deployed request architecture and identify the narrow platform-provided source used as trusted client-IP evidence. Do not accept a caller-supplied arbitrary IP value as authoritative.

Normalize the trusted IP inside server code, derive an IP HMAC using the approved secret/domain separation, and persist only the privacy-safe bucket identity required for rate enforcement. If a trustworthy client IP cannot be established in the intended runtime, stop and report the blocker rather than claiming IP enforcement.

## Browser OTP-request authorization and one-use permit

The browser must request phone OTP authorization through a same-origin, CSRF/origin-protected Corralio server boundary before calling Supabase phone Auth.

That boundary must use one atomic database operation to:

1. verify durable policy is enabled and in `test_allowlist` mode;
2. verify the destination HMAC is allowlisted;
3. enforce the phone-HMAC request limit;
4. enforce the IP-HMAC request limit;
5. enforce resend cooldown;
6. record the bounded authorization outcome; and
7. issue exactly one short-lived, one-use send permit associated with the destination HMAC.

The permit must:

- be unguessable or represented by an unguessable server-side identity;
- be scoped to one destination HMAC;
- have a short explicit expiry;
- be consumable exactly once by the hook authorization transaction;
- be unusable after denial, expiry, consumption, or policy disablement; and
- contain no raw phone or IP data.

Because Supabase's phone-auth call does not carry arbitrary Corralio metadata into the hook, the implementation may resolve the permit by the normalized destination HMAC and the bounded unexpired/unused state. The browser-request transaction and cooldown rules must prevent ambiguous multiple live permits for the same destination.

Someone calling Supabase Auth directly must not be able to cause a Telnyx attempt. A signed Send SMS Hook without a matching unexpired Corralio permit must receive a bounded denial and must not reserve a segment or call Telnyx.

The browser receives only the bounded information needed to proceed or display a generic failure. It must not receive ledger rows, counters, HMACs, or policy internals.

## Atomic Send SMS Hook authorization

Verify the Standard Webhooks signature and required signed metadata before invoking the durable authorization transaction. Signature failure must not create or consume permits, claims, or budget state.

After signature verification, implement one authoritative database function/transaction that atomically:

1. validates and inserts/resolves the normalized webhook ID;
2. rejects an already resolved or previously authorized webhook replay;
3. locates and consumes one matching unexpired destination-HMAC send permit;
4. verifies durable policy remains enabled and in the expected test mode;
5. verifies the destination HMAC remains allowlisted;
6. verifies the computed message segment count is exactly one and within policy;
7. checks the global UTC-day segment budget;
8. checks the destination UTC-day segment budget;
9. permanently reserves the segment for that UTC test day;
10. marks the provider attempt authorized before returning; and
11. returns one bounded decision.

Do not split permit consumption, webhook claim, policy checks, budget checks, segment reservation, or attempt authorization into separate raceable queries.

The provider adapter may be called only after this operation returns `authorized`. No other state or exception path may authorize a Telnyx call.

## At-most-one provider-attempt rule

Once the transaction marks a provider attempt authorized:

- the webhook ID can never authorize another attempt;
- the permit remains consumed;
- the segment remains permanently reserved for that UTC test day;
- a duplicate hook returns a bounded duplicate/already-resolved outcome;
- a process crash before the call does not permit a retry;
- a timeout, connection loss, malformed response, or unknown provider acceptance state does not permit a retry; and
- a conclusive Telnyx rejection does not release the segment or permit in this isolated Gate 3 test.

Do not implement segment release, refund, reconciliation, or reusable authorization in this task. At the approved 20-segment test cap, conservative permanent consumption is deliberately simpler and safer.

Provider result metadata, if recorded, must be bounded and sanitized. Do not store provider payloads or sensitive error text.

## Required schema concepts

Design the smallest schema consistent with repository conventions. It will likely require bounded equivalents of:

### Durable SMS test policy

- one authoritative policy/version identity;
- enabled state;
- `test_allowlist` mode;
- global limit;
- destination limit;
- maximum segments/message; and
- timestamps/version metadata.

### HMAC allowlist

- destination HMAC;
- policy/version association or active state; and
- no plaintext destination.

### Phone send permits

- opaque permit identity;
- destination HMAC;
- issued/expiry timestamps;
- consumed timestamp or bounded state;
- no raw phone/IP; and
- constraints/indexes preventing ambiguous multiple live permits where practical.

### Webhook claims/attempt authorization

- normalized webhook ID;
- first-seen time;
- destination HMAC;
- permit identity;
- bounded decision/state;
- provider-attempt-authorized timestamp;
- bounded provider outcome/message identity where justified; and
- retention metadata.

### Daily budgets

- UTC date;
- global reserved segments; and
- per-destination reserved segments keyed by destination HMAC.

### Request rate/cooldown state

- privacy-safe bucket type and HMAC/key;
- window start/count;
- cooldown-until; and
- timestamps.

These names are illustrative. Follow repository naming conventions and use constraints, unique indexes, row locking, and conflict behavior that prove the invariants.

## Bounded decision results

Browser authorization and hook authorization should return small closed decision categories rather than internal state. Use repository-consistent names equivalent to:

- `authorized`;
- `duplicate`;
- `missing_permit`;
- `expired_permit`;
- `rate_limited`;
- `cooldown`;
- `global_cap`;
- `destination_cap`;
- `invalid_mode`;
- `policy_disabled`;
- `not_allowlisted`;
- `segment_limit`; and
- `blocked`.

Do not return phone numbers, raw counters, secret values, HMAC material, internal rows, or sensitive failure details.

## OTP verification boundary

Audit and document what Supabase owns for:

- OTP creation and delivery-hook invocation;
- OTP verification;
- failed verification attempts;
- expiry and invalidation; and
- replay prevention.

Do not implement a parallel Corralio verification-attempt system unless the audit demonstrates a concrete pre-test safety gap. Corralio request/send limits must not be described as Supabase OTP-verification limits.

## Send SMS Hook integration seam

Implement the internal handler/service boundary so a future signed Supabase hook can execute:

```text
verified hook request
→ normalize destination and derive HMAC
→ atomic permit/webhook/policy/budget authorization
→ at-most-one mocked Telnyx adapter attempt
```

Do not configure or expose the external hook as part of Stage 1 unless explicitly authorized after database verification. No live provider call is authorized. Use a mock Telnyx adapter.

## Turnstile boundary

Preserve:

```text
Browser obtains Turnstile token
→ token passed to Supabase phone Auth
→ Supabase performs authoritative verification
```

Do not redeem the same token in Corralio. This task does not configure Cloudflare.

CAPTCHA is one layer in the abuse matrix, not the SMS cost boundary. The durable Corralio permit and hook authorization remain mandatory even when Turnstile succeeds.

## RLS and service boundary

Use service-role/server-only access for durable SMS safety tables and functions. Force RLS where consistent with repository security conventions.

Ordinary anonymous or authenticated clients must not be able to:

- read policy, permits, counters, claims, or destination HMACs;
- issue or consume permits directly;
- create/resolve webhook claims;
- reserve/release segments;
- alter rate state or cooldowns; or
- enable/change test policy.

Expose browser authorization only through the narrow same-origin protected server boundary. Expose hook authorization only to verified trusted server code.

## Required verification

### Focused offline tests

At minimum prove:

1. canonical phone and trusted-IP normalization/HMAC domain separation;
2. missing HMAC secret fails closed;
3. missing/invalid/disabled durable policy fails closed;
4. direct hook without a matching permit is denied before provider invocation;
5. one permit can be consumed only once;
6. expired permits are denied;
7. per-phone request limit works;
8. per-IP request limit works;
9. resend cooldown works;
10. destination allowlist uses HMAC identity;
11. one-message segment maximum is enforced;
12. provider timeout retains permit consumption and segment reservation;
13. conclusive provider rejection also retains the reservation;
14. duplicate webhook never makes a second mock provider attempt;
15. database/ledger failure blocks sending;
16. bounded decisions expose no internal state;
17. no durable table contains raw phone/IP, OTP, Turnstile token, message body, secret, or provider payload;
18. no deployed/runtime code silently falls back to the local file ledger; and
19. no test makes a live Telnyx call.

### Real PostgreSQL verification gate

Mocks and source inspection cannot prove distributed atomicity. Prepare:

- an unapplied forward migration;
- a read-only catalog verifier; and
- a rollback-only behavioral verifier that runs against actual PostgreSQL.

The behavioral verifier must prove at minimum:

```text
same webhook ID + same permit
two concurrent hook authorizations
→ exactly one authorization
→ one permit consumer
→ one permanently reserved segment
```

```text
global reserved count = 19
two concurrent one-segment authorizations with distinct valid permits/webhook IDs
→ exactly one authorization
→ one bounded cap denial
→ final reserved count = 20
```

Also prove:

- per-destination cap concurrency cannot exceed its limit;
- one permit cannot be consumed by two distinct webhook IDs;
- policy disablement wins before new authorization;
- untrusted roles cannot access tables or functions;
- failed/rolled-back verification leaves cleanup zero; and
- no provider call is required by the database verifier.

Use real concurrent PostgreSQL sessions where needed; do not substitute sequential calls and describe them as a race test.

## Migration and execution stages

### Stage 1 — Repository implementation only

1. Audit current repository and provider-contract evidence.
2. Implement bounded repository code and offline tests.
3. Prepare the unapplied forward migration.
4. Prepare the catalog and rollback-only behavioral verifiers.
5. Do not mutate any applied Supabase database.
6. Do not configure Supabase, Turnstile, Telnyx, or Vercel.
7. Stop at:

`DURABLE GATE 3 STATE READY FOR DATABASE VERIFICATION`

or, if the design cannot satisfy the invariant:

`DURABLE GATE 3 STATE BLOCKED`

### Database verification — human migration gate

After a human applies the migration to the authorized isolated database:

1. run the read-only catalog verifier;
2. run the rollback-only behavioral/concurrency verifier;
3. confirm same-webhook, 19/20 global-cap, destination-cap, and permit-consumption races;
4. confirm forced-RLS/service-only boundaries;
5. confirm rollback cleanup zero; and
6. report exact results.

Only after every database check passes may the verdict become:

`DURABLE GATE 3 STATE READY FOR ISOLATED PROJECT CONFIGURATION`

Otherwise return:

`DURABLE GATE 3 STATE BLOCKED`

This verdict does not mean full Gate 3 is ready and does not authorize a live SMS.

## Required output

### A. Verdict

Return only the verdict appropriate to the stage actually completed.

### B. Architecture

Show both atomic boundaries:

```text
Browser → Corralio request authorization → one-use phone permit → Supabase
Supabase signed hook → consume permit + webhook ID + policy + budgets → at-most-one Telnyx attempt
```

### C. Files changed

List exact repository paths.

### D. Schema and RPCs

List exact migrations, tables, indexes, constraints, functions/RPCs, grants, and RLS/service-role boundaries.

### E. Atomicity proof

Explain why:

- direct Supabase Auth calls cannot bypass Corralio's permit;
- duplicate hooks cannot authorize two attempts;
- one permit cannot authorize two webhook IDs;
- concurrent requests cannot exceed either budget;
- authorized segments are never released in this test; and
- an unavailable ledger fails closed.

### F. OTP boundary

State exactly what Corralio owns and what Supabase owns.

### G. Privacy boundary

Confirm durable policy contains only approved controls and HMAC identities, while secrets and raw sensitive values remain outside PostgreSQL.

### H. Verification

Report every offline test and, when authorized/applied, every real-PostgreSQL catalog/behavioral result. Do not claim mocked concurrency proves the database race guarantees.

### I. Remaining external configuration

Separate isolated Supabase, Turnstile, Send SMS Hook, Telnyx campaign/test authorization, Vercel, and test-handset requirements.

### J. Founder checklist

List only external founder-controlled inputs still required. Do not print secrets.

### K. Next prompt

Only after `DURABLE GATE 3 STATE READY FOR ISOLATED PROJECT CONFIGURATION`, provide the narrow next prompt for configuring and verifying the isolated Supabase and Turnstile environment.

## Constraints

- no live SMS;
- no live OTP;
- no segment release or reconciliation;
- no Telnyx mutation;
- no applied Supabase mutation during Stage 1;
- no production Supabase mutation;
- no Cloudflare configuration;
- no deployment;
- no 10DLC submission;
- no `/sms` activation;
- no marketing;
- no commit or push unless separately authorized;
- preserve existing email Auth behavior;
- fail closed everywhere; and
- keep scope limited to Gate 3 durable safety state.

## Mandatory scope statement

This durable-state task cannot authorize Track A implementation or a live phone-OTP test by itself. Full Gate 3 still requires the separately controlled isolated Supabase phone Auth, Cloudflare Turnstile, rate-limit, Send SMS Hook, Telnyx authorization, and explicit live-test gates defined by the canonical Phase A+B prompt.

## Final test

This task succeeds only if Corralio has one shared, persistent, atomic browser-request boundary and one shared, persistent, atomic hook-authorization boundary capable of answering:

> **May this authenticated SMS-send attempt reserve one segment and authorize at most one Telnyx provider attempt?**

across concurrent Vercel instances, direct Supabase calls, retries, restarts, and provider ambiguity.

It must not create a second authentication system, a generic messaging platform, or a new infrastructure vendor merely to solve that question.
