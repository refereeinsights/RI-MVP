# Corralio Slice 3.6B — Phase 3A: Private Temporary Routing Origin

**Build-only for the launch-scoped capability described below. Does not authorize hotel/trip data modeling, Mapbox/traffic-aware leave-by, or any 3.6B notification/traffic-check work — those remain separately gated (Phase 3B, Phase 4, Phase 5). Does not modify Slice 3.6A or the Slice 3.6B arrival-buffer/Arbiter-audit work in any way.**

## 0. Why This Exists

Founder decision, 2026-08-28 (Slice 3.6B Phase 3, following the CPO's routing-origin reconciliation): today's leave-by/What Fits logic can only route from a single household "Home" origin. That's wrong for a family traveling to a tournament, a game across town from a relative's house, or any commitment that doesn't start from Home. The founder explicitly split this work in two rather than let it wait on unrelated, unbuilt scope:

**Phase 3A (this prompt, build for launch):** a private, temporary routing-origin capability, independent of any hotel/travel-booking concept. A parent can say "leaving from Home," "use current location," or "choose another location" for a specific commitment, without that ever overwriting Home.

**Phase 3B (explicitly deferred, not this prompt):** automatically offering a confirmed hotel/trip as a suggested origin once Corralio has real personal lodging/trip state. Do not build any trip/hotel data model to support this prompt — Phase 3A must work completely independently of whether the family ever books lodging through Corralio at all.

## 1. Confirmed Starting Facts (verify independently before relying on them)

* **Today's origin model is Home-only.** `apps/corralio/lib/leaveBy.server.ts` reads `origin_address`/`origin_lat`/`origin_lng` from `corralio_households` — one address per household, no per-event or per-weekend override. `saveHouseholdOrigin()` validates the address, calls RPC `corralio_prepare_household_origin_v1`, then geocodes/claims it through a Geocodio-backed flow (`claimOrigin()`/`clearOriginClaim()`) with a daily cap and `logSkip()` for skip reasons (`concurrent_claim_skipped`, `daily_cap_reached`). Reuse this exact geocode/claim/cap pattern for "choose another location" rather than building a second one — it is the same kind of input (a parent-typed address) with the same failure modes.
* **No trip, hotel, or booking record exists anywhere in Corralio.** Confirmed by direct repository search. HotelPlanner integration exists elsewhere in this monorepo (TI/referee apps only) as an outbound affiliate-style handoff, currently reconciled only through an admin-only, once-daily batch job (`apps/referee/lib/hotelPlannerBookingSync.ts` → `ti_hotel_bookings`, service-role only, ~24h latency). This is a deliberate scope choice, not a vendor limitation: `docs/reference/hotelplanner-api-docs.md` documents that HotelPlanner's API does support synchronous real-time booking confirmation (`reserve`, `confirm3DSReservation`) and on-demand reservation lookup (`getReservation`) — but `docs/reference/ti-hotelplanner-implementation-notes.md` confirms TI deliberately excluded those methods for MVP ("Do not expose any payment/reserve flow in TI for MVP. White-label checkout handoff only"), and the current handoff doesn't return an itinerary number on success for `getReservation` to be called against later. None of this is Phase 3A's concern — it's noted here only so whoever eventually scopes Phase 3B knows the real options (capture an itinerary number and poll on demand, vs. taking on the `reserve` payment flow directly) rather than assuming a webhook needs to be invented from nothing.
* **Geolocation (browser `navigator.geolocation`) is not used anywhere in Corralio today.** Confirm this independently; if true, "use current location" is new browser-permission surface, not a reuse of an existing pattern the way the household-timezone `Intl` suggestion was.

## 2. Scope — Phase 3A Only

Add a temporary routing-origin override that a parent can set for a specific upcoming commitment, offering exactly three choices at the point leave-by/What Fits needs an origin:

* **Home** — the existing household origin; the default when no override is set; always available even if never previously overridden.
* **Use current location** — requires an explicit, in-the-moment browser geolocation permission prompt, triggered only by a user gesture (same soft-ask discipline as 3.6A's push permission — never requested speculatively). The resulting coordinates are used to resolve a routing origin for the current action and must not be persisted as raw lat/lng beyond what's needed to complete that specific leave-by/What Fits calculation. No continuous or background location access, no location history, no silent re-use of a previously-granted position on a later visit without a fresh request.
* **Choose another location** — a parent-typed address, geocoded and claimed through the existing Home-origin pattern (Section 1), stored as the active temporary override rather than as Home.

Audit first, then decide the smallest model that satisfies this: does the override apply narrowly to one specific upcoming event, or more broadly to "the next N days" / "this weekend"? Do not default to building a general, standing multi-location address book or per-event-forever history — the founder's instruction is "the smallest model supported by repository evidence." A single "current temporary origin, with a plain expiry (e.g., clears automatically after the commitment passes, or after a bounded time window, whichever the audit finds cheapest to implement correctly) and an explicit manual clear" is very likely sufficient; do not build more than that without a specific, stated reason tied to real repository/product evidence.

The override must never write to or overwrite `origin_address`/`origin_lat`/`origin_lng` on `corralio_households`. Home remains exactly what it is today, unconditionally.

## 3. Privacy and Security

This is the most privacy-sensitive surface Corralio has built to date — treat it accordingly:

* "Use current location" is permissioned, one-time-per-use, and ephemeral. No background tracking, no periodic re-polling, no storage of a raw coordinate history. If any location value must be persisted at all (e.g., to complete an already-in-flight leave-by calculation across a page reload), store the derived resolved-origin result, not an ongoing live-tracking capability, and expire it plainly.
* The UI must visibly indicate when a temporary origin (of either kind) is active and different from Home, so a parent is never confused about where Corralio thinks they're leaving from. It must be trivially easy to clear back to Home.
* RLS-scope the temporary-origin data exactly like the existing Home-origin fields — household-owned, denied cross-household, no broader read/write surface than what Home already has.
* Do not add any new third-party geolocation/reverse-geocoding provider beyond what's needed to resolve "use current location" to a routable point — reuse the existing Geocodio/routing-provider posture and its existing cost/quota discipline (daily caps, skip-logging) rather than introducing a new unmetered call path.

## 4. Explicit Non-Goals (this Phase 3A)

Do not: build any hotel/trip/lodging data model or any HotelPlanner-linked origin suggestion (Phase 3B, separately gated); implement Mapbox, traffic-aware leave-by, or any traffic-check/notification work (Phases 4–5); build a general saved-address book, multi-trip history, or any location feature beyond the three choices in Section 2; add background/continuous location tracking of any kind; add entitlement/Pro gating to this capability; change conflict detection, venue matching, or schedule ingestion; modify Slice 3.6A or the arrival-buffer/Arbiter-audit work.

## 5. Tests

Add/update deterministic tests covering at minimum:

1. default origin resolution is Home when no temporary override is set — unchanged from today's behavior;
2. a temporary override, once set, is used in place of Home for leave-by/What Fits until cleared or expired, and never overwrites the stored Home fields;
3. "choose another location" reuses the existing geocode/claim/cap/skip-logging pattern and behaves identically to it on failure (invalid address, daily cap reached, concurrent claim);
4. "use current location" permission states (granted, denied, dismissed, unsupported, error) all recover safely and never silently fall back to a stale or fabricated location;
5. no raw current-location coordinate is retained beyond what's needed for the specific calculation in flight — assert this directly rather than only asserting the UI hides it;
6. the temporary override expires/clears per whatever smallest model Section 2's audit lands on, and manual clearing works independently of that expiry;
7. RLS: a temporary origin is scoped and denied cross-household exactly like the existing Home-origin fields.

## 6. Physical-Device Evidence Boundary

Automated/browser tests may exercise the Permissions API and Geolocation API through controlled browser-level fixtures, and may verify UI states, storage behavior, and expiry logic. They cannot certify real-device GPS accuracy, real permission-prompt behavior across iOS/Android browser variants, or how a real device's location services interact with the PWA — those remain `UNVERIFIED ON PHYSICAL DEVICE` until witnessed on real hardware, following the same evidence-boundary discipline established in Slice 3.6A.

## 7. Verification

Before completion run: focused temporary-origin tests; all affected deterministic tests; complete Corralio test suite; explicit Corralio TypeScript validation; zero-warning Corralio lint; `git diff --check`; all four production builds (`corp-app`, `corralio-app`, `referee-app`, `ti-web`).

Also verify: no Slice 3.6A behavior changed; no Mapbox/traffic-aware/notification work entered the diff; no hotel/trip data model was added; Home-origin fields/behavior are unchanged when no override is active.

Do not push. Do not deploy.

## 8. Notes and Durable Record

Update `apps/corralio/notes.md` with: the confirmed (or corrected) starting facts from Section 1; the exact temporary-origin model implemented and why it's the smallest one the audit could justify; the geolocation permission-state handling; privacy/retention behavior actually implemented (what is and isn't persisted, and for how long); tests/builds; explicit confirmation that no hotel/trip/Mapbox/notification work entered this diff; final verdict.

## 9. Commit

Review the complete diff before committing. Commit only files belonging to this temporary-routing-origin work. Use a focused local commit message. Do not push. Do not deploy.

## 10. Final Verdict

Return exactly one appropriate terminal verdict:

`SLICE 3.6B PHASE 3A COMPLETE LOCALLY`
`SLICE 3.6B PHASE 3A READY FOR DATABASE VERIFICATION`
`SLICE 3.6B PHASE 3A READY AFTER LISTED FIXES`
`SLICE 3.6B PHASE 3A BLOCKED BY AUDIT FINDING`
`SLICE 3.6B PHASE 3A NOT READY`

Include: Section 1 fact confirmation/correction; the exact override model delivered (scope/expiry rule) and the audit reasoning for why it's the smallest defensible one; privacy/retention behavior as actually implemented; tests/builds; local commit hash(es); explicit confirmation that nothing was pushed or deployed, and that no Phase 3B/4/5 scope entered this diff.
