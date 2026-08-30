# CPO Review — HeySammi Competitive Signal & Email/SMS Channel Direction

**2026-08-30 · Chief Product Officer**

Investigation only. No code changed, no canonical document amended, no vendor selected, no critical-path reordering applied. Section 12 lists what would need to change if this review's recommendations are accepted.

**Evidence discipline for this document:** HeySammi is a **pre-launch, waitlist-stage product** ("launching Winter 2026"). Everything below about it comes from its own marketing site (`heysammi.com`, `heysammi.com/coaches`) — there is no independent press coverage, no app-store listing, no third-party review, and no evidence it has real users yet. Treat every HeySammi capability below as **a stated claim, not a demonstrated one** — the inverse of Corralio, where I can cite actual shipped code. I've marked HeySammi's own unverified statistics separately. Corralio facts below are cited to file:line from the live repository.

---

## Bottom line

HeySammi is real evidence that the market wants what the founder has been describing: lower-friction ingestion and an SMS-native daily brief. It is not evidence that Corralio is behind. Its ingestion model — "share your calendar feed link" — is the same shape as Corralio's already-shipped multi-provider ICS connection flow, and its most-touted planning outputs (leave-by, conflict flagging) are things Corralio's `leaveBy.ts` and `weekendPlan.ts` already compute today, in code, while HeySammi's equivalents are demo copy on a waitlist page. Where HeySammi is genuinely ahead is packaging and distribution: text-native setup, an SMS daily brief, and — its most aggressive move — a coach-mediated path that texts families cold with no app and no account. That last piece is also the part most in tension with consent law and with Corralio's own "identity possession isn't authorization" principle, and it drags team-administration features (rosters, payments, RSVP-chasing) into the same product, which is exactly the "team app" territory Corralio's positioning is built to sit outside of.

The one piece of this review that changes near-term sequencing: the founder's "required arrival" differentiator and the daily/event-day brief are not new work items competing with 3.6B Phase 1 — they are **downstream of it**. Phase 1 is the required-arrival accuracy audit. A brief built before Phase 1 ships would be visibly wrong in exactly the dimension the founder considers the differentiator. This strengthens the case for keeping Phase 1 first, not for jumping ahead of it.

---

## 1. Competitive assessment

| Dimension | HeySammi (claimed, pre-launch) | Corralio today (shipped) | Verdict |
|---|---|---|---|
| Core value prop | "Give your brain the season off" — consolidate multi-team scheduling, SMS-native, no app | Plan across the family's full sports schedule, not just one team | Similar problem, different unit of value (see Section 2) |
| Onboarding | Share calendar-feed links (TeamSnap, GameChanger, SportsEngine, LeagueApps, Sports Connect, Playmetrics) + short SMS Q&A (~2 min claimed); or coach submits roster and Sammi cold-texts families | Web form, seven-provider catalog including a generic "other calendar" ICS URL tile (Schedule Connection UX Unification, shipped) | **Similar mechanics**, different surface (SMS vs. web) |
| Ingestion model | Deterministic calendar-feed reads — not AI/PDF/screenshot extraction | Deterministic ICS pipeline (`ingest.ts`, `refresh.ts`) — same category | **Parity.** HeySammi validates deterministic-only ingestion is the right scope; it is not evidence to leapfrog into AI extraction. |
| SMS interaction | Daily morning brief (schedule, weather, drive time, packing list); real-time change alerts; claimed two-way for coaches | No SMS anywhere — zero code, zero vendor dependency (confirmed via repo grep) | HeySammi **stronger on paper**, unverified in practice |
| Calendar output | Syncs to Google/Outlook/iCal automatically (claimed) | No household-facing ICS generation exists in `apps/corralio` (confirmed via grep — zero hits for ICS-serialization code; the only ICS *generation* in the repo is in the unrelated `ti-web` Planner feature) | HeySammi **stronger on paper**; Corralio has zero output capability today, only a reuse policy (ADR-004) |
| Daily brief content | Weather + schedule + drive time + leave-by + packing list, one SMS | `estimatedLeaveByIso()` and `deriveConflictPairs()` are real, shipped functions powering "This Weekend" today (`apps/corralio/lib/leaveBy.ts:281-297`, `apps/corralio/lib/weekendPlan.ts:95-135`) | **Corralio is closer than it looks** — the compute engine exists; only the brief-formatted output and delivery channel don't |
| Schedule-change detection | "Real-time," instant calendar update (claimed) | Cron every 4 hours (`vercel.json:4`, `17 */4 * * *`), 3-hour source-eligibility window, manual refresh with 5-minute cooldown | **HeySammi's claim is untested; Corralio's latency is real and currently truthful-language-incompatible with "real-time"** (Section 7) |
| Drive-time / leave-by | "Leave by 9:15," traffic-checked (claimed) | Static/estimated leave-by is shipped; traffic-aware checkpoint model is designed but explicitly not built | Similar destination, Corralio's version is real code today, HeySammi's traffic-awareness claim is unverified |
| Conflict handling | Same-time-different-location flag with carpool-coordination prompt (claimed) | `deriveConflictPairs()` — real, shipped, time-overlap detection classified `same-child` / `schedule` (`weekendPlan.ts:95-135`) | Corralio **has shipped code**; HeySammi has a screenshot |
| Pricing | Founding $4/mo, standard $9.99/mo (waitlist-stage, unlaunched) | No entitlement/billing infrastructure exists anywhere in `apps/corralio`; Pro is a named hypothesis, not built | Neither is monetizing yet; HeySammi has published a number, Corralio hasn't |
| Coach/team management | A full separate product track: roster, RSVP, fee-chasing, parent messaging, all by text | None, deliberately — outside Corralio's scope | **Strategically different**, not a gap (Section 2) |

