# CPO Strategy Review — Email-First & SMS-First Corralio Onboarding

**2026-08-30 · Chief Product Officer · Response to "CPO Strategy Review — Email-First & SMS-First Corralio Onboarding"**

Strategy review only. No code, schema, ADR, or roadmap file was changed by this document. Verified against the live repository (`apps/corralio/lib/schedules/`, existing ICS ingestion, current onboarding flow, `CORRALIO_ARCHITECTURE_DECISIONS.md`, `CORRALIO_SECURITY_PRIVACY.md`) rather than assumed.

## Bottom line, before the detail

This bundles several ideas with very different cost, risk, and evidence bars under one banner. Evaluated separately rather than as a package:

| Component | Verdict |
|---|---|
| Post-account email forwarding, ICS URL / `.ics` only (an authenticated household adds a schedule by forwarding it, instead of pasting a URL) | **TEST FIRST** — cheap, reuses existing parser, could become V1.5 |
| Pre-account "send-first" claim flow (the actual proposal: no account required to send a schedule) | **TEST FIRST — manually, before any automation** |
| AI-assisted extraction (PDF, forwarded-email prose, screenshots) | **DEFER** — unchanged from existing classification; this proposal adds no new evidence that changes it |
| SMS-first inbound ingestion | **DEFER to V2**, strictly after email-first evidence exists, and after a separate consent/compliance question is resolved |
| Outbound "subscribe to your Corralio calendar" feed (mentioned in passing under "longer-term product model") | **Worth a look post-3.6B** — low-risk, deterministic, not part of this review's core ask |

None of this displaces the currently locked 3.6B critical path (`CORRALIO_CPO_EXECUTION_STATE.md`). If pursued, it runs alongside that path as a separate, smaller-footprint experiment — it should not pull engineering attention from Phase 1/3A/3B/4/5 or the mobile-resilience/UAT gates already in flight.

## 1. Is the strategic hypothesis sound?

Yes, directionally. "Give Corralio what you already have, we'll organize it" is a legitimate, evidence-consistent refinement of the existing thesis (schedules create frequency; aggregation is the starting point, not the product). Every field in a conventional signup funnel is a place a busy parent can stop. Reducing time-to-first-value is exactly the kind of activation lever this product should chase.

But the hypothesis as framed — "send-first beats signup-first" — is a single sentence covering at least four structurally different bets:

1. A parent will forward a schedule they already have (low-friction habit change) — plausible, cheap to test.
2. Corralio can reliably turn that forwarded artifact into correct events without the parent's help (parsing accuracy) — depends entirely on the artifact type; true today only for ICS.
3. A parent will complete an account-claim step *after* already getting a taste of the value ("we found 18 events") — plausible, unproven, and structurally similar to a pattern this project already tested cautiously once (see Section 3).
4. All of this generalizes to SMS the same way it does to email — not demonstrated; SMS carries its own compliance and infrastructure lead time independent of anything proven for email.

Treating these as one bet risks committing to the most expensive, least-proven parts (SMS, AI extraction, full claim automation) on the strength of evidence that, at best, would only support the cheapest part (ICS forwarding).

## 2. What already exists vs. what's genuinely new

Verified directly against the repository:

- **Deterministic ICS/iCal parsing already exists and is centralized** (`apps/corralio/lib/schedules/ingest.ts`, `refresh.ts`, and siblings). A household can already connect a schedule by pasting an ICS URL, including a fully generic "Other calendar" tile with no vendor affiliation (Schedule Connection UX Unification, complete locally). **The parsing problem for ICS is already solved.** What email-first would add for ICS specifically is a new *transport* (email attachment/forwarded link) into that same pipeline, not new parsing logic.
- **No AI/LLM integration exists anywhere in the Corralio codebase** (confirmed by direct search). Any AI-assisted extraction (PDF, screenshot, forwarded-email prose) is a new third-party dependency from zero, not an extension of something partially built.
- **No inbound-email or inbound-SMS infrastructure exists** (confirmed by direct search — no Resend/SendGrid/Twilio/Mailgun webhook handling anywhere in `apps/corralio`). This is genuinely new infrastructure, not a config flag on something already running.
- **No pre-account/anonymous-session claim mechanism exists.** This is not a gap in this proposal specifically — it has been an explicitly *open* architecture question since this project's earliest ADRs: `CORRALIO_ARCHITECTURE_DECISIONS.md`'s "Open architecture questions" list has carried "Anonymous preview-to-household claim semantics" unresolved since before this session. This proposal is a second, independent reason to eventually resolve that question — it should be designed once, generically, not once for this feature and again later for something else.
- **CSV and PDF import are already classified** (`2026-08-27-roadmap-addendum-schedule-inputs-sms.md`): CSV is post-launch near-term (cheap schema seam, not worth pre-building); PDF is Phase 3, the only import type needing genuinely new extraction infrastructure. This proposal doesn't change that classification — it proposes a new *entry point* (email) for reaching those formats, which doesn't reduce the actual extraction engineering PDF/CSV still require.
- **The "SMS" already on the roadmap is a different capability than the "SMS" in this proposal.** The existing backlog's SMS item is an *outbound* notification channel (leave-by/travel-reminder SMS), Phase 3, gated on push+email proving the retention hypothesis first (`2026-08-27-roadmap-addendum-schedule-inputs-sms.md`). This proposal's SMS-first is an *inbound* pre-account acquisition channel. They share a word, not a scope. Do not let them merge into one roadmap line — they have different dependencies, different infrastructure, and different evidence bars.

