# Corralio — Gate 3 Durable State Database Verification

Execute database verification only for the already-implemented Gate 3 durable SMS safety state.

Do not begin Phase A+B phone authentication or schedule intake. Do not configure Supabase Auth, Cloudflare Turnstile, Telnyx, DNS, webhooks, or another external provider. Do not send a live OTP or SMS.

## Starting gate

The repository must already be at:

`DURABLE GATE 3 STATE READY FOR DATABASE VERIFICATION`

Artifacts:

- `supabase/migrations/20260831_corralio_sms_durable_safety_state.sql`
- `scripts/analysis/corralio_sms_durable_state_catalog_verification.sql`
- `scripts/analysis/corralio_sms_durable_state_behavioral_verification.sql`
- `scripts/analysis/corralio_sms_durable_state_concurrency_verification.mjs`

Preserve the approved invariants: one-use permits, webhook deduplication, at-most-one provider-attempt authorization, atomic policy/permit/budget decisions, permanent one-segment reservation, global and destination caps, durable PostgreSQL policy authority, database clock authority, HMAC-only identities, forced RLS, service-only RPC access, fail-closed database behavior, and no deployed file-ledger fallback.

## Scope and stop boundary

Perform only:

1. isolated-target proof and prerequisite preflight;
2. atomic application of the one durable-state migration;
3. catalog verification;
4. rollback-only behavioral verification;
5. real multi-session PostgreSQL concurrency verification;
6. exact policy restoration and cleanup-zero proof; and
7. migration-ledger observation.

No repository changes are expected. If a migration or verifier defect is found, stop and report it. Do not patch the artifact during this run without separate authorization.

## Dedicated connection variable

Use only:

`CORRALIO_ISOLATED_DATABASE_URL`

Do not use `CORRALIO_DATABASE_URL`. Do not load the repository or application `.env.local`. The variable must be supplied explicitly from an approved isolated-verification environment and must never be printed.

## Prove isolation before mutation

`--confirm-isolated` is an operator assertion, not isolation proof by itself.

Before applying the migration:

- identify the Supabase project reference without printing credentials;
- compare it with the known production and staging project references;
- establish concrete evidence that the target is disposable/isolated;
- record only the non-secret project reference and evidence classification; and
- stop if the target cannot be distinguished confidently from every active Corralio/TI/RI database.

Do not infer isolation merely from a connection-string label. If isolation is not proven, return `DURABLE GATE 3 STATE DATABASE VERIFICATION BLOCKED`.

## Prerequisite preflight

Read-only preflight must confirm the target already provides:

- expected Supabase roles, including `anon`, `authenticated`, and `service_role`;
- the `auth.role()` boundary used by the RPCs;
- `gen_random_uuid()` and every required extension/function;
- the expected privileged `postgres` owner role; and
- any prerequisite schema object actually referenced by the migration.

Do not apply unrelated migrations to manufacture prerequisites. A missing prerequisite blocks verification.

The catalog verifier must also establish that runtime authorization timestamps and UTC budget dates come from the database clock. A caller-supplied timestamp parameter on a service RPC does not satisfy database clock authority.

## Atomic migration application

Apply only the durable-state migration:

```bash
psql "$CORRALIO_ISOLATED_DATABASE_URL" \
  -X \
  -v ON_ERROR_STOP=1 \
  --single-transaction \
  -f supabase/migrations/20260831_corralio_sms_durable_safety_state.sql
```

Do not apply unrelated pending migrations. Do not modify production schema. Do not print connection details.

## Migration-ledger observation

Explicitly determine and report whether raw `psql` application records `20260831_corralio_sms_durable_safety_state.sql` in the isolated Supabase project's migration ledger.

If it does not:

- report that fact;
- document the intended isolated-project reset or later ledger-handling plan; and
- do not insert, update, repair, or backfill migration-history records.

No migration-history manipulation is authorized.

## Catalog verification

Run `scripts/analysis/corralio_sms_durable_state_catalog_verification.sql` and require proof of:

- all expected tables and function signatures;
- all expected indexes and unique constraints;
- closed status/decision constraints and bounded-value checks;
- database clock authority;
- forced RLS;
- `SECURITY DEFINER` RPCs owned by `postgres`;
- fixed `search_path`;
- no prohibited `PUBLIC`, `anon`, or `authenticated` access;
- the service-role/RPC-only boundary;
- disabled, bounded initial policy state;
- permanent segment reservation without release/refund behavior; and
- no raw-sensitive-data columns.

Invalid send mode is proven by the closed `test_allowlist` constraint plus defensive RPC handling. Do not weaken the constraint to construct an invalid fixture.

## Behavioral verification

Run `scripts/analysis/corralio_sms_durable_state_behavioral_verification.sql` rollback-only. It must prove:

