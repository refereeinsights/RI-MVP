# Slice 3.6B Phase 3A — Temporary Routing Origin Stage 1

**Status:** `SLICE 3.6B PHASE 3A READY FOR DATABASE VERIFICATION`

## Delivered boundary

Phase 3A changes only the selected-origin drive duration for one event. Required arrival remains owned by the completed shared resolver:

`ics_explicit → source_preference → team_preference → corralio_default`

Leave-by remains `resolved required-arrival timestamp − selected-origin drive duration`. No arrival preference, required-arrival timestamp, or leave-by result is duplicated in the new schema. What Fits remains unchanged.

The event card uses progressive disclosure. Home is the reload default unless a typed alternate address exists for the event. Current location is acquired from one user gesture, sent through a narrow server-only one-event routing boundary, returned only as a drive duration, and retained only in client session state. Neither its coordinates nor its derived route are persisted. A payload-free short-lived claim prevents concurrent or replayed clicks from authorizing duplicate provider calls.

Only a typed alternate address can be stored durably. It is private household/event data protected by a composite event ownership foreign key, forced RLS, an owner-derived authenticated write boundary, and service-only provider mutation. Its route freshness depends on both origin and destination geocoding timestamps. The active lifecycle is calculated from the event's current end (or start when there is no end) plus 24 hours, so a reschedule changes lifecycle truth without a stale copied expiry. A separate capped cleanup worker hard-deletes expired rows.

## Database gate

Prepared but unapplied:

- `supabase/migrations/20260904_corralio_slice36b_phase3a_temporary_routing_origin.sql`
- `scripts/analysis/corralio_slice36b_phase3a_catalog_verification.sql`
- `scripts/analysis/corralio_slice36b_phase3a_behavioral_verification.sql`

After a human applies the migration, run the catalog verifier read-only and the behavioral verifier rollback-only. The latter proves owner access, cross-household denial, direct-write denial, Home non-mutation, duplicate current-location claim rejection, current-event-time reschedule cleanup, and cleanup zero. Stage 2 browser/provider UAT remains separately gated after those pass.

## Verification

- Focused Phase 3A/weekend tests: 31/31 passed.
- Complete Corralio tests: 371/371 passed.
- Corralio TypeScript: passed.
- Corralio lint: passed with zero warnings.
- Production builds: Corporate, Corralio, RefereeInsights, and TournamentInsights passed. Existing warning-only RI/TI lint debt is unchanged.
- `git diff --check`: passed.
- Database connections/mutations and external provider calls: zero.

Physical-device GPS permission, native location behavior, and weak-connectivity behavior remain unverified and belong to the separately planned combined physical-device gate.
