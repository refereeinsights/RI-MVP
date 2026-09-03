# CPO Investigation — Private Corralio Calendar Feed + Travel Planning Lifecycle

**Date:** 2026-09-03
**Type:** CPO/product + repository investigation. **No implementation authorized by this document.**
**Repository state investigated:** `main` @ `5354b9c5`, monorepo at `/Users/roddavis/RI_MVP/RI-MVP`.

---

## 0. Repository truth, up front

Before any recommendation, here is exactly what exists today versus what's designed-only versus what's a real gap. Everything below this line was confirmed by direct code/schema inspection, not inferred from docs or memory.

| Capability | Status |
|---|---|
| Corralio internal event model (`corralio_events`), provenance, soft-disconnect | **Implemented.** Mature, well-normalized. |
| Recurrence handling | **Implemented** — but fully flattened to concrete instances at ingest time (no stored RRULE). Relevant: a Corralio-authored feed doesn't need to re-derive recurrence; it can emit flat VEVENTs, same as the internal model. |
| Household → children → teams (multi-child, multi-sport) | **Implemented.** No cardinality limits. |
| Tournament concept (multi-day, distinct from a regular game) | **Does not exist.** Corralio is deliberately decoupled from TI's tournament schema (a guard test enforces this). This is a real gap for any "is this a tournament" rule. |
| Venue/location model + household-to-venue distance/drive-time | **Implemented.** Real geocoding (Geocodio + OpenRouteService), real per-event `estimated_drive_minutes`/`route_distance_meters`. |
| Outbound ICS **generation** (a feed Corralio publishes) | **Does not exist in Corralio.** Corralio only *parses* inbound ICS today. |
| Outbound ICS generation **elsewhere in the monorepo** | **Exists and is live** — TI (`apps/ti-web/lib/planner/calendarFeeds.ts` + `app/weekend-planner/calendar/[token]/route.ts`) is a complete, hand-rolled, RFC 5545–compliant serializer with HMAC token rotation, gated behind TI's paid "Weekend Pro" tier. This corrects a prior-session misremembering that called it merely a "pattern" — it's real, running code, portable (not currently packaged for cross-app import, but a genuine porting candidate). |
| HotelPlanner attribution/reconciliation design | **Designed and locked, not built.** Zero implementation anywhere in `apps/corralio`. |
| Corralio lodging-state (booked/cancelled hotel per household/event) | **Does not exist.** No schema, no code. TI's `ti_hotel_bookings` is cited only as a design template. |
| Overnight-travel inference from distance/duration data | **Does not exist.** The data to build it on (drive time/distance) is real; the thresholding logic is not. |
| Bearer-token/opaque-URL sharing pattern | **Exists as policy** (`CORRALIO_SECURITY_PRIVACY.md`, "Public sharing" section) and as one **single-use** precedent (HotelPlanner attribution token). **Does not exist** as a durable, repeatedly-fetched, third-party-held capability URL — that's a new pattern. |
| Analytics/instrumentation for the metrics this investigation wants | **Does not exist.** No generic event log; the closest table (`corralio_external_api_calls`) is a poor semantic fit (it's a paid-API quota/cost tracker, not an anonymous-fetch log). |

The single most important correction to the premise of this investigation: **the example in Section 5 of the prompt ("Hotel booked ✓") cannot be built today, independent of any calendar decision.** There is no lodging-state concept anywhere in Corralio. That's not a calendar-feed problem; it's an unbuilt-prerequisite problem, and it changes the phasing recommendation below materially.

---

## 1. Assessment

**Is private Corralio ICS publishing strategically valuable?**

Yes, directionally — but the investigation as scoped bundles three ideas of very different risk and readiness into one initiative, and only one of them is ready to ship. I'm going to unbundle them rather than give one verdict for all three (Section 12 has the split classification the prompt asked for).

- **Activation:** Low relevance. A calendar feed is a retention/habit mechanism, not an activation one — it presupposes a household has already connected schedules.
- **Retention:** This is the real bet, and it cuts both ways. The engineering cost just got a lot cheaper (TI's serializer is portable), which makes the *build* case stronger. But the *strategic* risk — the concern this investigation itself was asked to re-litigate, that Apple/Google Calendar becomes "good enough" and families stop opening Corralio — has zero evidence behind it in either direction. Corralio has never shipped this. Nothing in the repo measures ambient usage today (see Section 9). Recommending "Do Now" on the full three-phase design without a bounded test of the *retention* hypothesis first would repeat exactly the mistake this document's own founder mandate warns against — building because the idea sounds right, not because there's evidence.
- **Revenue:** Real, plausible upside via HotelPlanner handoffs, but it's downstream of infrastructure that doesn't exist yet (Section 6).
- **Referral:** Genuine but secondary — a calendar entry visible to a co-parent, grandparent, or carpool partner via a shared calendar is a mild organic-discovery channel. Not a primary reason to build this.

**Verdict on the bundle as proposed: TEST FIRST.** Ship the smallest slice (Phase 1 only, Section 2) to validate the retention hypothesis with real instrumentation before building Phase 2/3.

---

## 2. Smallest Useful Version

**Phase 1 — Family calendar publishing (imported events only).**
One private, tokenized, per-household ICS feed. Contains only aggregated source events (games/practices already in `corralio_events`), formatted per the data contract in Section 3. No Corralio-generated planning items, no travel logic, no hotel state. This is buildable now, substantially by porting TI's existing serializer (Section 0), and it's the only phase with a plausible near-term evidence path (Section 9's ambient-usage metrics attach here first).

**Phase 2 — Corralio-generated planning reminders (travel/lodging intent only, no booking state).**
Adds one Corralio-authored VEVENT per qualifying multi-day trip, always reading "Plan [destination] weekend →" (no booked/not-booked distinction, since that data doesn't exist yet — see Phase 3). Gated on Phase 1 showing the feed is actually used (subscribed *and* still being fetched weeks later, not just added once) — otherwise you're adding planning-intelligence surface area to a distribution channel nobody's actually watching.

**Phase 3 — Hotel reservation-state updates.**
Requires the HotelPlanner attribution/reconciliation system (`docs/reference/corralio-hotelplanner-attribution-design.md`) to actually be built for Corralio first — today it's a locked design with zero Corralio-side code. This is not a calendar-team dependency; it's a completely separate, already-identified, already-blocked workstream (the Phase 3B evidence diagnostic hasn't even been run). **Do not treat Phase 3 as a calendar-feed feature that can be scheduled independently — it is gated on infrastructure this investigation didn't touch and can't accelerate.**

These three phases should not be assumed to ship together, and Phase 3 in particular shouldn't be on the same roadmap horizon as 1 and 2 — it's waiting on a different team decision entirely (see NEXT 5 ACTIONS in the execution-state doc: HotelPlanner Phase 3B evidence diagnostic is still unrun).

---

## 3. Data Contract

### Family sports events (imported, Phase 1)

| Field | Treatment | Rationale |
|---|---|---|
| Child identity | **Included, reduced** — first name + last initial, not full name | Full name + a recurring venue pattern, broadcast to a third-party calendar provider Corralio doesn't control, is a location-pattern-of-a-minor concern. First name + initial preserves usefulness ("who's this for") without that exposure. |
| Team name / sport | **Included** | Needed for the event to be legible at a glance; low sensitivity on its own. |
| Start/end time + timezone | **Included** | Core calendar function; must use the event's resolved timezone, not household-local, to avoid silent shifts (see Section 7 on timezone handling). |
| Location | **Included, reduced to venue name + city** — not full street address in V1 | Full address adds real precision to a location-pattern-of-a-minor signal for negligible product value the deep link doesn't already cover. Revisit if user feedback says otherwise. |
| Field/court label | **Optional** — include if present, low sensitivity, genuinely useful for finding the right field at a multi-field complex | |
| `schedule_arrival_at` / computed leave-by time | **Excluded from V1** | This is Corralio's differentiated planning intelligence. Publishing it into the calendar item itself undercuts the very reason to open the app — the calendar's job here is presence/awareness, not planning. |
| Free-text `notes` | **Excluded** | Freeform field, unbounded risk of containing something a parent wouldn't want re-broadcast to Apple/Google/Outlook's servers. |
| Internal IDs (`household_id`, `schedule_source_id`, `source_event_uid`) | **Excluded from visible content**, used only internally for stable-UID derivation (Section 7) | |
| "View in Corralio" deep link | **Included** | The whole mechanism by which the feed is supposed to route back into the app. |

### Corralio-generated planning items (Phase 2/3)

| Field | Treatment |
|---|---|
| Trip label (e.g. "Seattle tournament weekend") | Included — destination/description only, no PII |
| Date range | Included |
| Booking-status text (Phase 3 only) | Included, **binary only**: "Hotel not yet planned" / "Hotel booked ✓" |
| Hotel name | **Excluded** — matches the prompt's own instruction and adds real sensitivity (a named hotel + travel dates for a family with minor children) for no product value the deep link doesn't cover |
| Check-in/check-out dates, confirmation number, price, traveler identity, HotelPlanner attribution token, household identifiers | **Excluded, no exceptions** | Direct match to the prompt's explicit prohibition list; also directly governed by `CORRALIO_SECURITY_PRIVACY.md`'s data-classification table ("secrets and access capabilities" → never analytics, protected logging). |
| "Plan weekend / View plan" deep link | Included |
| Distinguishing marker (Corralio-generated vs. imported) | Included as a naming convention (`SUMMARY` prefixed "Corralio:", `DESCRIPTION` states it's a planning reminder) plus an internal `X-CORRALIO-ITEM-TYPE` property, since most consumer calendar UIs won't surface custom X-properties to the user — the visible cue has to be the text itself. |

---

## 4. Travel Qualification Rule

Corralio has no tournament concept to lean on (Section 0). The only reliable existing signal is `leaveBy`'s real per-event drive time/distance from household origin. Building a new tournament-detection system just for this feature would be exactly the kind of new infrastructure the prompt asks to avoid ("inspect current repository capabilities before proposing new infrastructure").

**Recommended V1 rule (deterministic, no new infrastructure):**

An event qualifies as "probably needs lodging" if and only if:
1. Estimated one-way drive time from household origin ≥ 90 minutes (using existing `leaveBy`/OpenRouteService data), **and**
2. At least one other event exists for the same child within a 40-hour window, at a venue within a short distance of the first (a same-trip cluster, using existing `location_lat`/`location_lng` + `starts_at`).

Condition 2 is the precision lever: it excludes the common case of a single far-away one-day tournament pool-play day that most families genuinely day-trip. It only fires for a real multi-day commitment.

**Both thresholds (90 minutes, 40 hours) are hypotheses, not settled values** — flag them for the same tuning the prompt already asks for on lead time. Start conservative (favor precision), widen only once false-positive/false-negative data exists.

**False-positive risk:** a family that owns a second home near the venue, or chooses to day-trip twice for a Saturday/Sunday doubleheader at 90+ minutes out, would get a reminder they don't need. This is an acceptable V1 failure mode *only if* the reminder is genuinely low-frequency and non-intrusive (Section 5) — it's a dismissible "is this handled?" prompt, not a hard claim.

---

## 5. Planning Reminder Rule

- **Lead time:** Default to a single fixed **6 weeks**, not a variable/distance-scaled rule. There's no data yet to justify a more complex rule, and 6 weeks matches the founder's own example while giving real hotel-availability runway (TI's own hotel-search horizon tooling supports booking up to ~730 days out, so lead time isn't a hotel-availability constraint — it's a "don't nag before plans are settled" constraint). Test 4 vs. 6 weeks only after Phase 2 has real usage.
- **Maximum reminder count:** **One planning item per qualifying trip**, updated in place via UID + SEQUENCE bump — never a second, duplicate entry. This is both a product requirement (the prompt is explicit about not creating multiple promotional touches) and an ICS mechanics requirement (Section 7).
- **Suppression conditions for V1:** the item disappears if the underlying source event(s) are cancelled/removed, and once the trip's dates have fully passed. There is **no "dismiss" affordance in V1** — a calendar item has no real feedback channel back to Corralio, so a snooze/dismiss can only be simulated by Corralio removing the item server-side on some signal, and no such signal exists yet. Don't build a fake dismiss.
- **Booking-state behavior:** In Phase 2 (before Phase 3 lands), the item always reads "Plan weekend →" — no booked/not-booked claim, since that data doesn't exist. Only add the binary "Hotel booked ✓" state once Phase 3's reconciliation actually exists (Section 6).
- **Cancellation behavior:** once Phase 3 exists, a cancelled-then-reconciled booking reverts the item to "Hotel not yet planned." See Section 8 for why this cannot be assumed to propagate quickly through the calendar client itself.

---

## 6. HotelPlanner Integration

**What exists today, precisely:** a locked design document (`docs/reference/corralio-hotelplanner-attribution-design.md`) describing opaque-token attribution + a scheduled `getReport` reconciliation worker, corrected once already for a real bug (string vs. numeric status field). **Zero of it is implemented in `apps/corralio`.** No outbound HotelPlanner link-builder, no token generator, no household-mapping table, no reconciliation worker, no lodging-state schema. The only booking-state table in the repo (`ti_hotel_bookings`) belongs to a different product and is cited only as a reusable template.

**What must land before the calendar can show `hotel needed → hotel booked → hotel cancelled`:**
1. The Corralio-side `corralio_hotel_bookings` (or equivalent) schema — doesn't exist.
2. The outbound HotelPlanner link/attribution-token generation code — doesn't exist.
3. The reconciliation worker — doesn't exist, and depends on the still-unrun Phase 3B evidence diagnostic (`docs/prompts/corralio-hotelplanner-phase3b-evidence-diagnostic-prompt.md`) to even confirm the `getReport` status-field contract.
4. Only then can the calendar feed read a real lodging state.

This is a hard sequencing fact, not a preference: **Phase 3 cannot be scheduled on the calendar team's timeline at all.** It rides behind an already-identified, already-blocked, unrelated workstream.

---

## 7. Privacy/Security Review

**Governed by existing policy, not a blank slate.** `CORRALIO_SECURITY_PRIVACY.md`'s "Public sharing" section already states the standard a bearer-URL mechanism must meet: narrowly scoped, minimal exposed fields, never expose home/origin, revocable, tokens excluded from analytics. The data contract in Section 3 is built to satisfy that section directly.

**Two real gaps, not just implementation work:**
1. **No existing precedent for a *durable, repeatedly-fetched, third-party-retained* capability URL.** Every bearer-token pattern Corralio has actually shipped (HotelPlanner attribution) is single-use and server-to-server. A calendar subscription is the opposite: long-lived, handed directly to Apple/Google/Microsoft's own servers, which then retain and re-serve the content indefinitely and outside Corralio's control. `CORRALIO_SECURITY_PRIVACY.md` has language for point-in-time sends (email/SMS) but nothing addressing a standing third-party copy. **This needs a new subsection, not just an implementation that assumes the existing rules cover it.**
2. **ADR-025 ("Private planning data must be protected by RLS") is directly implicated.** An ICS feed is, by definition, bearer-token access instead of session/RLS-based access — it's a deliberate, scoped exception to that ADR's discipline, and it should be recorded as one explicitly rather than quietly built around it.

**Minimum safe architecture:**
- Opaque, high-entropy (≥128-bit), per-household token — HMAC-signed and rotatable, following the pattern already proven by TI's `calendarFeeds.ts` token lifecycle (create/reveal/regenerate/revoke), ported rather than reinvented.
- Token is scoped to exactly one household; no cross-household enumeration possible.
- Revocation/regeneration available to the parent at any time (schedule disconnection, child removal, household deletion, or accidental-share recovery all need this).
- Never place the token, or any content it unlocks, into analytics/logging in identifiable form (matches the existing data-classification table's rule for "secrets and access capabilities").
- Feed content follows the minimal field set in Section 3 — home/origin, notes, and computed leave-by intelligence never appear, full sanctuary of ADR-025's underlying intent even though the RLS mechanism itself is bypassed.
- Cache the generated feed briefly server-side (minutes, not hours) to bound load from third-party polling, without pretending that improves freshness for the subscriber — see Section 8.

---

## 8. Calendar Client Reality

None of Apple, Google, or Outlook offer anything close to real-time refresh, and none give the publisher control over the interval:

- **Apple Calendar:** polls roughly hourly by default; the *subscriber* can change this (5 minutes to "never"), but most won't, and Corralio can't force it.
- **Google Calendar:** no documented SLA; realistic range is **8–24 hours, sometimes longer**, with no manual refresh available to the subscriber and no way for Corralio to accelerate it.
- **Outlook:** roughly 4–24 hours, explicitly inconsistent per Microsoft's own support threads, also no manual refresh.

**Product consequence:** do not promise "the feed updates automatically" as if that means promptly. It means *Corralio's source of truth* updates immediately — what the parent's phone actually shows can lag by up to a day or more, entirely outside Corralio's control. This directly affects Section 6/5 of the prompt (cancellation propagation) and Section 3 (travel reminder timing): **any state change that's actually time-sensitive (a cancelled game tonight, a hotel booking that just fell through) must continue to rely on push notification and in-app surfaces, not the calendar feed.** The calendar feed is correctly framed as an ambient, eventually-consistent layer — that's fine for "is a hotel planned for six weeks from now," and not fine for anything urgent.

---

## 9. Cannibalization Measurement

The existing concern (calendar publishing reduces weekly app opens) shouldn't be waved away, but "PWA opens went down" isn't proof of churn if a parent is getting the same value ambiently. Recommend adding an **ambient-usage metric set** (Section 10) and reading it *alongside*, not instead of, the existing primary retention metric, specifically:

- Track **active subscribed households** (feed fetched by a client within the last 14 days) as a distinct cohort.
- Within that cohort, track whether **connected-schedule freshness and This-Weekend/conflict-resolution visits hold steady, decline, or stop entirely** relative to a matched non-subscribed cohort.
- The distinguishing test: a household that's still opening Corralio for conflicts/leave-by/This-Weekend at a similar rate, just less often for "what's on the schedule," is healthy ambient use. A household whose *all* engagement — including conflict resolution and travel planning — drops to zero once subscribed is real disengagement, and the calendar feed should get blamed for it.

This can't be measured with anything in the repo today (Section 0) — it requires new instrumentation, which should ship with Phase 1, not be retrofitted after the fact once the question "did this hurt retention" is already unanswerable.

---

## 10. Metrics

None of these exist today (Section 0) — this is a new-instrumentation requirement, not a "turn on existing tracking" one.

**Activation:** feed created; feed successfully fetched at least once (proxy for "subscription actually completed," since there's no true subscribe/unsubscribe signal from calendar clients); households publishing 2+ schedules into one feed.

**Retention:** active feed households (fetched in the last 14 days); observed feed freshness (time between Corralio's data change and the next client fetch — only observable from Corralio's side, see Section 8); connected-schedule count staying non-zero; This-Weekend/conflict-resolution visit rate for subscribed vs. non-subscribed households (Section 9).

**Travel:** count of travel-qualified events (Section 4's rule firing); planning reminders generated; reminder deep-link clicks back into Corralio; hotel searches initiated from that path; HotelPlanner handoffs; attributable bookings (blocked on Section 6 infrastructure); room nights; lodging revenue.

**Quality:** duplicate events in the feed; stale events (should have been removed, weren't); incorrect removals (removed, shouldn't have been); travel-reminder false-positive rate (measured via the reminder's click-through and, if available, any explicit "not needed" signal added later); booked-hotel reminder suppression failures (once Phase 3 exists); cancellation-propagation failures.

---

## 11. Roadmap / ADR Impact

Documents that need amendment if this direction is approved — nothing here is silently changed by this investigation itself:

- **`docs/corralio/CORRALIO_SECURITY_PRIVACY.md`** — needs a new subsection distinguishing durable, third-party-retained capability URLs from the existing single-use-token pattern (Section 7 gap).
- **ADR-025** ("Private planning data must be protected by RLS") — needs an explicit, scoped exception recorded for the ICS bearer-token surface, not a silent bypass.
- **ADR-022** ("Analytics must minimize private data") — the new feed-fetch/ambient-usage instrumentation (Section 9/10) needs to be checked against this before it ships, not after.
- **`docs/corralio/CORRALIO_CPO_EXECUTION_STATE.md`** — add this investigation and its recommendation once the founder responds; do not add a build item until a build is actually authorized.
- **HotelPlanner attribution design doc** — no changes needed yet; Section 6 of this document should be treated as read context for whoever eventually resumes Phase 3B, not a redesign.

---

## 12. Recommendation

- **Private household ICS feed (Phase 1, imported events only):** **TEST FIRST.** Cheap to build (portable TI code), but ship it bounded and instrumented specifically to answer the cannibalization question (Section 9) before building anything on top of it.
- **Corralio-generated planning items in feed (Phase 2):** **DEFER**, pending Phase 1 evidence that the feed is actually retained/used weeks after subscribing, not just added once.
- **Travel/lodging planning reminder (Section 3/4 of the prompt):** **DEFER**, same reasoning, plus the qualification rule (Section 4) needs real event data to check its false-positive rate before it's placed in a channel that offers no feedback signal.
- **HotelPlanner reservation-state feed updates (Phase 3):** **DEFER** — not buildable at all right now regardless of the calendar decision; gated on the separate, already-stalled HotelPlanner Phase 3B workstream (Section 6).
- **General promotional/advertising calendar events:** **KILL.** Not a close call — matches both the prompt's own instruction and the standing mandate never to turn the family schedule into an advertising surface.

**Where this belongs on the critical path:** below Phase A+B (phone auth/schedule intake, Gate 3 now cleared) and the CALNAME micro-slice, both of which are ready to execute today with no open questions. This investigation surfaced a genuinely good, cheaper-than-expected idea — but it's new surface area competing for the same engineering bandwidth as two already-queued, higher-conviction, zero-dependency items. Recommend filing a bounded Phase-1-only build prompt as the next candidate *after* Phase A+B and CALNAME are dispatched and moving, not instead of them.

---

## Sources (calendar client refresh behavior, Section 8)

- [How often Google and Apple Calendar update subscribed calendars — Calfeed](https://calfeed.ai/learn/ics-refresh-rate-apple-google)
- [How often does Google Calendar refresh ICS subscriptions? — MoonCal](https://usemooncal.com/en/guides/google-calendar-ics-refresh)
- [Refresh rate of subscribed .ics calendar on outlook.com — Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/4553843/refresh-rate-of-subscribed-ics-calendar-on-outlook)
