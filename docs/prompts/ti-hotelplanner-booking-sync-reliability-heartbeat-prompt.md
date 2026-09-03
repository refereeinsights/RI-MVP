# HotelPlanner Booking Sync Reliability + Analytics Heartbeat

## Objective

Fix the stale HotelPlanner booking-reporting problem without changing any customer-facing hotel acquisition, routing, checkout, attribution-generation, or revenue behavior.

Current evidence:

- Hotel discovery, HotelPlanner search, and outbound-handoff activity continued after the Sept. 3 deployment.
- Current commercial booking activity remains unproven because booking synchronization is stale.
- The customer-facing hotel revenue path was unchanged.
- `ti_hotel_bookings` appeared approximately 47 hours stale during the audit.
- Daily cron is expected at `05:15 UTC`.
- `max(synced_at)` is not a reliable cron heartbeat because a successful provider sync returning zero rows may leave it unchanged.

The task is to make HotelPlanner sync health directly observable and reliably reportable.

## Revenue freeze

Do not change:

- `/go/hotels`
- `/go/hotels/property`
- `/go/hotels/checkout`
- HotelPlanner destination construction
- `source`
- `sc`
- Custom1-Custom8
- attribution generation
- redirect behavior
- Standard fallback
- hotel-program selection
- fee/economic snapshots
- venue/map hotel CTAs
- customer-facing hotel UI

Return:

`HOTEL REVENUE PATH UNCHANGED: YES / NO`

If `NO`, stop without implementation.

## Stage A — audit the existing cron path

Trace the exact production flow:

```text
Vercel cron
→ /api/cron/ti-admin-dashboard-email
→ HotelPlanner purchase sync
→ cancellation/status sync
→ ti_hotel_bookings upserts
→ reconciliation
→ admin email
```

Establish:

- configured schedule;
- cron authentication;
- maximum duration/runtime limits;
- purchase-sync behavior;
- cancellation-sync behavior;
- whether sync failures throw or are swallowed;
- whether email can still succeed when booking sync fails;
- whether HTTP 200 can be returned despite a sync failure;
- existing logs and their retention usefulness;
- how `synced_at` is currently populated;
- whether an empty successful provider result leaves no durable evidence that the cron ran;
- whether a reusable job-run/audit table already cleanly satisfies this task;
- every call site of the booking-sync function and the trigger value each call site requires.

Report the audit findings before describing the implementation result. Continue with the bounded implementation below only if the revenue freeze can be preserved. Do not infer that current bookings are down from the stale internal reporting table.

## Stage B — add a durable sync-run heartbeat

Implement the smallest durable mechanism that records every in-scope HotelPlanner booking-sync attempt independently of booking rows.

Prefer an existing generic job-run table only if it cleanly provides the required semantics, privacy boundary, terminal-state integrity, and health queries. If reuse would distort semantics, use a dedicated table:

`ti_hotel_booking_sync_runs`

Minimum fields:

```text
id
started_at
completed_at
status
trigger
purchase_window_start
purchase_window_end
purchase_provider_calls
purchase_rows_returned
cancellation_provider_calls
cancellation_rows_returned
rows_upserted
rows_failed
error_stage
created_at
```

Allowed statuses:

```text
running
succeeded
partial
failed
```

Use a closed trigger vocabulary derived from audited call sites. It must not accept arbitrary caller-controlled values. Operator/verifier paths may use the narrowest justified non-cron value.

Use a closed, payload-free `error_stage` vocabulary. It may contain only applicable values such as:

```text
provider_request
report_download
report_parse
purchase_upsert
cancellation_request
cancellation_download
cancellation_parse
cancellation_upsert
heartbeat_persistence
```

Do not store exception messages or dynamic provider content in `error_stage` or another heartbeat field.

Keep all heartbeat fields aggregate-only.

Do not store:

- raw HotelPlanner payloads;
- signed URLs or query parameters;
- itinerary or confirmation numbers;
- customer names, emails, or phone numbers;
- raw user agents;
- destination/customer data;
- secrets;
- arbitrary error messages.

### Attempt lifecycle