- disabled policy;
- non-allowlisted destination;
- expired permit;
- one-segment limit;
- consumed-permit reuse denial;
- terminal webhook replay;
- phone/IP rate and resend cooldown behavior;
- global cap;
- destination cap;
- provider-attempt authorization only after permit consumption and segment reservation;
- ordinary-role access denial; and
- rollback cleanup zero.

No provider call is permitted.

## Real PostgreSQL concurrency verification

From an approved environment with `psql`, run:

```bash
CORRALIO_ISOLATED_DATABASE_URL='isolated-database-connection' \
node scripts/analysis/corralio_sms_durable_state_concurrency_verification.mjs \
  --confirm-isolated
```

Do not print the connection string. Do not load `.env.local`.

Before mutation, the runner must capture the database-authoritative current UTC date, assert that date plus its fixed synthetic namespace is empty, and refuse to start within five minutes of UTC midnight. It must not delete pre-existing rows as setup.

### Race A — same webhook ID

Two concurrent calls use the same webhook ID:

- exactly one authorizes;
- the other returns duplicate/terminal; and
- at most one segment is reserved.

### Race B — global 19/20 cap

Two distinct eligible one-segment requests contend with the global budget at 19/20:

- exactly one authorizes;
- exactly one returns `global_cap`; and
- the final global count is 20.

### Race C — destination cap

Use an otherwise valid unused permit with its destination already at 5/5:

- decision is `destination_cap`;
- permit `consumed_at` remains `NULL`;
- permit closes with `close_reason = destination_cap`;
- `provider_attempt_authorized_at` remains `NULL`;
- global count remains unchanged; and
- destination count remains unchanged at 5.

`missing_permit`, permit consumption, or counter mutation is not destination-cap proof.

### Race D — one permit / two webhook IDs

Below both budget caps, two distinct webhook IDs contend for one valid permit:

- exactly one consumes the permit;
- exactly one receives provider-attempt authorization;
- the other receives a bounded missing/consumed-permit result; and
- exactly one segment is reserved.

Do not combine Race C and Race D.

## At-most-once terminology

The verified property is:

> One valid hook invocation path may reserve one segment and authorize **at most one** Telnyx provider attempt.

Do not claim exactly-once delivery or provider execution. A crash after authorization can produce zero provider calls; an ambiguous future response can leave delivery unknown. Neither permits reauthorization.

## Fixture privacy and cleanup zero

Use only fixed synthetic webhook identifiers and HMAC-shaped identities. Never persist or print raw phone numbers, IP addresses, OTPs, SMS bodies, Turnstile tokens, webhook bodies/signatures, provider payloads, API keys, HMAC secrets, or credentials.

Snapshot the complete durable policy singleton before mutation. Cleanup must execute through `finally` or equivalent fail-safe behavior and must:

- remove verifier rows from all eight durable-state tables;
- restore every policy field exactly, including `updated_at`; and
- independently assert the fixture namespace/date is empty and the complete policy row equals its pre-test state.

The eight tables are:

- `corralio_sms_test_policy` (exact restoration proof);
- `corralio_sms_test_allowlist`;
- `corralio_sms_request_rate_state`;
- `corralio_sms_request_decisions`;
- `corralio_sms_phone_send_permits`;
- `corralio_sms_webhook_claims`;
- `corralio_sms_daily_segment_budgets`; and
- `corralio_sms_destination_segment_budgets`.

If cleanup cannot be proven, verification fails.

## Trusted-IP and external-call boundaries

This database test proves only HMAC rate-state semantics after a trusted IP HMAC is supplied. Vercel trusted-IP behavior remains for isolated-project runtime configuration.

Expected external provider calls are zero, including Telnyx, Supabase Auth OTP, Turnstile, Resend, Geocodio, ORS, Mapbox, HotelPlanner, and push providers. The explicitly authorized isolated PostgreSQL connection is not a provider call.

## Required report

Return:

1. the exact allowed verdict;
2. non-secret target-isolation evidence;
3. prerequisite and atomic migration results;
4. catalog results by material security property;
5. behavioral results by invariant;
6. separate Race A/B/C/D results with bounded final counters/states;
7. exact policy-restoration and cleanup-zero results;
8. external provider-call count;
9. migration-ledger observation and non-mutating follow-up plan;
10. files changed, expected to be none; and
11. remaining isolated-project Auth/runtime requirements only.

## Allowed verdicts

On complete success:

`DURABLE GATE 3 STATE READY FOR ISOLATED PROJECT CONFIGURATION`

On any missing or failed proof:

`DURABLE GATE 3 STATE DATABASE VERIFICATION BLOCKED`

Do not claim full Gate 3 readiness. Do not configure Auth, Turnstile, a Send SMS Hook, trusted-IP runtime behavior, Telnyx testing/campaign state, or a handset. Do not send an OTP/SMS. Do not deploy, push, commit, or modify repository artifacts.
