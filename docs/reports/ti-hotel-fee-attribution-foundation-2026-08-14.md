# TI Hotel Fee Attribution Foundation — Implementation Report

Date: 2026-08-14
Status: Implemented locally; migration not applied

## Schema

Migration `20260814_ti_hotel_program_snapshot_foundation.sql` adds five nullable columns to `ti_outbound_clicks`: `hotel_program_type`, `hotel_program_rate_cents`, `hotel_program_beneficiary_type`, `hotel_program_beneficiary_id`, and `hotel_program_version`.

One cross-field CHECK allows only an all-NULL legacy state or a complete valid `standard`, `ti_revenue`, or `tournament_support` snapshot. There are no defaults and no backfill, so historical rows retain all-NULL economics. A `BEFORE UPDATE` trigger rejects every snapshot change, including NULL-to-non-NULL updates.

## Resolver contract and routing

`HotelProgramSnapshot` uses the accounting names `standard | ti_revenue | tournament_support`, with the rate stored separately in cents. `STANDARD_HOTEL_PROGRAM_SNAPSHOT` is the single frozen standard fallback (`standard / 0 / none / null / hp_standard_v1`). Live resolution remains constant and standard-only.

Resolver failures are logged without URLs or personal data and fall back to the canonical standard snapshot. No fee URL, fee parameter, enrollment state, payout workflow, or client-selectable program was added.

The handoff policy is prepared for future fee routing: a non-standard snapshot may select a fee handoff only after persistence succeeds. A persistence failure selects the standard target when one is available, otherwise a retryable TI error. Current standard traffic remains fail-open.

## Route coverage and persistence

The shared insert-and-reconcile contract is used by every discovered HotelPlanner hotel outbound writer: `/go/hotels`, `/go/hotels/property`, and `/go/hotels/checkout`.

Each new outbound is inserted with the complete snapshot. On SQLSTATE `23505`, the helper queries both `outbound_attribution_id` and `outbound_request_id`, because either unique index can be authoritative. Only the same database row with an identical snapshot and identical historical handoff context is accepted as an idempotent retry. Legacy, mismatched, two-row, unresolved, and database-error cases are logged safely and never overwrite history.

Custom1–Custom7 construction is unchanged. Custom3 remains `attr:{outbound_attribution_id}`. Custom8 remains source-scoped reporting context: Tournament Hotels names are normalized, limited to 128 characters, and protected from spreadsheet formula prefixes in both the client constructor and server handoff routes. Fixed RI context such as `app:refereeinsights` is not changed.

## Deletion preservation

The existing venue foreign key already uses `ON DELETE SET NULL`; no venue schema change was necessary. The tournament relationship cannot be broadly changed to SET NULL without weakening the tournament-official invariant. The migration therefore adds a `BEFORE DELETE` trigger on `tournaments` that nulls `tournament_id` only for HotelPlanner hotel outbounds before the existing cascade runs. The slug, Custom fields, attribution ID, program snapshot, and standalone beneficiary UUID remain intact. Tournament-official rows retain their existing constraint and cascade behavior.

## Reconciliation boundary

Future reconciliation is `HP Custom3` → validate `^attr:[0-9a-f]{32}$` → strip `attr:` → exact `ti_outbound_clicks.outbound_attribution_id` match → read immutable program, beneficiary, tournament/venue, source, and placement context.

Multiple HotelPlanner booking IDs may legitimately map to one TI outbound. HotelPlanner remains the source of booking status, room nights, Custom Fee, refunds, disputes, settlement, and affiliate commission. TI provides attribution and the immutable program snapshot. No booking warehouse or payout calculation was added.

## Validation performed

- Focused and protected-flow Node tests: 35 passed (snapshot shapes, fallback, policy, Custom8, persistence reconciliation, all three route integrations, migration structure, attribution baselines, HotelPlanner provider normalization, Tournament Hotels, and Team Hotels).
- `npx tsc -p apps/ti-web/tsconfig.json --noEmit`: passed.
- `npm run lint --workspace ti-web`: passed.
- `npm run build --workspace ti-web`: passed.
- `git diff --check`: passed.

The migration was reviewed statically but was not applied to a local or production database. Database trigger behavior should be verified in a disposable/local database before production rollout. Deploy the migration before application code so new snapshot inserts do not fail open as standard traffic.

## Rollback considerations

Application rollback is independent because all live resolution is standard. If the migration must be reversed, first remove the application writes, then drop the two triggers/functions, CHECK constraint, and five columns. Dropping the columns destroys any snapshots created after rollout and should not be done after fee traffic exists without preserving that financial history.
