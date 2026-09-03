# Corralio Phase A+B Stage 1 Closeout

**Verdict:** `CORRALIO PHASE A+B DATABASE VERIFICATION PASSED`

## Implemented repository boundary

- A product phone-auth surface and Route Handler pair, independently fail-closed and not adapted from `/gate3-isolated`.
- Manual phone OTP for new and returning users; successful verification provisions the existing owner household and only then creates the HMAC-only channel projection from the server-confirmed Auth credential.
- Signed-in phone change with durable request authorization, `phone_change` OTP verification, and replacement of the prior active projection.
- A separate product Send SMS Hook using the already-proven Gate 3 signature, one-use permit, webhook-idempotency, and segment-budget boundary.
- A separate Telnyx inbound idempotency domain, raw-body Ed25519 verification, bounded URL/reply parsing, current membership resolution before retrieval, shared schedule ingestion, encrypted pending intake, deterministic resolution, cancellation, expiry, and terminal secret deletion.

## Assignment evidence rule

`corralio-sms-assignment-v1` requires all of:

1. exact normalized CALNAME equals the existing active team name;
2. at least one event title contains the exact normalized full team name;
3. exactly one eligible household team satisfies both signals.

No fuzzy similarity is used. CALNAME alone is insufficient. Event-title text alone is insufficient. Conflicts or missing evidence create a bounded pending clarification. The independently authorized CALNAME parser micro-slice has now landed locally: the current server adapter supplies the shared parser's bounded `calendarName` instead of `null`, allowing this unchanged corroboration rule to operate on real feed metadata. This adds no new identity write or inference rule and remains subject to the same parent-clarification fallback.

The concrete parser returns the field on every success/failure path. Its exported TypeScript field remains optional only for backward compatibility with established injected parser fakes in refresh tests; the server adapter normalizes absence to `null`. This type-level accommodation changes neither the real parser contract nor the assignment rule.

Micro-slice closeout verification passed 377 Corralio/shared tests, the 10 unchanged TI ICS-import tests, Corralio TypeScript, zero-warning Corralio lint, and all four production builds. Direct diff review confirmed no identity-table write, schema, migration, provider, or product-surface expansion.

## Security and privacy result

The migration adds no raw phone, email, URL, message-body, OTP, or provider-payload columns. Channel resolution uses a domain-separated HMAC. Pending URLs use the settled `pendingSecret.server.ts` versioned AES-256-GCM envelope plus its separately keyed fingerprint. Unknown senders stop before calendar retrieval. Vendor replay claims and Supabase outbound-hook claims remain separate. All new database state is forced-RLS and reachable only through narrowly granted service-role functions. Logs are constant/payload-free.

## Deliberate Stage 1 limits

- The production migration and all three database verifiers have passed; product activation remains unauthorized.
- All product activation flags remain unset.
- Inbound clarification delivery is mock-only.
- No live Telnyx, handset, OTP, provider, configuration, deployment, or production Auth evidence was produced.
- Resend inbound email is deferred because authenticated-sender evidence remains unproven.
- Optional arrival questioning is not introduced; the existing 3.6B resolver and narrow source-preference writer remain authoritative and unchanged.
- SMS Production Readiness remains an independent gate and is not implied by this verdict.

## Verification

- Corralio tests: 321 passed.
- Pending-secret boundary tests: 13 passed.
- Corralio TypeScript: passed.
- Corralio lint: passed with zero warnings.
- Corralio production build: passed.
- Concurrency verifier syntax: passed.
- `git diff --check`: passed.

## Production database verification

- Human migration application: complete.
- Catalog verifier: `CORRALIO PHASE A+B CATALOG VERIFICATION PASSED`.
- Rollback-only behavioral verifier: `CORRALIO PHASE A+B BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO`.
- Real concurrent inbound-event race: exactly one `claimed`, exactly one `duplicate`.
- Real concurrent pending-intake race: exactly one creation, exactly one reuse, exactly one open row before cleanup.
- Final result: `CORRALIO PHASE A+B CONCURRENCY VERIFICATION PASSED; CLEANUP ZERO`.
- Independent post-run inspection confirmed zero synthetic inbound-claim, pending-intake, Auth-user, and household rows.

The concurrency verifier uses parallel service-role PostgREST RPC calls, which execute as independent PostgreSQL transactions through the production application boundary. Exact fixture setup, assertions, and cleanup use the authenticated linked-project Supabase Management API. It verifies that the API and linked database project references match before mutation. This transport avoids introducing or rotating a production database password and does not alter the database architecture or race assertions.

## Next gate

Stop for explicit Stage 2/provider configuration and UAT authorization. Database verification alone does not authorize live SMS, product flags, Telnyx, handset delivery, deployment, or push.