## 3. A directly relevant precedent this project already chose caution on

The roadmap already has a live example of "let someone in before the normal signup flow": the TI Weekend Planner pilot invites an existing, authenticated TI planning user into Corralio. Even there — with a real person already known to the founder, already authenticated in the shared Supabase Auth tenant, at a scale of "a handful of people" — the explicit decision was: **"no trusted anonymous-session handoff (ADR-013), no cross-domain auth work (ADR-023), and no dedicated product slice."** It's a personal invitation plus the existing sign-up and manual reconnect flow.

This matters here because the email/SMS-first proposal asks for the harder version of that same problem — an *unauthenticated stranger* (not a known TI user) sending private, potentially child-identifying content to an inbox with no account behind it yet — and proposes building real claim infrastructure for it, at zero pilot users, before the harder problem has been tested any other way. If the founder wasn't willing to build anonymous-handoff infrastructure for the easy version of this problem, building it now for the hard version, on an unvalidated hypothesis, should clear a real evidence bar first.

## 4. Recommended test, before any automation

Test the actual hypothesis — will a parent send a schedule before signing up, and does that convert better than signup-first — with the smallest possible engineering footprint: a **manual/concierge pilot**, not a built pipeline.

- Publish one real inbound address (can be as simple as a monitored mailbox, not `schedules@inbound.corralio.com` with webhook automation yet).
- A person — founder or support — reads what arrives, manually creates the household/child/team, and manually enters or imports the schedule using tools that already exist.
- Measure the founder's own proposed funnel (received → understood → claim initiated → household created → first schedule connected → second schedule connected → This Weekend viewed → weekly return) by hand, for a small number of real or recruited parents.
- Also capture, by asking directly: would this parent have completed a conventional 5-minute signup on their own? This is the actual counterfactual the hypothesis rests on, and funnel metrics alone can't establish it without either a comparison cohort or self-report.

If this manual test shows real signal — parents who wouldn't otherwise have signed up complete the loop, and the artifacts they send are overwhelmingly ICS/plain calendar links rather than PDFs/screenshots — that is real evidence to build the deterministic, ICS-only automated version (reusing the existing parser, per Section 2) as a V1.5 or early-V2 slice. If most of what arrives is PDFs, screenshots, or forwarded prose emails, that's evidence the AI-extraction dependency is not optional the way this proposal hopes, and the decision changes materially.

This is the same discipline this project has already applied elsewhere (Slice 4.5's radius/cap values, Slice 4.6's decision not to build a persistent route cache "before you have the number to justify it") — measure cheaply before automating.

## 5. Minimum viable architecture, if/when it moves past the manual test

Kept at a product-requirements level — this is a technical decision for engineering to detail, not prescribed here beyond what materially affects UX, privacy, or strategy:

