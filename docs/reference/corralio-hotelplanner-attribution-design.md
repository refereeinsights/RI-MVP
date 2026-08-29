# Corralio × HotelPlanner Attribution & Reconciliation Design

**Status: design locked, not yet built.** This document captures the agreed design for how Corralio will know when a household has confirmed a hotel booking through a Corralio-originated HotelPlanner link. It does not authorize implementation — it exists so that when the travel-monetization hotel-handoff feature and Slice 3.6B Phase 3B are actually scoped as build prompts, this design is already settled rather than re-derived. See `docs/prompts/corralio-slice-3.6b-phase3a-temporary-routing-origin-prompt.md` Section 1 for how this connects to Phase 3B.

## 1. Why this exists

Corralio's routing-origin work (Slice 3.6B Phase 3B, deferred) wants to eventually offer "your tournament hotel" as a suggested routing origin once a family has actually booked one — but only once Corralio has real, trustworthy evidence that a specific household has a confirmed booking. Corralio does not process hotel bookings or payments itself; HotelPlanner remains the merchant, supplier, and support provider throughout, exactly as it already does for TournamentInsights and Referee. This document is the plan for closing the gap between "a family clicked our hotel link" and "Corralio knows, with reasonable timeliness and without false positives, that they actually booked."

## 2. How immediate can confirmation be? (three real options)

Checked directly against the HotelPlanner API reference (`docs/reference/hotelplanner-api-docs.md`) and TI's own implementation notes (`docs/reference/ti-hotelplanner-implementation-notes.md`):

1. **Do nothing new.** Rely on the existing once-daily `getReport` batch job (`apps/referee/lib/hotelPlannerBookingSync.ts`) built for a founder KPI email. Zero new work, next-day latency.
2. **Scheduled `getReport` pull on a bounded cadence (chosen approach — see Section 4).** Keeps HotelPlanner's white-label checkout exactly as-is (zero payment/PCI exposure for Corralio), gets same-window confirmation instead of next-day.
3. **Take over the booking step (`reserve`/`confirm3DSReservation`).** Genuinely instant — the API's `reserve` response is a synchronous, immediate confirmation — but the documented request shape requires raw card fields (`cardNumber`, `cvv`, billing address) with no tokenized/hosted-fields alternative anywhere in this API. This means Corralio's own servers would handle live cardholder data (real PCI-DSS scope) and Corralio would own checkout UX, declines, sold-out/rate-change handling, and the 3D-Secure iframe flow. TI's own implementation notes explicitly reject this path for MVP ("Do not expose any payment/reserve flow in TI for MVP. White-label checkout handoff only"). **This is a separate, company-level decision about payment-processor-adjacent liability, not a routing-origin decision — do not fold it into any Phase 3B or travel-handoff build without that decision being made explicitly and separately first.**

Option 2 is the chosen design for everything below.

## 3. Two lookup methods exist — use the account-wide one, not the per-email one, as the primary mechanism

* **`getClientSummary`** takes only `emailAddress` (no itinerary number needed) and returns everything tied to that email across TI's whole HotelPlanner partner account — confirmed via a live diagnostic call (`scripts/ops/inspect-hotelplanner-client-summary.mjs`) against a real reservation. Useful as a fallback/manual-verification tool, but not the primary mechanism: it surfaces bookings regardless of source (a live test found a real TI-white-label booking under the same email with no attribution fields at all), and it requires the parent's checkout email to match Corralio's stored household email, which is not guaranteed.
* **`getReport` (reportType: individual)** is account-wide per call, filterable by date range (checkInDate/checkOutDate/purchasedDate/cancelledDate — at least one required, max 1 year per call), and already returns `Source`, `Job Code`, `Custom1`–`Custom8` per the verified column map in `hotelPlannerBookingSync.ts`. This is the primary mechanism: one scheduled call covers every household at once, with no email dependency at all.

## 4. Polling architecture

A scheduled worker calls `getReport` on a bounded cadence (target: 15–30 minutes) with a narrow rolling date window (e.g., `purchasedDateStart`/`purchasedDateEnd` covering the time since the last successful run), reusing the exact `FOR UPDATE SKIP LOCKED` / bounded-claim pattern already proven three times in this codebase (schedule refresh, Weekend Ready). This is not a new scheduling primitive — it is the same reusable shape a third time.

## 5. Identifying which household — attribution token, not a persistent ID

Every Corralio-originated HotelPlanner URL sets two things:

* **`source` (`sc`) = `"corralio"`** — the same field TI already uses with its own value, `HOTEL_PLANNER_PARTNER_SOURCE = "tournamentinsights"` (`apps/ti-web/lib/hotelPlannerAttribution.ts`). This partitions Corralio's bookings from TI's and Referee's in the account-wide report. Necessary, but not sufficient — it identifies "a Corralio household," not "which one."
* **A fresh, opaque, single-use attribution token in `Custom3`**, formatted exactly like TI's existing pattern: `attr:{32-hex-id}`, generated per outbound click via `crypto.randomUUID()` with dashes stripped and lowercased (mirrors `createOutboundAttributionId()`/`formatOutboundAttributionToken()` in `hotelPlannerAttribution.ts`), parsed back with the same regex TI already uses (`ATTRIBUTION_TOKEN_RE = /^attr:([a-f0-9]{32})$/i` in `hotelBookingReconciliation.ts`). No new format, no new parsing logic required on the ingestion side.

