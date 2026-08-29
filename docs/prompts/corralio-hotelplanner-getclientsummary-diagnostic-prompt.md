# HotelPlanner API Diagnostic — `getClientSummary` Live Test

**Read-only diagnostic only. Does not authorize any Phase 3B implementation, any product code change, any Corralio or TI feature work, or any write/booking/cancellation call. This is a single verification step to close an open evidence question from the Slice 3.6B Phase 3B reconciliation record.**

## 0. Why This Exists

The CPO's Phase 3B reconciliation (`docs/prompts/corralio-slice-3.6b-phase3a-temporary-routing-origin-prompt.md`, Section 1) identified `getClientSummary` — documented at `docs/reference/hotelplanner-api-docs.md` line 898 — as the cheapest real path to on-demand hotel-booking confirmation: it takes only `emailAddress` (no itinerary number required) and returns all of that client's requests. Two things are unverified: whether the live call actually returns results as documented, and whether it's scoped to bookings made through TI's specific white-label HotelPlanner integration or to any HotelPlanner booking tied to that email regardless of source. The founder has a real personal reservation under `rod@rdavis.net` and asked for a live test against it to answer both questions.

## 1. What to Do

Reuse the existing, already-working auth/env scaffold in `scripts/ops/inspect-hotelplanner-availability.mjs` (HMAC signature construction, `.env.local` credential loading, request/response logging pattern) rather than writing new auth logic. Add a small sibling diagnostic script (e.g. `scripts/ops/inspect-hotelplanner-client-summary.mjs`) that:

* Loads the same existing credentials the availability script already uses (`HOTELPLANNER_API_KEY`, `HOTELPLANNER_SECRET_KEY`, `HOTELPLANNER_ACCOUNT_ID`, `HOTELPLANNER_SITE_ID`) from the same `.env.local` location — do not create, rotate, or hardcode any credential.
* Calls `method=getClientSummary` with body `{"emailAddress": "rod@rdavis.net", "products": "all"}`.
* Prints the response so the founder/CPO can review it directly.

Run it once against `rod@rdavis.net`. This is a single ad hoc verification call, not a recurring job — do not wire it into any cron, product code path, or scheduled task.

## 2. Hard Guardrails

* **Read-only method only.** Call `getClientSummary` and nothing else. Do not call `reserve`, `confirm3DSReservation`, `changeReservation`, `cancelReservation`, `createGroupRequest`, or any other method that could create, modify, or cancel a real booking or charge — under any circumstance, in this script or any future use of it.
* **Never print, log, or commit the raw API key, secret key, account ID, or the constructed Authorization token.** The existing availability script's logging pattern is fine to reuse for the request URL/body and the response payload, but redact or omit the `Authorization` header value specifically if adapting its logging.
* **Never commit `.env.local` or any file containing a credential value.**
* This diagnostic script itself may be committed (it contains no secrets, matching the existing availability script's pattern), but do not build any product feature, UI, or Corralio/TI integration on top of it as part of this task — that remains explicitly out of scope pending a real Phase 3B decision.

## 3. What to Report Back

In the chat/completion report (not necessarily verbatim in `notes.md` — see below): the full response for `rod@rdavis.net`, including whatever it reveals about the founder's real reservation (hotel, dates, status, itinerary number) — this is the founder's own data, requested directly by him, so full detail is appropriate to hand back directly.

If you can determine it from context (e.g., the founder confirms whether that reservation was booked through TournamentInsights' HotelPlanner white-label checkout specifically, versus HotelPlanner.com directly or another channel), report whether `getClientSummary`'s scope appears to be TI-partner-account-specific or broader. If it can't be determined from the API response alone, say so plainly and ask the founder for that one fact rather than guessing.

In `apps/corralio/notes.md` (or a small standalone diagnostic note if that's a better fit — your call), record only a structural summary for the durable audit trail: whether the call succeeded, how many/what kind of records were returned (counts and record types, not full guest detail), whether the response shape matched the documented schema, and the scoping-question answer if determined. Do not persist the founder's full reservation detail (hotel, dates, itinerary number) into a permanently tracked repository file — that level of detail belongs in the direct report back, not the durable record.

## 4. Verdict

Report plainly: did the call succeed, what came back (structurally, per Section 3), and whether `getClientSummary`-by-email is confirmed as a viable Phase 3B reconciliation path or whether it revealed a problem (e.g., wrong scope, missing fields, unexpected auth/rate-limit behavior) that changes the recommendation in the Phase 3A prompt's Section 1. Do not push. Do not deploy. No product code, schema, or Corralio behavior should have changed as a result of this task.
