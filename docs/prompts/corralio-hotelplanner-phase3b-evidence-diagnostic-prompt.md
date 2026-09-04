# HotelPlanner Phase 3B — Evidence Diagnostic (Status Contract + Cancellation Window)

> **SUPERSEDED 2026-09-03 — DO NOT DISPATCH AS WRITTEN.** A pre-implementation audit found this prompt overtaken by repository work completed after it was filed. **Task B (cancellation-window live query) is done** — a real, authorized, read-only `getReport` call already ran (2026-08-25–08-31, 8 rows, all exact `Cancelled`, all with cancellation date and reconciliation keys — `docs/reports/ti-hotel-monetization-reporting-2026-08-31.md`, "Cancellation diagnostic"), and that evidence is now shipped as production behavior: a separate, isolated 7-day cancellation refresh in `hotelPlannerBookingSync.ts`, using the proven exact-normalized `Confirmed`/`Cancelled` classification with a conservative `other`/`unknown` fallback (`hotelBookingReconciliation.ts`, `classifyHotelPlannerStatus`; codified in `docs/reference/corralio-hotelplanner-attribution-design.md` Section 7, corrected the same day). Re-running Task B would spend another live provider call closing a gap that's already closed. **Task A (SQL status-vocabulary enumeration) was never run and remains optionally available** — it no longer gates anything (the implementation already fails closed to `other`/`unknown` for any unrecognized value), but if run it should be the only live operation, aggregate status/source counts only, no row-level booking data printed, and framed as confirming observed vocabulary rather than proving HotelPlanner's complete future vocabulary. **The real remaining work is documentation reconciliation, already done 2026-09-03** — see `docs/corralio/cpo/2026-09-03-cpo-audit-hotelplanner-phase3b-diagnostic-overtaken.md` for the full audit and the list of corrected documents. Section 0's evidence trail below is now partly historical (Task B's premises) and partly still accurate (Task A's rationale, if ever run) — read the audit doc first, not this prompt, before doing anything with Phase 3B.

**Read-only diagnostic only. Does not authorize any Phase 3B implementation, any Corralio product code, schema, or UI change, or any write/booking/cancellation call. This closes two of the four evidence gaps the founder required before Phase 3B's Stage 1 build prompt can be written (2026-08-30 founder decision on the HotelPlanner booking-reconciliation/lodging/routing addendum). Items 3 and 4 of that decision are addressed separately — Item 3 by direct code audit (see the CPO's notes below, no diagnostic needed), Item 4 by Phase 3A's own build sequencing.**

## 0. Why This Exists

The CPO's review of the founder's HotelPlanner booking-reconciliation addendum found that the locked attribution design's reconciliation rule (`status === 1`, numeric) was empirically derived from `getClientSummary`, but the addendum correctly selects `getReport` as the primary mechanism — and `getReport`'s `Status` column is a string (confirmed directly in `apps/referee/lib/hotelPlannerBookingSync.ts`, `getStr(row, headerIndex, COL.Status)`). TI's own production code already branches on `status.toLowerCase() === "confirmed"` and `status.toLowerCase().includes("cancel")`, but this has never been formally enumerated against real historical data, and the `cancelledDateStart/cancelledDateEnd` + `includeCancelled` query parameters (documented at `docs/reference/hotelplanner-api-docs.md` lines 1033/1041) have never actually been called against this account — TI's existing cron (`apps/referee/vercel.json`, daily) only ever queries `purchasedDateStart/End`.

## 1. Task A — Enumerate Real Status Values (Item 1)

Run one read-only SQL query against the production Supabase database (the same one `ti_hotel_bookings` already lives in):

```sql
select status, cancel_date is not null as has_cancel_date, count(*)
from public.ti_hotel_bookings
group by status, cancel_date is not null
order by count(*) desc;
```

Report the full result. This is free evidence — TI has months of real daily-synced reconciliation history sitting in this table already; no live API call is needed for this part. Specifically confirm or correct:

