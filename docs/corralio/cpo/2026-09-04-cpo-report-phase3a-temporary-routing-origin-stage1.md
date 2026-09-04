# Slice 3.6B Phase 3A — Temporary Routing Origin Stage 1

**Status:** Stage 1 database verification passed; bounded Stage 2 UAT is next.

**Database closeout, 2026-09-04:** A human applied the migration. The first behavioral run exposed a losing duplicate-claim return of SQL `NULL` rather than explicit `false`; no duplicate claim/provider authorization occurred. The narrow repair migration changed the RPC to `coalesce(..., false)` and the catalog contract now requires it. The updated catalog verifier passed, and the rollback-only behavioral verifier passed with cleanup zero.

## Delivered boundary

Phase 3A changes only the selected-origin drive duration for one event. Required arrival remains owned by the completed shared resolver:

`ics_explicit → source_preference → team_preference → corralio_default`

Leave-by remains `resolved required-arrival timestamp − selected-origin drive duration`. No arrival preference, required-arrival timestamp, or leave-by result is duplicated in the new schema. What Fits remains unchanged.

The event card uses progressive disclosure. Home is the reload default unless a typed alternate address exists for the event. Current location is acquired from one user gesture, sent through a narrow server-only one-event routing boundary, returned only as a drive duration, and retained only in client session state. Neither its coordinates nor its derived route are persisted. A payload-free short-lived claim prevents concurrent or replayed clicks from authorizing duplicate provider calls.

Only a typed alternate address can be stored durably. It is private household/event data protected by a composite event ownership foreign key, forced RLS, an owner-derived authenticated write boundary, and service-only provider mutation. Its route freshness depends on both origin and destination geocoding timestamps. The active lifecycle is calculated from the event's current end (or start when there is no end) plus 24 hours, so a reschedule changes lifecycle truth without a stale copied expiry. A separate capped cleanup worker hard-deletes expired rows.

## Database gate — passed 2026-09-04

Applied and verified, in order:

- `supabase/migrations/20260904_corralio_slice36b_phase3a_temporary_routing_origin.sql` — applied by a human.
- First behavioral run: correctly rejected as ambiguous (SQL `NULL` rather than explicit `false`) on the losing side of a duplicate current-location claim; no duplicate provider authorization occurred.
- `supabase/migrations/20260904_corralio_slice36b_phase3a_claim_result_repair.sql` — narrow repair, applied by a human: RPC now returns `coalesce(v_claim_token = p_claim_token, false)`.
- `scripts/analysis/corralio_slice36b_phase3a_catalog_verification.sql` (strengthened to require the exact repaired boolean expression) — read-only, passed: `SLICE 3.6B PHASE 3A CATALOG VERIFICATION PASSED`.
- `scripts/analysis/corralio_slice36b_phase3a_behavioral_verification.sql` — rollback-only, passed with cleanup zero: `SLICE 3.6B PHASE 3A BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO`. Proved owner access, cross-household denial, direct-write denial, Home non-mutation, duplicate current-location claim rejection (now correctly `false`, not `NULL`), current-event-time reschedule cleanup, and cleanup zero.

Stage 2 browser/provider UAT (Home, alternate address, ephemeral current location, reload/clear behavior, provider usage accounting, cleanup) is next, separately gated. Physical-device GPS behavior remains its own gate — see below.

## Verification

- Focused Phase 3A/weekend tests: 31/31 passed.
- Complete Corralio tests: 371/371 passed.
- Corralio TypeScript: passed.
- Corralio lint: passed with zero warnings.
- Production builds: Corporate, Corralio, RefereeInsights, and TournamentInsights passed. Existing warning-only RI/TI lint debt is unchanged.
- `git diff --check`: passed.
- Database connections/mutations and external provider calls: zero.

Physical-device GPS permission, native location behavior, and weak-connectivity behavior remain unverified and belong to the separately planned combined physical-device gate.