- Create the `running` attempt before the first provider request.
- Finalize it only through a narrow server-only boundary.
- A terminal attempt cannot be finalized or mutated a second time.
- Purchase failure must finalize as `failed`.
- Successful purchase plus failed cancellation must finalize as `partial`.
- Provider zero-row success must finalize as `succeeded`.
- Aggregate row-upsert failures truthfully into the terminal result.
- Do not add an automatic retry loop.
- Do not introduce a distributed scheduler or queue.

An execution interruption may leave an attempt at `running`. Health calculations must classify a `running` attempt older than **30 minutes** as `STALE_RUNNING` or `ABANDONED/UNRESOLVED`, while preserving its stored status. Do not silently rewrite it to `failed`, and do not add a recovery mutation in this slice.

The health model must distinguish:

- current non-stale `running` attempt;
- stale `running` attempt;
- most recent attempt of any status;
- most recent terminal attempt;
- most recent successful attempt.

### Database security boundary

If a new table or database functions are required, preserve the established security posture:

- forced RLS;
- no `PUBLIC`, `anon`, or `authenticated` access;
- server/service-role-only read and write boundaries;
- no browser access to heartbeat rows;
- `SECURITY DEFINER` functions only where needed;
- function owner `postgres`;
- fixed safe `search_path`;
- explicit revocation of default execute privileges;
- closed status, trigger, and error-stage constraints;
- database-clock authority for lifecycle timestamps;
- terminal-state immutability or an atomic compare-and-finalize boundary.

Prefer narrow start/finalize/read RPCs if direct table access would make terminal-state integrity weaker. Do not broaden access to existing booking or outbound tables.

If a migration is required, prepare it but do not apply it to production.

## Stage C — make failure semantics truthful

Design and implement behavior so:

- purchase-sync failure is durably recorded;
- cancellation-sync failure is durably recorded;
- partial completion is distinguishable from success;
- email delivery success cannot overwrite or erase sync failure state;
- provider zero-row success is recorded as `succeeded`;
- individual row-upsert failures are aggregated;
- no automatic retry loop is added;
- customer-facing hotel behavior is unaffected.

Audit the consequences before changing the cron route's HTTP status. If a non-2xx response could cause duplicate execution or harmful retries, preserve the safe HTTP behavior and make the bounded response body plus durable heartbeat truthful. The heartbeat—not an optimistic HTTP response—is the operational source of truth.

Do not change the Vercel cron schedule.

## Stage D — admin-email health section

Update the existing TI admin email/reporting surface with a compact HotelPlanner sync-health section.

Healthy example:

```text
HotelPlanner Sync

Last attempt: Sep 3, 05:15 UTC
Status: SUCCESS
Purchases returned: 3
Cancellations returned: 0
Rows updated: 3
```

Unhealthy example:

```text
Last attempt: Sep 1, 05:15 UTC
Status: FAILED
Last success age: 47 hours
Stage: report_download
```

Rules:

- use the durable run heartbeat, not `max(ti_hotel_bookings.synced_at)`;
- distinguish last attempt from last terminal attempt and last successful sync;
- identify `STALE_RUNNING` using the 30-minute threshold without mutating the row;
- retain the existing 36-hour last-success staleness threshold unless the audit finds an authoritative replacement;
- do not expose sensitive/provider data;
- do not imply zero provider rows means failure;
- keep existing commercial metrics intact.

## Stage E — reporting semantics only

Review the existing admin/reporting metrics so the hotel operating scorecard prioritizes:

### Commercial

- confirmed normalized `Source=TournamentInsights` bookings;
- confirmed booking value;
- confirmed expected commission;
- provider-reported paid commission;
- cancellations.

### Human-intent signal

- explicit TI hotel CTA interactions;
- explicit RI hotel-intent events.

### Diagnostic only

- `lodging_search_session`;
- raw `ti_outbound_clicks`.

Do not relabel raw outbound rows as human clicks. Do not attempt sophisticated bot classification. Do not infer HotelPlanner arrival.

HotelPlanner arrival remains:

`UNOBSERVABLE`