**Where HeySammi is genuinely stronger:** the *packaging* of ingestion and output as texting, not a web form or PWA; the demonstrated (in mockup) daily-brief format; a coach-mediated distribution motion that could onboard whole rosters without any parent effort.

**Where Corralio is stronger, on the evidence:** the actual planning computation — leave-by, conflict detection across children — is real, tested-in-repo code today, not launch-copy. Corralio also already solves multi-provider deterministic ingestion for more source types than HeySammi's marketing enumerates.

**Where they're structurally different, not comparable:** HeySammi bundles team-administration (rosters, payments, RSVP chasing) into the same product as family scheduling, and its most distinctive growth motion depends on coach adoption. Corralio's model works per-family regardless of whether any coach has heard of it. Both products still require *someone* to supply a per-team schedule source one way or another — neither has actually eliminated that step. The real differentiator is the household-level, cross-child, cross-team planning layer on top, not ingestion novelty.

---

## 2. Corralio response

**Copy at the problem/interaction level:**
- Treat "share a link, get a brief back" as validated demand shape for the deterministic-ingestion bet already under investigation (Phase A/B in the 2026-08-30 priority-channels doc).
- The daily/event-day brief format (event → required arrival → drive → leave-by → conflicts → changes) is worth building — it's a good compression of what Corralio already computes.
- Treat "we don't need you to open the app" as a real distribution lever worth investigating for specific moments (a morning brief), not as a mandate to abandon the PWA.

**Deliberately do not copy:**
- **Coach-mediated cold SMS to family phone numbers with no prior consent.** This is the exact "possession of a phone number isn't authorization" risk `CORRALIO_SECURITY_PRIVACY.md` already warns against, and it's a live TCPA/10DLC consent liability regardless of Corralio's own policies — a family member's number reaching Sammi via a coach's roster upload is not the same as that person opting in.
- **Bundling roster management, payment collection, and RSVP-chasing into the product.** This is the "team app" side of the governing distinction ("Team apps organize the team. Corralio plans across the family."). Nothing in this investigation changes that boundary.
- **"Real-time" schedule-change language** until Corralio's actual latency supports it (Section 7).
- **Two-way conversational SMS** ("text commands," natural-language coach interaction) — this is a categorically larger, unscoped capability; treat as far-future and evidence-gated, consistent with the prior ambient-strategy review's pushback on "eventually interactive SMS assistance."

