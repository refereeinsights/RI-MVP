# TI HotelPlanner Booking Sync Reliability Heartbeat

Date: 2026-09-03

Status: `HOTELPLANNER SYNC HEARTBEAT READY FOR DATABASE VERIFICATION`

## Audit result

The scheduled TI admin-dashboard route is the only ordinary call site for `syncHotelPlannerBookings`. Vercel invokes it daily at `15 5 * * *`. The route intentionally isolates booking synchronization from email delivery: a booking-sync failure is caught, the admin email is still attempted, and a successful email leaves the HTTP response successful. This preserves the existing cron behavior, but it also means HTTP success alone cannot prove that booking synchronization succeeded.

Before this change, `ti_hotel_bookings.synced_at` changed only when a booking row was upserted. A successful zero-row report therefore left no durable evidence of a successful run. Cancellation-query failures were returned only in memory, and there was no durable run record capable of distinguishing never run, running, stale running, succeeded, partial, or failed. The route has no explicit `maxDuration`; actual historical duration and timeout behavior remain `UNPROVEN` because the repository contains no authoritative batch-history source.

The historical cause of the observed freshness gap remains `UNPROVEN`. No provider call, production database read, production database write, Vercel-log query, or external configuration change was authorized or performed during this implementation.

## Smallest implementation

The unapplied migration adds one operational table, `public.ti_hotel_booking_sync_runs`, and three service-role-only RPCs:

- `ti_start_hotel_booking_sync_run_v1` atomically creates a `running` attempt before provider/configuration work;
- `ti_finalize_hotel_booking_sync_run_v1` performs a terminal-only-once database-clock transition to `succeeded`, `partial`, or `failed` with bounded aggregate counters and a closed error stage;
- `ti_read_hotel_booking_sync_health_v1` returns one aggregate health row containing the last attempt, last terminal run, and last successful run.

The table is owned by `postgres`, has forced RLS, exposes no raw booking, customer, URL, credential, payload, or provider-response data, and grants no direct table access to `PUBLIC`, `anon`, `authenticated`, or `service_role`. Only `service_role` may execute the narrow RPCs.

The sync orchestration now records:

- trigger: `vercel_cron` or `manual_operator`;
- purchase window;
- purchase/cancellation provider-call counts;
- rows returned, upserted, and failed;
- terminal status;
- one closed, payload-free error stage.

A purchase-report or purchase-persistence failure is terminal `failed`. An isolated cancellation-query failure or row-level persistence error is `partial`. A successful zero-row run is durably `succeeded`. Finalization is required, uses the database clock, and cannot rewrite an already-terminal run.

The cron route still attempts the admin email after a sync failure and retains its existing HTTP success behavior when email succeeds. The returned bounded result and the durable heartbeat keep that success from being mistaken for sync success.

## Admin visibility

The existing TI admin email now reports the aggregate heartbeat rather than inferring job success from the newest booking row:

- last attempt and terminal status;
- last successful completion;
- purchase and cancellation rows returned;
- rows updated and failed;
- bounded error stage;
- newest known HotelPlanner purchase timestamp.

It emits distinct alerts for a run still active after 30 minutes and for no successful run within 36 hours. Never-run and stale-success states remain distinguishable. The existing booking/revenue totals and reconciliation semantics are unchanged. Search sessions and outbound handoffs remain diagnostic rather than revenue truth, and HotelPlanner arrival remains `UNOBSERVABLE`.

A read-only operator CLI reports the same aggregate health fields without run IDs, customer identifiers, booking identifiers, or payloads.

## Preserved revenue path

No customer-facing TI or RI hotel path changed. In particular, this work does not alter HotelPlanner search, `/go/hotels`, `/go/hotels/property`, redirect construction, source/partner parameters, Custom fields, attribution IDs, Standard fallback, fees, booking reconciliation, or commercial routing. It adds no analytics event or writer and changes no cron schedule.

## Verification completed locally

- 40 HotelPlanner/revenue-path tests passed, including heartbeat, orchestration, cron-isolation, reconciliation, report-safety, and admin-email coverage;
- Referee TypeScript passed;
- Referee lint passed with zero warnings;
- the Referee production build passed; its displayed warning backlog is pre-existing and the build exited successfully;
- repository diff checks passed;
- no migration was applied and neither SQL verifier was executed.

## Required database verification

After a human applies `supabase/migrations/20260903_ti_hotel_booking_sync_runs.sql`, run, in order:

1. `scripts/analysis/ti_hotel_booking_sync_heartbeat_catalog_verification.sql`
2. `scripts/analysis/ti_hotel_booking_sync_heartbeat_behavioral_verification.sql`

Required sentinels:

```text
TI HOTEL BOOKING SYNC HEARTBEAT CATALOG VERIFICATION PASSED
TI HOTEL BOOKING SYNC HEARTBEAT BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO
```

The behavioral verifier uses only a reserved synthetic future-date namespace, requires that namespace to be empty before use, validates terminal immutability and aggregate health behavior inside a transaction, rolls back, and independently confirms cleanup zero.

No live provider call, production sync, cron invocation, deployment, or push is authorized by this report.