1. **Inbound alias → webhook → unclaimed ingestion record.** A dedicated Corralio-owned address (e.g., `schedules@inbound.corralio.com`, on Corralio's own domain, independent of TI — reasonable and low-risk on its own). The webhook creates an *unclaimed* record: sender email, raw attachment/link, and — for ICS/`.ics` only in this minimum version — a deterministic parse producing a candidate event count and a probable schedule/team name (e.g., from the calendar's own title). Nothing is yet linked to any household.
2. **Reply with what was found**, plus a single-use, expiring claim link — the same token discipline already established elsewhere in this codebase (HotelPlanner's opaque attribution token, the household-origin claim RPC's cap/skip pattern).
3. **Claiming requires real authentication, not just link possession.** This is the one point worth stating explicitly because it's easy to get wrong: an email is spoofable, and "whoever clicks the link owns the household" is not an authorization model. The claim link should require the person to sign in to an existing Corralio account or create a new one — ideally pre-filled with the sending address as a *convenience*, never treated as *proof*. This directly extends the principle this session already wrote into `CORRALIO_SECURITY_PRIVACY.md` for SMS ("a phone number is an input identity, not automatically sufficient authorization") to email — the same sentence applies to both.
4. **After authentication, the existing "confirm child/team" UI handles the rest** — do not build a second onboarding implementation. The claimed schedule should enter the exact same normalization, RLS, and venue-matching pipeline as any other connected source (per the founder's own "common ingestion service" instruction) — it is a new front door, not a new house.
5. **Unclaimed data needs its own retention rule**, which `CORRALIO_SECURITY_PRIVACY.md` does not yet have (it now has Email/SMS *notification* retention, added this session, but not *inbound unclaimed ingestion* retention — a different data class). Recommend: unclaimed raw content (attachment, parsed candidate events, sender address) purges automatically on a short bounded window — on the order of 7–14 days — if never claimed. This should be written into that document as its own class before this is built, not left to be inferred.

## 6. Answers to the ten CPO questions

1. **Should email-first ingestion become a V1 activation path?** No, not the full pre-account claim version. Test it manually first (Section 4). The cheap, post-account, ICS-only subset could reasonably be a V1.5 add-on once 3.6B's critical path clears engineering bandwidth — it needs no new claim infrastructure at all.
2. **Should ICS ingestion be abstracted into one shared service across URL/email/SMS/PWA?** Yes in principle — and mostly already true. The real gap is entry-point adapters, not a parsing rewrite. Don't refactor pre-emptively before a second real entry point exists to justify it; when one is built, route it through the existing pipeline (`ADR-004` — reuse schedule primitives incrementally) rather than writing a parallel parser.
3. **Minimum viable unclaimed → claim → household flow?** Section 5.
4. **Which email inputs for V1 (if built at all)?** ICS URL and `.ics` attachment only. PDF, CSV, forwarded-email-body extraction, and screenshots stay exactly where they already sit in the roadmap — this proposal adds a new transport for reaching them, not new evidence that accelerates the extraction engineering they still require.
5. **SMS-first timing?** V2 at the earliest, strictly after real email-first evidence exists, and only after resolving a real compliance question this proposal doesn't address: SMS opt-in consent normally presumes an existing relationship, and "text us before you have an account" is close to the pattern SMS compliance regimes exist to prevent. That needs an actual answer, not an assumption, before any inbound SMS is built — this is exactly the kind of question this document's own instruction ("do not infer legal guarantees") flags for real review.
6. **What account/auth changes are required?** A generic claim-authentication primitive resolving the long-open "anonymous preview-to-household claim semantics" question — designed once, not once per feature (Section 2).
7. **Retention/deletion rules for unclaimed schedules?** New data class needed in `CORRALIO_SECURITY_PRIVACY.md`: short bounded window (~7–14 days) for unclaimed content, purged automatically if never claimed (Section 5).
8. **Where does AI enter without making V1 dependent on it?** Nowhere in V1 or V1.5. Deterministic-only is the entire near-term surface. AI-assisted extraction stays V2+/evidence-gated, and needs its own addition to `CORRALIO_SECURITY_PRIVACY.md` (a new third-party AI-processor category — sending a child's name and schedule to an external AI provider is a materially new privacy surface this document doesn't cover yet) before even a TEST FIRST prompt is written for it.
9. **How should this change onboarding UX?** Converge both entry paths at the identical existing "confirm child/team" screen. Do not fork onboarding into two implementations for two entry points.
10. **What existing roadmap work should this replace?** Honestly: not much yet, and manufacturing a bigger answer here would be dishonest given current evidence. The best real candidate is narrow — if the cheap post-account forwarding path ships, it could reduce a returning parent's need to navigate to the connect-schedule picker for a second/third child's schedule. That's a simplification of an existing flow, not a removal of it (a parent who doesn't think to forward email still needs the picker). This proposal does not yet displace the core signed-up-first activation path, and shouldn't be sold internally as if it does until the manual test says otherwise.

## 7. Guardrails — confirmed consistent, nothing new required for these specifically

The listed guardrails (household-scoped RLS, children/schedules/locations as sensitive, no raw private data in analytics, private locations never becoming TI venue evidence, TI/Corralio public/private boundary) are already accepted decisions — ADR-002, ADR-010, ADR-021, ADR-022, ADR-025, and `CORRALIO_SECURITY_PRIVACY.md`'s existing data-classification table all already say this. Nothing about email/SMS-first changes them; it just means whoever eventually builds the claim flow and any AI extraction must extend the existing patterns (Section 5's point 3, Section 6's answer to Q8) rather than inventing parallel ones.

## 8. Relationship to the current critical path

This does not belong inside 3.6B, and should not be sequenced ahead of it. ADR-033 already redefined Corralio's launch gate as a deliberately narrow experience test, explicitly chosen by the founder over shipping faster — expanding acquisition-funnel scope into that same window cuts against the "deliberately narrow" decision that's barely a day old. If the manual test in Section 4 is worth running, it can run in parallel, off to the side, using founder/support time rather than engineering time — it doesn't need Codex, a prompt, or any of the currently-queued 3.6B/Mobile Resilience work to pause.

## 9. One idea worth separating out and revisiting later

The "published Corralio calendar" mentioned under "longer-term product model" — a household subscribing to a Corralio-generated outbound ICS feed — is structurally simpler and lower-risk than everything else in this review: it's outbound, deterministic, requires no new claim/auth primitive, and reuses calendar-serialization capability this project already has (per ADR-004's list of proven primitives). It wasn't one of the ten questions asked, so this review doesn't score it, but it's worth a real look on its own once bandwidth exists — likely a much shorter path to real value than anything else in this document.