**Where Corralio can be materially better, not just parallel:** lean into what HeySammi's marketing doesn't actually claim — planning *across* children on different teams and different platforms, with conflict detection and leave-by math that already exists in code. HeySammi's SMS brief is per-family but its ingestion and growth motion is fundamentally per-team (one coach, one roster). Corralio's differentiation is the household layer sitting above every team's schedule source, independent of any single team's tooling choice. That's a defensible position HeySammi's current public product doesn't contest, and it's worth stating in outward product language once the brief and channels exist — not before.

---

## 3. Channel architecture

This confirms and refines the architecture recommended in the 2026-08-30 priority-channels investigation; nothing here reverses it.

```
INPUT                          UNDERSTAND (existing, shipped)         OUTPUT
Email: .ics attachment/URL  →  Normalize (ingest.ts)                  This Weekend (existing)
SMS: calendar/schedule URL  →  Resolve required arrival (3.6B Ph.1)   Daily/event-day brief (new — Section 5)
Existing ICS connection     →  estimatedLeaveByIso() (shipped)        Household iCal feed (new — Section 6)
                                deriveConflictPairs() (shipped)        Email / SMS / Push (channel-dependent)
                                                                        TIME-SENSITIVE (deferred — Section 7/10)
```

The one shared prerequisite from the prior investigation still holds: a verified channel identity (email alias or confirmed phone number attached to an already-authenticated household) serves ingestion, activation-adjacent convenience, and notification delivery at once, without a new claim/auth primitive. Both inbound webhooks (email, SMS) should normalize into one internal message shape before reaching the existing ingestion pipeline — this is the actual architectural requirement, independent of which vendor is chosen (Section 8).

---

## 4. Minimum ingestion scope

Unchanged from the prior investigation, now with added confidence: HeySammi's own ingestion model (share a calendar-feed link) is the same shape as what's already scoped —

- **Email:** ICS/calendar URLs pasted in the body, and `.ics` file attachments.
- **SMS:** a supported calendar/schedule URL sent as a text.

Both route into the existing `ingest.ts`/`refresh.ts` pipeline unchanged. No new parsing capability is required — this is a new *front door* onto capability that already exists, which is a materially smaller lift than "build ingestion." CSV, PDF, screenshots, forwarded-email prose, and AI extraction remain deferred; nothing in HeySammi's public product argues otherwise — its own ingestion is link-based, not document-based.

---

## 5. Daily/event-day brief

**Recommendation: the content model is a small, valuable build — but it is gated on 3.6B Phase 1, not on email/SMS channels.**

The founder's instinct that required arrival is a differentiator is already the reason Phase 1 (required-arrival accuracy + Arbiter group-identity audit) sits at the top of the locked critical path. `estimatedLeaveByIso()` (`leaveBy.ts:281-297`) and the conflict detector (`weekendPlan.ts:95-135`) already produce the numbers the example brief needs — drive duration and leave-by are real today. What isn't solid yet is the accuracy of the *arrival* input feeding that math (a team-level `arrival_buffer_minutes` field exists but, per current project notes, "can't even be set for an unassigned household source" — exactly what Phase 1 is scoped to fix). Publishing a brief with a wrong "Arrive 9:15" line would directly undercut the differentiator it's meant to demonstrate.

Minimum useful content, once Phase 1 lands: event name/child/sport, start time, required arrival, standard (non-traffic) drive duration, estimated leave-by, basic conflicts, and any schedule change since the last brief. No live traffic required for v1, matching the founder's own framing.

**Sequencing:** treat the brief's *content model* as a small design/build item to sequence immediately after Phase 1 — it does not need to wait for email or SMS to exist. The first delivery surface can be push (richer than today's generic "your weekend is ready") or an in-app "Today" view; email/SMS become additional distribution once Phase A/B channel work lands. Building the brief before Phase 1 finishes would mean testing the wrong thing.

---

## 6. Calendar output

**Recommendation: real near-term candidate, but it's a build item, not a free reuse.**

ADR-004's "calendar serialization" line is a policy to reuse primitives *if/when needed* — it is not evidence Corralio has this today. A grep for ICS-generation code in `apps/corralio` (`BEGIN:VCALENDAR`, `ical-generator`, `toICS`, `generateIcs`) returns zero hits. The only ICS *output* in the repository lives in the separate `ti-web` Planner feature (`apps/ti-web/lib/planner/calendarFeeds.ts`), a different product. That implementation is still useful — it's a proof that the serialization approach works and can likely be adapted rather than invented from scratch — but "reuse ADR-004" should not be read as "this is nearly free."

