# Corralio Slice 3.6B — Phase 3A: Private Temporary Routing Origin

> **Corrected 2026-09-04.** A pre-implementation audit found this prompt directionally correct but not ready to implement unchanged: it repeatedly scoped the override to "leave-by/What Fits," but What Fits does not read the household origin at all today (confirmed directly against `whatFits.ts`/`whatFits.server.ts` — its routing legs run `current event → candidate → next event`, never Home). It also asked Codex to choose a per-event-vs-household-wide model that the roadmap already settles as per-event, described `claimOrigin()` as directly reusable when it is a hard-coded `corralio_households` writer, and did not address that today's route cache stores one result per event keyed only by timestamp freshness, with no field distinguishing a Home-derived route from any other kind. Full audit and independent re-verification at `docs/corralio/cpo/2026-09-04-cpo-audit-phase3a-routing-origin-scope-and-cache-boundary.md`. This version supersedes the original in place; nothing below is historical.

**Build-only for the launch-scoped capability described below. Does not authorize hotel/trip data modeling, Mapbox/traffic-aware leave-by, or any 3.6B notification/traffic-check work — those remain separately gated (Phase 3B, Phase 4, Phase 5). Does not modify Slice 3.6A, the Slice 3.6B arrival-buffer/Arbiter-audit work, or What Fits' routing/candidate-selection logic in any way.**

## 0. Why This Exists