**Explicitly do not put the household's real, persistent UUID directly into the URL or Custom field.** Follow TI's existing pattern instead: generate the opaque token at the moment of each outbound click, and store the actual `attribution_id → household_id` correlation (plus any useful context — which weekend/event triggered the click) in a Corralio-owned table, resolved only at reconciliation time. Rationale: a stable household identifier embedded in a URL persists indefinitely in browser history, referrer headers, and HotelPlanner's own systems — a single-use opaque token carries no reusable identity outside Corralio's own mapping table. No collision risk with TI's own attribution IDs despite the shared Custom3 format and generation scheme, since `source` is the top-level partition between the two.

**Job code convention:** mirror TI's source-specific prefix convention (`TI-BOOK-TRAVEL`, `TI-VENUE-MAP`, etc. — see `defaultJobCode()` in `hotelPlannerAttribution.ts`) with a Corralio-specific family, e.g. `CORRALIO-WEEKEND-TRAVEL`, so a job code alone identifies a Corralio booking at a glance before Custom3 is even inspected.

## 6. Reconciliation rule

```
source === "corralio"
  AND Custom3 matches "attr:{token}" for a token present in Corralio's own attribution table
  AND status === <the confirmed value — empirically 1, per Section 7>
  → confirmed Corralio booking, resolved to the mapped household_id
```

Anything with a missing or non-Corralio-attributed token stays unmatched, even if `source` happens to read `"corralio"` (e.g., a malformed or expired token). This replaces the earlier, weaker draft rule based on household-email matching — email is not required anywhere in this design.

## 7. Status field — empirical mapping, not yet fully enumerated

A live `getClientSummary` diagnostic against two real, known reservations (one confirmed, one cancelled) empirically mapped the numeric `status` field: `status: 1` = confirmed, `status: 2` = cancelled. This is first-party evidence, better than the API docs provide (which don't document this field's value set at all) — but only two values have been observed. **Treat `status === 1` as a strict positive match, not "anything other than 2."** An unrecognized future status value should fail closed to "unmatched," the same way a missing attribution token does, rather than being treated as confirmed by elimination.

## 8. Adjacent, separate item: TI's own reporting pipeline is silently dropping guest name

Independent of the above: `hotelPlannerBookingSync.ts` declares `COL.Name = "Name"` (a real, verified column in the live `getReport` response) but never reads it — `BookingRow` has no `name` field, and `mapDataRow` never calls `getStr(row, headerIndex, COL.Name)` for it. Adding it is a one-line-per-location fix (`BookingRow`, `mapDataRow`, the upsert), useful for human-readable manual lookups in TI's own KPI tooling. This is independent of everything above and should stay that way: Corralio's reconciliation logic (Section 6) never needs to read, store, or match on a guest's name — that is the entire point of the attribution-token design.

Guest email is confirmed absent from the `getReport` response entirely (no `Email` entry anywhere in the verified `COL` map) — this design never depends on it being there.

## 9. What this does not authorize

This is design only. It does not authorize: building the Corralio-side outbound HotelPlanner link/handoff feature itself; building the attribution-token generation or the household-mapping table; building the scheduled `getReport` reconciliation worker; or amending Slice 3.6B's Phase 3B scope to an executable build prompt. Each of those is a real, separate implementation task that should be scoped as its own prompt when the travel-monetization hotel-handoff feature is actually greenlit — this document exists so that scoping starts from a settled design rather than an open question.

## 10. Evidence trail

* `docs/reference/hotelplanner-api-docs.md` — vendor API reference (`reserve`, `getReservation`, `getClientSummary`, `getReport` sections).
* `docs/reference/ti-hotelplanner-implementation-notes.md` — TI's MVP scope decision (no payment/reserve flow; white-label checkout only).
* `apps/ti-web/lib/hotelPlannerAttribution.ts` — existing attribution-token generation/formatting, source-page-type and job-code conventions.
* Attribution-token parsing (`ATTRIBUTION_TOKEN_RE`) — the reconciliation-side counterpart to the above.
* `apps/referee/lib/hotelPlannerBookingSync.ts` — verified `getReport` column map (`COL`), current `BookingRow`/upsert shape, the dropped-`Name` finding.
* `scripts/ops/inspect-hotelplanner-client-summary.mjs` + `apps/corralio/notes.md` (2026-08-28 entry) — live `getClientSummary` diagnostic: response-shape discrepancy from the documented schema, and the empirical `status` mapping.
