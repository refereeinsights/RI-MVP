# Corralio Slice 4.4C Stage 1

## Verdict

`SLICE 4.4C READY AFTER MIGRATION AND STAGE 2 VERIFICATION`

The migration is prepared but unapplied. Stage 1 made no database mutation, provider request, source-feed fetch, canonical venue write, deployment, or push.

## Audit and quick-check verdict

`QUICK_CHECK_NOT_STRONG_ENOUGH`

TI's current venue quick-check endpoint accepts anonymous browser-scoped, subjective observations and only optionally associates a later claim with a user. It is useful product feedback, but it is not audited strong corroboration for shared canonical truth. The production 4.4C evidence vocabulary is therefore exactly `ics_observation`; there is no production strong-evidence writer, and the expected production promotion-eligible count is zero. Synthetic future strong-evidence behavior exists only at the pure deterministic eligibility-rule test boundary.

The 4.4B audit also confirmed that provisional identities remain structurally separate from `public.venues`, current event-to-venue state is held in the private forced-RLS association table, event geocodes are reusable without another provider call, and the post-persistence hook is separately caught so lifecycle/evidence failure cannot change ingestion success or schedule-source health.

## Lifecycle, evidence, and authority

- The provisional lifecycle is exactly `active`, `suppressed`, `merged`, or `reconciled`. Database coherence constraints require the appropriate merge/canonical target and forbid competing targets.
- Evidence is stored in a new postgres-owned, forced-RLS, policy-free table. Rows are typed and bounded, and uniqueness on provisional identity plus observation fingerprint makes repeat observations idempotent.
- The server derives versioned SHA-256 HMAC fingerprints from a dedicated `CORRALIO_EVIDENCE_FINGERPRINT_KEY`. The source-scope HMAC uses the stable internal schedule-source UUID; the observation HMAC additionally uses source-event identity and provisional identity. Raw URLs, credentials, household/event/source IDs, locations, descriptions, notes, and arbitrary JSON are not stored in the evidence table.
- Source deletion does not erase anonymized evidence history. The HMAC is intentionally non-reversible and cannot be joined back to a deleted source without the protected key and original internal identifier.
- Repeated events from one source increase raw observation count but not independent source-scope count. Generic ICS remains weak regardless of volume or scope count.
- Promotion eligibility is derived by versioned rule `corralio-promotion-eligibility-v1`; it is not a caller-writable flag. With the only production evidence type set to ICS, every provisional venue is correctly ineligible.
- Suppression is service-only, detaches current provisional associations, preserves the tombstone and evidence, records an immutable transition, and prevents recreation through the create/reuse boundary.
- Automated merging is limited to exact normalized name, address, city, and state. A separate trusted wrapper accepts only the enumerated `trusted_manual_duplicate` reason. The internal merge primitive is not executable by the runtime role.
- Merge operations lock deterministically, repoint every current private association, retain evidence on its original identity, record a transition, and flatten redirects to a one-hop survivor. Repeated operations are idempotent.
- Reconciliation can target only an existing exact canonical row visible through `venues_public`. It repoints every current association, records the canonical advisory ID and immutable transition, and never inserts or updates canonical venue data.
- The upgraded 4.4B create/reuse RPC is canonical-first and understands active, suppressed, merged, and reconciled identities. Runtime calls supply only server-derived fingerprints and continue inside the existing bounded, separately caught post-persistence phase.

## Security and public isolation

The evidence and transition tables are postgres-owned, forced-RLS, policy-free, and service-role read-only. Mutations occur only through fixed-search-path functions with explicit grants. `PUBLIC`, `anon`, and `authenticated` receive no function execution or table access. The canonical public surface is unchanged, and neither provisional lifecycle nor evidence appears in public venue search, SEO, sitemaps, exports, or consumer UI.

The migration deliberately removes the unaudited 4.4B V1 mutation functions as it installs the V2 boundaries. Missing fingerprint configuration fails with a constant payload-free error inside the existing best-effort enrichment boundary; there is no unkeyed or raw-value fallback.

## Prepared Stage 2 artifacts

- Migration: `supabase/migrations/20260825_corralio_slice44c_provisional_lifecycle_evidence.sql`
- Applied-migration repair: `supabase/migrations/20260825_corralio_slice44c_provisional_lifecycle_evidence_fix.sql`
- Catalog verifier: `scripts/analysis/corralio_slice44c_catalog_verification.sql`
- Rollback-only behavioral verifier: `scripts/analysis/corralio_slice44c_behavioral_verification.sql`
- Aggregate-only quality report: `scripts/analysis/corralio_slice44c_venue_quality.ts`

The report covers identity coverage, lifecycle counts, zero-association rows, duplicate candidates, raw-observation and distinct-source-scope distributions, supported strong-evidence counts, eligibility-rule version, and eligible count. It was typechecked but not run because the migration is unapplied; aggregate production results, including the expected zero eligible count, remain Stage 2 evidence.

The behavioral verifier uses fixed synthetic `.invalid` fixtures inside one explicit transaction ending in `ROLLBACK`. It covers evidence idempotency and independence, unsupported evidence rejection, suppression and forced-failure atomicity, exact/trusted merges and one-hop redirects, existing-canonical reconciliation without canonical mutation, retained anonymized evidence after source deletion, role denials, and an independent cleanup-zero assertion. It makes no provider or source-feed call.

After the original migration was applied, the behavioral verifier exposed a PL/pgSQL name collision between the V2 function's `provisional_venue_id` output variable and the evidence table column in the column-list `ON CONFLICT` target. The source migration now uses the named unique constraint, and the additive repair migration safely rewrites the already-installed function definition without mutating data. Both catalog and architecture verification reject recurrence of the ambiguous form.

## Validation and usage

- Corralio tests: **168 passed**.
- Corralio TypeScript: passed.
- Standalone aggregate-report TypeScript: passed.
- Corralio lint: passed with zero warnings or errors.
- Production builds: `corralio-app`, `corp-app`, `referee-app`, and `ti-web` all passed. RI/TI emitted existing unrelated warnings.
- `git diff --check`: passed.
- Incremental provider/source-feed calls: **0**.
- Cron, scheduled work, backfill, historical evidence creation, and canonical/public venue writes: **0**.

Stage 2 requires the human-applied migration, the server-only HMAC key (at least 32 characters), both SQL verifiers, disposable concurrency/lifecycle and signed-in browser regression, the aggregate report, usage verification, and independent cleanup-zero confirmation. No bulk lifecycle operation or canonical creation/promotion is authorized.

## ADR amendments proposed, not applied

The canonical ADR and roadmap files contain unrelated uncommitted changes, so they were neither edited nor staged. A later clean documentation change should record:

- provisional creation may be permissive only because the domain is structurally isolated; canonical/public promotion requires independently audited strong evidence;
- the four-state lifecycle, one-hop merge redirects, existing-canonical reconciliation, and immutable transition history;
- low-trust ICS evidence is durable and idempotent but never strong by repetition, and only anonymized keyed source-scope history survives private-source deletion;
- eligibility is deterministic, versioned, derived, and currently produces zero eligible venues because no production strong-evidence writer exists;
- future Overture or another strong evidence type requires its own migration, bounded typed fields, audited trusted source, and narrowly authorized writer.

## Explicit deferrals

Overture lookup/writes, Nearby, canonical venue creation or promotion, quick-check evidence ingestion, trusted-admin evidence insertion, generic strong-evidence writers, evidence backfill, cleanup/retention policy, lifecycle UI/dashboard, cron, routing changes, and provider changes remain deferred.