Founder decision, 2026-08-28 (Slice 3.6B Phase 3, following the CPO's routing-origin reconciliation): today's **leave-by** logic can only route an event from a single household "Home" origin. That's wrong for a family traveling to a tournament, a game across town from a relative's house, or any commitment that doesn't start from Home. The founder explicitly split this work in two rather than let it wait on unrelated, unbuilt scope:

**Phase 3A (this prompt, build for launch):** a private, temporary routing-origin capability for a specific upcoming event's **leave-by estimate**, independent of any hotel/travel-booking concept. A parent can say "leaving from Home," "use current location," or "choose another location" for that one commitment, without that ever overwriting Home.

**Phase 3B (explicitly deferred, not this prompt):** automatically offering a confirmed hotel/trip as a suggested origin once Corralio has real personal lodging/trip state. Do not build any trip/hotel data model to support this prompt — Phase 3A must work completely independently of whether the family ever books lodging through Corralio at all.

**What Fits is out of scope for this prompt, and correcting that is itself part of the fix.** What Fits' routing (`apps/corralio/lib/whatFits.ts` `selectWhatFitsGap`, `apps/corralio/lib/whatFits.server.ts`) computes candidate legs as `current event → candidate → next event` — it reads the two bracketing events' own geocoded coordinates and never touches Home or any origin field. There is no "start from Home instead of the previous event" concept in What Fits today, and building one would mean redesigning completed Slice 4.6 behavior — a separate, unauthorized scope decision. This prompt covers **event leave-by only**.

## 1. Confirmed Starting Facts (independently re-verified 2026-09-04; corrected from the original filing)

* **Today's leave-by origin model is Home-only, and only leave-by uses it.** `apps/corralio/lib/leaveBy.server.ts` reads `origin_address`/`origin_lat`/`origin_lng` from `corralio_households` — one address per household, no per-event or per-weekend override. `saveHouseholdOrigin()` validates the address, calls RPC `corralio_prepare_household_origin_v1`, then geocodes/claims it through a Geocodio-backed flow with a daily cap and `logSkip()` for skip reasons (`concurrent_claim_skipped`, `daily_cap_reached`). **What Fits does not use any of this** — verified directly: `selectWhatFitsGap` (`whatFits.ts`) sorts events and routes between consecutive `currentEvent`/`nextEvent` pairs; `whatFits.server.ts` builds routing legs from `gapResult.gap.currentEvent.latitude/longitude` as the sole origin. No household origin field is read anywhere in the What Fits path.
* **`claimOrigin()` cannot be reused unmodified for an event-scoped override.** Confirmed at `leaveBy.server.ts` line 122: it runs `admin.from("corralio_households").update({ origin_geocode_claimed_at: claimTimestamp }).eq("id", householdId).eq("origin_address", address)...` — a hard-coded write to Home's own columns, gated on Home's own claim/geocode-state fields. It cannot safely claim a temporary, event-scoped address without either overwriting Home's claim state or requiring new columns it doesn't know about. Reuse its **validation, concurrency semantics (unclaimed-then-stale retry), quota reservation (`reserveVendorCall`), provider adapter, sanitized logging, and failure classifications** — write a narrow, new claim function for the event-override target rather than calling `claimOrigin()` itself.
* **The existing route cache stores one result per event with no provenance field, and freshness is keyed only to Home's geocode timestamp.** Confirmed at `leaveBy.server.ts` (`loadRouteClaimRows`, `loadReusableRoute`, `routeEventGroups`) and `app/_lib/productData.ts` line 116: a route's freshness is decided by `isRouteFresh({ leaveByComputedAt, originGeocodedAt, locationGeocodedAt })`, comparing timestamps only — there is no field anywhere recording *which* origin (Home vs. temporary) produced `estimated_drive_minutes`/`leave_by_computed_at`. If a temporary-origin route were written through this same path, a later page load with no active override would render it as if it came from Home, with no way to detect the mismatch. See Section 3 for the required fix.
* **No trip, hotel, or booking record exists anywhere in Corralio, and Phase 3B's HotelPlanner API options are not this prompt's concern.** Confirmed by direct repository search. None of it changes anything here — whoever eventually scopes Phase 3B should read the CPO's Phase 3B evidence-reconciliation record (`docs/corralio/cpo/2026-09-03-cpo-audit-hotelplanner-phase3b-diagnostic-overtaken.md`) instead of this prompt for that context.
* **Geolocation (browser `navigator.geolocation`) is not used anywhere in Corralio today.** Confirm this independently; if true, "use current location" is new browser-permission surface, not a reuse of an existing pattern the way the household-timezone `Intl` suggestion was.
* **Per-event scope is already the settled repository direction, not an open question.** `docs/corralio/CORRALIO_PRODUCT_ROADMAP.md` line 185 lists "Per-event origin overrides" under V2 Planning Intelligence — the founder's 2026-08-28 decision to build a launch-scoped subset of that now (Phase 3A) inherits its shape: **per event**, not household-wide or "next N days." Section 2 below states this as a decision, not an audit question.

## 2. Scope — Phase 3A Only

Add a temporary routing-origin override that a parent can set for **one specific upcoming event's leave-by estimate**, offering exactly three choices at the point that event's leave-by needs an origin:

* **Home** — the existing household origin; the default when no override is set for that event; remains selectable at any time. If the household has no geocoded Home on file, show the existing "set up your home address" requirement — do not fabricate a route from an absent origin.
* **Use current location** — requires an explicit, in-the-moment browser geolocation permission prompt, triggered only by a single user gesture (same soft-ask discipline as 3.6A's push permission — never requested speculatively, never `watchPosition`, never background polling, never silently reused across a later visit or reload). Validate the returned coordinates server-side against finite/plausible latitude-longitude ranges and route directly through the existing routing provider (ORS) — **no reverse geocoding is needed or wanted**; this is a coordinate, not an address, and does not need to become a human-readable location. Treat the browser-supplied coordinates as caller-supplied private input, not trusted identity evidence.
* **Choose another location** — a parent-typed address for that one event, geocoded and claimed through a narrow new claim boundary that reuses the existing Home-origin pattern's validation/concurrency/quota/provider/logging (Section 1), but writes to event-override-specific storage — never to `corralio_households`' Home columns.

**This is a settled per-event model, not an open design question:** a typed alternate address attaches to exactly one upcoming event; a current-location choice is request-scoped and never persisted beyond completing that event's leave-by calculation; clearing or expiration affects only that one event. **Do not build a household-wide temporary origin, a general saved-address book, or multi-event/standing overrides of any kind** — the roadmap (Section 1) already places broader per-event/multi-location work in V2, and this prompt's launch-scoped slice is deliberately narrower than that.

The durable alternate-address override expires at **the event end, or the event start when no end exists, plus a 24-hour grace period**. Eligibility and cleanup must derive this boundary from the event's current persisted timing so a reschedule cannot leave a stale stored expiry. Expired overrides are inactive immediately and are hard-deleted by a separate bounded, cron-authenticated cleanup route. Manual clear remains available at any time. Do not build more than that.

The override must never write to or overwrite `origin_address`/`origin_lat`/`origin_lng` on `corralio_households`. Home remains exactly what it is today, unconditionally. **The override must never be applied to What Fits' candidate routing** — What Fits has no origin concept to override (Section 0); nothing in this prompt changes what What Fits reads or how it selects candidates.

## 3. Data Model & Route-Cache Boundaries

This section exists because of the route-cache finding in Section 1 — read it before writing any storage code.

* **Home's existing route cache (`corralio_events.estimated_drive_minutes`, `leave_by_computed_at`, and the fields `isRouteFresh` reads) must be left untouched by this work.** A route computed from a temporary origin (current-location or alternate-address) must never be written into those same columns, because nothing downstream (`productData.ts` line 116, or any other reader) can currently tell a Home-derived value from any other kind — it would be silently presented as a Home route on a later reload.
* **Only the typed alternate-address origin and its route result receive durable event-scoped storage with explicit provenance.** Store only the route duration/distance/provider/freshness state needed to render leave-by; do not snapshot a separate leave-by timestamp or arrival policy. Alternate-route freshness must depend on both the alternate-origin geocoding timestamp and the event destination's geocoding timestamp.
* **Current location is strictly ephemeral.** Current GPS coordinates and any route derived from them are request/session-only. Do not persist either the coordinates or the route result. On reload, resolve to the persisted typed alternate origin when one exists and remains active; otherwise resolve to Home. Never reuse a current-location result across a reload or later visit.
* **Clearing or expiring an override must restore/recompute the Home-derived route** for that event exactly as it would render with no override ever having been set — not leave a stale temporary-origin value behind, and not require the parent to trigger a fresh calculation manually.
* **Reuse breadth for "choose another location":** validation, concurrency semantics, quota reservation, provider adapter, sanitized logging, and failure classifications, per Section 1. Do not call `claimOrigin()`/`clearOriginClaim()` directly; add the narrowest new claim/persistence boundary that satisfies the same guarantees for an event-scoped target.

### Required-arrival invariant

Temporary-origin selection changes only the estimated drive duration. Leave-by remains:

`resolved required-arrival timestamp - selected-origin drive duration`

Both durable alternate-address results and ephemeral current-location results must consume the completed shared hierarchy unchanged:

`ics_explicit -> source_preference -> team_preference -> corralio_default`

Do not persist, duplicate, reinterpret, or create a separate leave-by/arrival policy.

### Single-event routing boundary

Add a narrow server-only orchestration for exactly one event ID. It must derive the household from the authenticated viewer; prove the event belongs to that household and is within the existing Phase 3A weekend routing context; validate all caller-supplied coordinates before any provider access; route only that event; reserve the existing ORS quota; and reject manipulated/cross-household requests before Geocodio or ORS. "Currently displayed in the UI" is never an authorization primitive. Client in-flight disabling plus an atomic, short-lived, payload-free event claim must prevent duplicate clicks or concurrent requests from producing duplicate provider calls. The current-location claim may retain event/household/claim metadata only; it must never retain coordinates or a route result.

Do not call the existing batch `computeWeekendLeaveBy()` orchestration for this single-event action: it unconditionally requires Geocodio configuration and processes a broad event set. Reuse its bounded provider adapters, quota, failure taxonomy, and sanitized audit behavior through the new single-event boundary.

## 4. Privacy and Security

This is the most privacy-sensitive surface Corralio has built to date — treat it accordingly:

* "Use current location" is permissioned, one-time-per-use, and ephemeral: one fresh user-gesture request only — no `watchPosition`, no background/periodic polling, no reuse of a previously-granted position across a reload or later visit, no analytics event carrying the coordinate, no raw-coordinate logging anywhere (application logs, provider audit rows, or otherwise), and no persisted current-location route result.
* Before requesting browser permission, tell the parent that current location is used once, sent to the routing provider to estimate the drive, and not retained by Corralio.
* Alternate-address overrides use the exact event-time-plus-24-hours lifecycle in Section 2. Expired rows are inactive immediately; a separate cron-authenticated cleanup route hard-deletes a bounded batch without coupling cleanup failure to schedule refresh, push, or another product workflow.
* The UI must visibly indicate when a temporary origin (of either kind) is active on an event and different from Home, so a parent is never confused about where Corralio thinks they're leaving from for that commitment. It must be trivially easy to clear back to Home.
* Keep the event-card surface progressively disclosed: show a compact origin status such as `Leaving from Home · Change`, and reveal the three choices only after the parent explicitly opens it. Do not permanently place three controls on every event card.
* RLS-scope the temporary-origin data exactly like the existing Home-origin fields — household-owned, denied cross-household, no broader read/write surface than what Home already has.
* Do not add any new third-party geolocation/reverse-geocoding provider — "use current location" needs no reverse geocoding at all (Section 2); route the raw coordinate directly through the existing ORS routing call, reusing its existing cost/quota discipline (daily caps, skip-logging) rather than introducing a new unmetered call path.
* **Extend `docs/corralio/CORRALIO_SECURITY_PRIVACY.md`'s "Home and origin locations" rule (line 56) to temporary-origin data of both kinds:** never expose it publicly or through TI, never treat it as a venue candidate, never let it participate in venue matching, provisional venues, Overture evidence, or any public venue intelligence, avoid raw-coordinate/raw-address logging and analytics, apply strict household RLS. A temporary origin is exactly as sensitive as Home, not less — in current-location's case, arguably more so.

## 5. Explicit Non-Goals (this Phase 3A)

Do not: build any hotel/trip/lodging data model or any HotelPlanner-linked origin suggestion (Phase 3B, separately gated); implement Mapbox, traffic-aware leave-by, or any traffic-check/notification work (Phases 4–5); build a general saved-address book, multi-trip history, household-wide temporary origin, or any location feature beyond the three per-event choices in Section 2; add background/continuous location tracking of any kind; add entitlement/Pro gating to this capability; change conflict detection, venue matching, or schedule ingestion; change What Fits' routing, candidate selection, or origin concept in any way (it has none today — keep it that way for this prompt); modify Slice 3.6A or the arrival-buffer/Arbiter-audit work; write a temporary-origin route result into the Home-derived route-cache columns (Section 3).

## 6. Database / Migration Gate

This work most likely requires a migration (new columns or a table for the event-scoped override, its provenance, and its expiry/retention). Follow the same staged-verification discipline already used elsewhere in this repository (e.g., Phase A+B's Stage 1 database gate):

* **Stage 1:** deliver the application code, an **unapplied** migration, a catalog verifier, and a rollback-only behavioral verifier. Stop at the terminal verdict `SLICE 3.6B PHASE 3A READY FOR DATABASE VERIFICATION` rather than proceeding further in the same pass.
* **Only after a human applies the migration** in a verification environment should bounded UAT and final completion proceed to a `COMPLETE LOCALLY` verdict.
* **Offline/unit tests cannot prove RLS.** Real rollback-only database verification is required specifically for: authorization (owning household can read/write its own override), cross-household denial, expiry behavior, and cleanup (no orphaned rows after an event passes or an override is cleared).
* UAT cleanup must explicitly account for and zero out: event-override rows, payload-free current-location claim rows, provider/vendor-call ledger rows created during testing, household/Auth test fixtures, and confirm zero retained raw current-location coordinates or current-location route results anywhere.

## 7. Tests

Add/update deterministic tests covering at minimum:

1. default origin resolution is Home when no temporary override is set for an event — unchanged from today's behavior;
2. a temporary override, once set on a specific event, is used in place of Home for that event's **leave-by** calculation until cleared or expired, and never overwrites the stored Home fields on `corralio_households`;
3. **What Fits' candidate routing is unaffected** — assert its behavior is identical with and without an active temporary origin on nearby events, since it has no origin concept to consult;
4. "choose another location" reuses the existing validation/concurrency/quota/provider/logging pattern (not `claimOrigin()` itself — Section 3) and behaves identically to it on failure (invalid address, daily cap reached, concurrent claim);
5. "use current location" permission states (granted, denied, dismissed, unsupported, error) all recover safely and never silently fall back to a stale or fabricated location; out-of-range/invalid coordinates are rejected server-side before any routing call;
6. no raw current-location coordinate is retained beyond what's needed for the specific calculation in flight — assert this directly rather than only asserting the UI hides it;
7. **a temporary-origin route is never written into the Home-derived route-cache columns**, and reading an event with no active override after one was previously set and cleared/expired returns the Home-derived route, not a stale temporary one (Section 3);
8. the durable alternate override becomes inactive at event end (or start when no end exists) plus 24 hours, bounded cleanup hard-deletes it, and manual clearing works independently of expiry while restoring the Home-derived route;
9. RLS: a temporary origin is scoped and denied cross-household exactly like the existing Home-origin fields.
10. changing an event/source/team arrival preference changes leave-by through the existing shared required-arrival resolver without recomputing or rewriting the selected-origin drive duration;
11. a rescheduled event uses its current end/start plus 24 hours for lifecycle and invalidates/re-evaluates route freshness from current destination state;
12. duplicate clicks/concurrent requests authorize at most one provider call for that event operation;
13. manipulated and cross-household event IDs are rejected before any Geocodio/ORS reservation or provider access.

## 8. Physical-Device Evidence Boundary

Automated/browser tests may exercise the Permissions API and Geolocation API through controlled browser-level fixtures, and may verify UI states, storage behavior, and expiry logic. They cannot certify real-device GPS accuracy, real permission-prompt behavior across iOS/Android browser variants, or how a real device's location services interact with the PWA — those remain `UNVERIFIED ON PHYSICAL DEVICE` until witnessed on real hardware, following the same evidence-boundary discipline established in Slice 3.6A.

## 9. Verification

Before completion run: focused temporary-origin tests; all affected deterministic tests; complete Corralio test suite; explicit Corralio TypeScript validation; zero-warning Corralio lint; `git diff --check`; all four production builds (`corp-app`, `corralio-app`, `referee-app`, `ti-web`).

Also verify: no Slice 3.6A behavior changed; **no What Fits behavior changed**; the completed `ics_explicit -> source_preference -> team_preference -> corralio_default` resolver remains authoritative; no Mapbox/traffic-aware/notification work entered the diff; no hotel/trip data model was added; Home-origin fields/behavior are unchanged when no override is active; the Home-derived route cache is unchanged by any temporary-origin calculation (Section 3); database cleanup checklist (Section 6) fully accounted for once a migration is applied.

Do not push. Do not deploy.

## 10. Notes and Durable Record

Update `apps/corralio/notes.md` with: the confirmed (or corrected) starting facts from Section 1; the exact temporary-origin model implemented (per-event, leave-by-only) and its expiry/retention rule; the geolocation permission-state handling; the provenance/storage separation implemented for temporary-origin routes versus the existing Home cache (Section 3); privacy/retention behavior actually implemented (what is and isn't persisted, and for how long); tests/builds; explicit confirmation that no hotel/trip/Mapbox/notification/What-Fits work entered this diff; final verdict.

## 11. Commit

Review the complete diff before committing. Commit only files belonging to this temporary-routing-origin work. Use a focused local commit message. Do not push. Do not deploy.

## 12. Final Verdict

Return exactly one appropriate terminal verdict:

`SLICE 3.6B PHASE 3A COMPLETE LOCALLY`
`SLICE 3.6B PHASE 3A READY FOR DATABASE VERIFICATION`
`SLICE 3.6B PHASE 3A READY AFTER LISTED FIXES`
`SLICE 3.6B PHASE 3A BLOCKED BY AUDIT FINDING`
`SLICE 3.6B PHASE 3A NOT READY`

If a migration is required (expected — see Section 6), the correct Stage 1 outcome is `READY FOR DATABASE VERIFICATION`, not `COMPLETE LOCALLY` — do not skip ahead of the database gate.

Include: Section 1 fact confirmation/correction; the exact override model delivered (per-event, leave-by-only, expiry/retention rule) and why it's the smallest defensible one; the provenance/route-cache separation implemented (Section 3); privacy/retention behavior as actually implemented; tests/builds; local commit hash(es); explicit confirmation that nothing was pushed or deployed, and that no Phase 3B/4/5 or What-Fits scope entered this diff.