* Does every row whose `status` contains "cancel" (case-insensitive) also have a non-null `cancel_date`, and vice versa? (Tests whether the existing `status.includes("cancel")` heuristic and `cancel_date` presence agree, or whether one is a more reliable signal than the other.)
* Are there any `status` values that are neither "confirmed" nor cancel-like (e.g., pending, no-show, modified, refunded)? List every distinct value verbatim, exact casing.
* Report row counts so it's clear whether any rare/unusual status is a one-off anomaly or a real recurring case that needs its own handling.

## 2. Task B — Live Cancellation-Window Query Shape (Item 2)

**Important scoping note:** Corralio has no outbound HotelPlanner link built yet, so no Corralio-attributed (`source = "corralio"`) booking exists to test against. This diagnostic verifies the *query mechanics and response field shape* for a cancellation, using any real, already-known cancelled TI or Referee booking — it does not and cannot test Corralio-specific attribution matching, which remains untestable until Corralio's own handoff exists.

Reuse the existing, already-working auth/env scaffold in `scripts/ops/inspect-hotelplanner-availability.mjs` (same pattern already reused for the `getClientSummary` diagnostic). Add a small sibling diagnostic script (e.g. `scripts/ops/inspect-hotelplanner-cancellation-report.mjs`) that calls `getReport` with:

```json
{
  "reportType": "individual",
  "cancelledDateStart": "<a date range known to contain at least one real cancelled TI/Referee booking — check ti_hotel_bookings for an existing cancel_date to pick a safe range>",
  "cancelledDateEnd": "<...>",
  "includeCancelled": true
}
```

Run it once. Report back, for at least one cancelled row in the result:

* Whether `Source`, `Custom3` (or whichever Custom field carries that booking's attribution token, if any), `Status`, `Cancel Date`, `Itinerary`/`Confirmation`, and `Hotel`/`Hotel City`/`Hotel State`/`Hotel Country`/`Hotel ID` are all present and populated as expected from the verified `COL` map in `hotelPlannerBookingSync.ts`.
* Whether the returned `Status` text for a cancelled row matches what Task A's database query already shows for cancelled rows (cross-check the two evidence sources against each other).
* Whether combining `cancelledDateStart/End` with `includeCancelled: true` returns *only* cancelled rows in that window, or a mix (i.e., confirm the parameter's actual filtering behavior rather than assuming it from the vendor doc's one-line description).

## 3. Hard Guardrails

* **Read-only only.** Task A is a `select`, nothing else. Task B calls `getReport` only — never `reserve`, `confirm3DSReservation`, `changeReservation`, `cancelReservation`, `createGroupRequest`, or any write/booking method.
* **Never print, log, or commit** the raw API key, secret key, account ID, constructed Authorization token, or any full guest name/email/payment field that might appear in a report row. Redact guest-identifying fields in whatever gets reported back or committed to `notes.md`; hotel name/city/state/status/dates are fine to report in full (no PII).
* **Never commit `.env.local`** or any file containing a credential value.
* The new diagnostic script may be committed (matches the existing availability/client-summary scripts' pattern, no secrets in it) — but do not build any product feature, table, or UI on top of it as part of this task.

## 4. What to Report Back

In the chat/completion report: the full Task A result set (status values, counts, cancel_date cross-check) and the full Task B field-shape findings (present/absent/matching), redacted of guest PII per Section 3.

In `apps/corralio/notes.md`: a structural summary only — confirmed textual status contract (the exact set of values and how "confirmed" vs. "cancelled" should be matched going forward, e.g. exact-match vs. substring, case sensitivity), and confirmation of whether `cancelledDateStart/End` + `includeCancelled` behaves as documented. No guest-identifying detail.

## 5. Verdict

Report plainly: is the textual status contract (Task A) now fully enumerated and reliable, and does the cancellation-window query (Task B) behave as the addendum's Section 11 design assumes? If either reveals a surprise (an unexpected status value, unexpected filtering behavior, a missing field), say so plainly rather than smoothing it over — this directly gates whether Phase 3B's Stage 1 prompt can be written as currently designed or needs a revision first. Do not push. Do not deploy. No product code, schema, or Corralio behavior should change as a result of this task.