The strategic case remains strong: it needs no new claim/auth architecture (the household already exists and is authenticated), it's outbound-only (sidesteps every inbound-privacy question this review and the prior ones raise), and it directly answers "can Corralio push the plan into the calendar parents already use while staying the place where the intelligence lives" — yes, as long as the subscribed feed stays a thin, current view of Corralio's own understanding (leave-by, conflicts) rather than parents' only interface to it. Treat it as a scoped, small build to schedule once 3.6B critical-path bandwidth allows, per the prior ambient-strategy response.

---

## 7. Freshness model

**The gap between what HeySammi claims and what Corralio can currently promise is real, and it's a truthful-language problem independent of any channel decision.**

Confirmed from the live repository:
- Automatic refresh: Vercel cron, every 4 hours (`vercel.json:4`, `"17 */4 * * *"`).
- A source is only eligible for that automatic refresh once 3+ hours have passed since its last attempt (`CORRALIO_REFRESH_FRESHNESS_HOURS = 3`, `refresh.ts:10`).
- A manual "Refresh now" path exists and bypasses the batch queue, but is throttled to once per 5 minutes per source (`CORRALIO_MANUAL_REFRESH_COOLDOWN_MINUTES = 5`, `refresh.ts:14`).
- No webhook or push-based ingestion exists for any schedule source today — everything is poll-based, because the source platforms (TeamSnap, Arbiter, generic ICS, etc.) generally don't offer one.

So the honest latency chain is **source changed → up to ~4 hours until Corralio's next automatic check (sooner if the parent manually refreshes, capped at once per 5 minutes) → parent informed at whatever cadence the notification channel delivers.** HeySammi's "real-time" framing is an unverified claim on a product that hasn't launched; Corralio should not match that language with a system that is, today, hours-latent by design.