This stage is reporting-only. Do not add or modify analytics schemas, event vocabularies, event writers, browser identifiers, attribution identifiers, provider instrumentation, or bot-classification systems.

## Stage F — bounded booking-lag diagnostic

Add or reuse a bounded read-only operator diagnostic that reports only aggregate health:

```text
last sync attempt
last terminal attempt
last successful sync
current/stale running state
last-success age
provider rows returned
rows upserted
latest purchase date persisted
latest purchased_at
latest terminal sync-run status
```

It must answer:

> Are bookings actually down, or is reporting stale?

without inspecting or returning raw booking records.

No PII, booking identifiers, raw provider content, signed URLs, or dynamic error messages may be returned or logged.

## Stage G — tests and database verification artifacts

Add focused offline tests for:

- zero-row successful sync creates a successful terminal run;
- successful purchase and cancellation sync;
- purchase failure;
- cancellation failure after successful purchase sync produces `partial`;
- row-upsert failure aggregation;
- email success does not overwrite sync failure status;
- 36-hour last-success staleness calculation;
- 30-minute stale-running calculation;
- last-attempt versus last-terminal versus last-success calculation;
- safe closed error-stage handling;
- terminal run cannot be finalized twice;
- idempotent booking upserts remain unchanged;
- no analytics vocabulary/writer change;
- revenue-path invariants remain unchanged.

If a migration is required, also prepare:

- a read-only catalog/security verifier;
- a rollback-only behavioral verifier;
- cleanup-zero assertions;
- verification of forced RLS, ownership, grants, fixed search paths, closed constraints, server-only access, terminal immutability, and cross-role denial.

Do not apply the migration in this execution. Stop at:

`HOTELPLANNER SYNC HEARTBEAT READY FOR DATABASE VERIFICATION`

Database application and database-backed verification require separate authorization.

## Stage H — offline production-readiness checks

Run:

- focused HotelPlanner sync/reconciliation tests;
- heartbeat and health-calculation tests;
- existing revenue-path tests;
- Referee TypeScript validation;
- Referee lint;
- Referee production build;
- `git diff --check`.

Do not deploy. Do not push. Do not manually invoke HotelPlanner production reports unless separately authorized.

## Final report

Return:

### Revenue path

`UNCHANGED / CHANGED`

### Audit findings

Document the existing cron, failure, email, HTTP, and `synced_at` behavior found before implementation.

### Root cause

Choose exactly one:

- `CRON INVOCATION FAILURE`
- `PROVIDER REPORT FAILURE`
- `DOWNLOAD/PARSE FAILURE`
- `DB UPSERT FAILURE`
- `EMPTY SUCCESS WAS INVISIBLE`
- `MIXED / MULTIPLE`
- `UNPROVEN`

Do not claim that this forward-looking heartbeat proves a historical root cause that existing evidence cannot establish.

### Durable heartbeat

`IMPLEMENTED / BLOCKED`

### Migration

`REQUIRED / NOT REQUIRED`

If required, list the unapplied migration and verifier files.

### Cron semantics

Explain whether route HTTP behavior changed and why.

### Admin email

`UPDATED / BLOCKED`

### Reporting semantics

Confirm:

- explicit browser interactions are treated as intent;
- searches/outbounds are diagnostic;
- commercial bookings remain provider-source truth;
- no analytics schema, vocabulary, or writer changed.

### Verification

Report exact pass/fail totals for each command.

### Deployment readiness

Choose exactly one:

- `HOTELPLANNER SYNC HEARTBEAT READY FOR DATABASE VERIFICATION`
- `READY FOR DEPLOY` only when no migration is required and all verification passes;
- `BLOCKED`.

### Restrictions confirmation

Confirm:

- no customer-facing hotel changes;
- no routing changes;
- no attribution-generation changes;
- no HotelPlanner writes or report calls;
- no production database writes;
- no cron schedule changes;
- no analytics schema/event/writer changes;
- no deploy;
- no push.

The objective is simple: if HotelPlanner booked room nights yesterday, the internal system should promptly report them—or clearly report why it cannot.