**Recommendations:**
- Do not use "real-time" or "instant" in any customer-facing copy about schedule-change detection.
- Instrument the actual chain (source-changed timestamp, when Corralio's poll observed it, when the parent was notified) so the gap is measured, not assumed — this doesn't exist today and should be a cheap, near-term addition regardless of the email/SMS decision.
- Separately evaluate tightening the poll cadence (e.g., hourly instead of every 4 hours) as a low-cost, non-channel-dependent improvement — worth a quick cost/value look on its own, since it narrows the truthful-language gap without requiring any new channel work.

---

## 8. Vendor requirements

No vendor is recommended here — this is a requirements pass and a shortlist for a bounded spike, per the founder's explicit instruction not to assume Twilio.

**Requirements checklist (both channels):** inbound receiving via webhook; outbound transactional send; sender/account association scoped per environment; deliverability reputation management; consent and abuse controls (STOP/HELP for SMS, list-hygiene/complaint handling for email); phone-number or domain provisioning; observability (delivery/failure events); a cost structure that's legible at pilot scale (10–15 families) and doesn't require large minimum commitments.

**SMS shortlist, requirements-only (no selection):**

| Candidate | Notable, from secondary sources — needs independent verification | Caveat |
|---|---|---|
| Twilio | Mature inbound webhooks; Trust Hub for A2P 10DLC; ~$4.50 one-time brand fee + $15/mo campaign fee; vendor-reported 10–15 business day campaign review (up to 4 weeks); 99.95% SLA | Highest-touch, most mature ecosystem; also the most expensive per-message in the sources checked |
| Telnyx | Passes TCR/carrier fees at cost, no markup; own network infrastructure (vendor claims 99.999% SLA); lower per-message pricing in sources checked | Less mainstream/mature tooling than Twilio; 10DLC timeline not independently confirmed |
| Plivo | Similar at-cost fee pass-through; lower per-message and per-number pricing in sources checked | Same caveat — timeline and support-quality claims are vendor/blog-sourced, not independently verified |

All three figures above come from third-party comparison sites, not vendor documentation or a live technical spike — treat them as directional, not decision-grade.

**Email shortlist, requirements-only (no selection):**

| Candidate | Notable, from secondary sources — needs independent verification | Caveat |
|---|---|---|
| Resend | Self-serve inbound webhook (confirmed in the prior investigation directly from Resend's own docs); "instant" production approval reported | Relatively new inbound-email feature (public since late 2025) — still warrants a bounded spike before commitment |
| Postmark | Transactional-only positioning reported to keep shared-IP reputation clean; instant production access reported | Inbound-receiving support for this comparison wasn't confirmed in sources checked — needs direct verification |
| Amazon SES | Cheapest at volume; requires an approval step reported as slow without existing AWS billing history | Self-managed reputation (IP warmup, suppression lists) is real operational overhead for a small team |

**One provider or two:** the prior investigation's core architectural point stands regardless of which vendors are chosen — build one internal adapter (`InboundChannelMessage`-shaped) that both email and SMS webhooks normalize into before reaching the shared ingestion pipeline. That is what actually prevents channel-specific rework later, not picking a single company for both channels. Given SMS and email have different core competencies (10DLC/consent tooling vs. deliverability/DNS), separate best-of-breed providers are more likely than a single vendor to be the right call — but that should be confirmed by the spike, not assumed here.

---

## 9. Privacy/security implications

This extends `CORRALIO_SECURITY_PRIVACY.md` (filed 2026-08-30) rather than replacing any of it.

- **Children's schedules and event locations in message content.** A daily brief delivered by SMS or email will, by nature, put a child's name, sport, and event time in a channel that's less access-controlled than the household-scoped PWA (a shared family phone, a lock-screen preview, a forwarded email). Apply the same field-minimization discipline already written for public shares: no raw home/pickup address, and consider whether full child names are necessary in every message or whether a first name/initial plus team is sufficient outside the authenticated app.
- **Sender identity and account association are not proof of authorization.** This review's clearest cautionary example is HeySammi's own coach-to-family cold-text flow: a phone number appearing on a roster is not the same as that person consenting to receive messages. This is the same principle already written into `CORRALIO_SECURITY_PRIVACY.md`'s SMS section and should govern any future channel-identity design — verification (send-code/confirm, or an authenticated-household-owned email alias) stays mandatory, never link/number possession alone.
- **The household iCal subscribe link (Section 6) is a public-sharing case**, not a new category — it should follow the existing "Public sharing" principles already in the security doc: opaque, revocable, per-household token; never expose home/origin; minimize fields; understandable audience/duration to the user. Once subscribed in a third-party calendar app, that content lives outside Corralio's own access control, so the token and its contents deserve explicit design attention before shipping, not default replication of internal event data.
- **Message-content retention** for any daily-brief email/SMS should fall under the bounded (~30-day default) retention policy already written for notification content, not be retained indefinitely as a support/debugging convenience.
- **Anonymous/pre-account ingestion remains out of scope for the minimum version in Section 4** — the repository's own "Anonymous preview-to-household claim semantics" open question (`CORRALIO_ARCHITECTURE_DECISIONS.md`, open architecture questions list) is unresolved, and nothing in this review requires resolving it, since Phase A/B in the prior investigation depend only on lightweight verified-channel association to an already-authenticated household.

---

## 10. Roadmap recommendation

| Item | Recommendation | Why |
|---|---|---|
| 3.6B Phase 1 (required-arrival accuracy) | **DO NOW — unchanged, critical path** | Now doubly justified: it's the prerequisite for both the Mapbox traffic-check model *and* a trustworthy daily brief |
| Freshness-cadence tightening + latency instrumentation | **DO NOW, small, non-blocking** | Cheap, closes a real truthful-language gap, doesn't require any channel or vendor decision |
| Daily/event-day brief content model | **TEST NEXT — sequence immediately after Phase 1** | Reuses shipped `leaveBy.ts`/`weekendPlan.ts`; do not build before Phase 1 lands, or the flagship number is wrong |
| Email/SMS channel Phase A (verified identity) + Phase B (email-leg ingestion) | **Parallel investigation-to-build track**, per the 2026-08-30 priority-channels doc — unchanged recommendation | Doesn't touch the ICS pipeline; slot after Phase 1 stands as previously recommended, still pending founder confirmation |
| Household iCal output (Section 6) | **TEST NEXT / small parallel build** once critical-path bandwidth allows | No new claim architecture; outbound-only; real but modest build cost (not free reuse) |
| SMS-leg ingestion, SMS daily-brief delivery | **DEFER** until Phase A exists and A2P/consent model is resolved | Gated on external 10DLC timeline regardless of internal priority |
| Live-traffic checkpoint leave-by | **DEFER — unchanged** | Already gated on Phase 1 shipping first per existing design doc |
| Coach/roster/RSVP/payment features | **REJECT** | Outside Corralio's governing distinction; HeySammi's presence there is not evidence Corralio should follow |
| Two-way conversational SMS | **DEFER — unchanged from prior review** | Categorically larger, unscoped capability |
| True send-before-account (Phase D) | **DEFER — unchanged** | No new evidence from HeySammi's own (unlaunched, unverified) product changes this |

**Critical path:** not reordered. This review's only sequencing addition is placing the daily-brief content model directly after Phase 1, which is consistent with — not a departure from — the existing locked order.

---

## 11. Metrics

The funnel the founder specified is the right one and should extend, not duplicate, the measurement gaps already flagged in `CORRALIO_CPO_EXECUTION_STATE.md`:

`schedule connect attempted → source recognized → successfully imported → second schedule connected → populated "This Weekend" viewed → brief delivered → brief engagement/re-entry → next-week return`

None of this funnel is instrumented today, based on the evidence gathered in this and prior reviews — this is a real, named gap, not an assumption to build around silently. Recommend defining discrete events for each funnel step now (even before the channels that generate some of them exist), so that whichever ingestion/channel work ships first arrives with the instrumentation already in place rather than bolted on afterward. "Brief delivered" and "brief engagement" specifically require a delivery-channel decision before they can be defined precisely (open/click for email, reply/link-tap for SMS, view for push) — those two can be scoped once Section 3's channel architecture is confirmed.

---

## 12. Repository/documentation impact

If any part of this review is accepted, these documents would need amendment (none touched in this pass):

- `CORRALIO_CPO_EXECUTION_STATE.md` — add a "NEXT 5 ACTIONS" line for the daily-brief content model once Phase 1 ships; note the freshness-cadence item as a small independent candidate.
- `CORRALIO_PRODUCT_ROADMAP.md` — place the daily/event-day brief and household iCal output explicitly, if accepted, rather than leaving them implicit in this review.
- `CORRALIO_SECURITY_PRIVACY.md` — extend the Email/SMS sections with the daily-brief content-minimization note and the iCal-subscribe-token design requirement (Section 9 above); both are additions, not corrections.
- `CORRALIO_ARCHITECTURE_DECISIONS.md` — ADR-004's "calendar serialization" language could be tightened to make explicit that no Corralio-side generation exists yet, avoiding a future reader assuming otherwise.
- `2026-08-30-cpo-investigation-email-sms-priority-channels.md` — this review doesn't change its Phase A–D recommendation; a cross-reference from that document to this one (and vice versa) would keep the decision trail coherent.

---

## Sources

- [Sammi — Every family's team parent](https://heysammi.com/)
- [Sammi for Coaches, Team management, by text.](https://heysammi.com/coaches)
- Twilio, Telnyx, Plivo A2P 10DLC/pricing comparison: [APIScout — Twilio vs Plivo vs Telnyx](https://apiscout.dev/guides/twilio-vs-plivo-vs-telnyx-sms-voice-api-2026)
- Resend, SES, Postmark comparison: [BuildMVPFast — Resend vs SES vs Postmark](https://www.buildmvpfast.com/blog/resend-vs-ses-vs-postmark-transactional-email-deliverability-saas-2026)
- Corralio repository (live, this session): `apps/corralio/lib/leaveBy.ts`, `apps/corralio/lib/weekendPlan.ts`, `apps/corralio/lib/schedules/refresh.ts`, `apps/corralio/vercel.json`, `docs/corralio/CORRALIO_ARCHITECTURE_DECISIONS.md`, `apps/ti-web/lib/planner/calendarFeeds.ts`
