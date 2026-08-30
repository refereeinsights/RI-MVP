# CPO Investigation — Email & SMS as Priority Channels (Ingestion, Activation, Notifications)

**2026-08-30 · Chief Product Officer · Response to "Reclassify email and SMS as priority Corralio channels"**

Investigation only, per explicit instruction. No code, schema, vendor account, or ADR/roadmap sequencing was changed. Verified against the repository (existing ICS pipeline, HotelPlanner attribution's token pattern, `CORRALIO_SECURITY_PRIVACY.md`) and against current vendor documentation, fetched live rather than assumed (see Sources).

## Headline recommendation

The reclassification is sound, and it's more buildable than the last two rounds of this discussion assumed — because the founder's own constraint ("the first implementation may require lightweight account/channel association") removes the single most expensive part of the earlier proposal. **You do not need to build the anonymous-session-plus-claim primitive to get real value from email and SMS.** A per-household verified channel identity (a personal inbound email alias; a verified phone number) does all three jobs — ingestion, activation-adjacent convenience, and notifications — using only patterns this codebase already has proven. True send-before-account (a stranger, no account, texting or emailing cold) stays a real, safely-reachable future step, gated on evidence from the cheap version, not built now.

## 1. What "priority channel" means across the three jobs, and why one mechanism serves all three

The three jobs the founder named aren't three separate features — they share one prerequisite: **Corralio needs to know which household a given email address or phone number belongs to.** Once that association exists, it answers all three jobs at once:

- **Schedule ingestion** — an inbound message from a known address/number is trusted input for that household, routed into the existing ICS pipeline.
- **Activation/account entry** — for an *existing* household, this is a second, lower-friction way to add a second or third schedule without navigating to the connect-schedule picker. (True pre-account activation is Section 5, below — a later phase, not this one.)
- **Planning notifications** — the same verified address/number is the delivery target for Weekend Ready, the proposed daily snapshot, and any future schedule-change or traffic alert.

This is the answer to "smallest architecture that supports all three jobs": **one small piece of new schema (a household-owned, verified channel-identity record) and one thin per-channel adapter, not three features.**

## 2. Recommended phased sequence

**Phase A — Channel identity + notifications (foundation, no ingestion yet).** Add verified email/phone as household-owned data: an email address (already collected at signup, in most cases — confirm and reuse rather than re-collect) and an optional verified phone number (standard send-code/confirm flow). This alone unlocks nothing new for ingestion, but it's the prerequisite for both remaining phases and for the already-discussed daily snapshot notification. Reuses existing household/RLS patterns entirely; no new claim or auth primitive.

**Phase B — Deterministic ingestion via known channels.** A household gets a personal inbound email alias (Section 3) for ICS/`.ics` forwarding, and can text a supported schedule/calendar URL from their verified number. Both route into the existing `apps/corralio/lib/schedules/ingest.ts` pipeline through a thin adapter — no new parser. This is the "lightweight account/channel association" version the founder specified as acceptable for the first implementation.

**Phase C — Notification delivery over email/SMS.** The daily snapshot (static leave-by, per the founder's 2026-08-30 pricing decision) and Weekend Ready's equivalent ship to the verified channel identity from Phase A. This can build alongside or after Phase B — it doesn't depend on ingestion working, only on Phase A's channel-identity record existing.

**Phase D — True send-before-account (future, evidence-gated).** Once Phase B shows real usage (parents actually forwarding schedules, low correction rates), build the harder anonymous-ingestion-then-claim primitive for a *stranger* with no account yet (Section 5). Do not start this without Phase B's evidence — this is exactly the sequencing this project already applied to Slice 4.5/4.6's cost/cadence decisions.

**Where this sits relative to the locked 3.6B critical path:** this is a different subsystem from 3.6B's routing/traffic/HotelPlanner loop — it touches household settings, schedule ingestion, and notification delivery, not leave-by, routing origins, or Mapbox. It has no hard technical dependency on any 3.6B phase. Given the reclassification to "priority" and that this is activation/utility work (protecting the Utility → Habit → Intent → Monetization sequence, ahead of the more monetization-adjacent Phase 3B/4/5), **my recommendation is to slot Phases A–C after 3.6B Phase 1 (required arrival) ships, running instead of or alongside Phase 2 (Arbiter audit, already parallel/non-blocking), and ahead of Phase 3B/4/5.** I'm stating this as a recommendation, not re-ordering the locked sequence myself — `CORRALIO_CPO_EXECUTION_STATE.md`'s critical path stays as committed until you confirm this slot.

## 3. Vendor requirements — email and SMS evaluated together

The instruction to evaluate them together is correct, and the important finding isn't which company to pick — it's that **neither vendor's webhook shape should reach the ingestion pipeline directly.** Build one internal adapter boundary (an `InboundChannelMessage` shape: household reference, channel, sender identity, raw content/attachment reference, received-at) that both an email webhook handler and an SMS webhook handler normalize into, before handing off to the same `ingest.ts` pipeline used today. This is what actually prevents "channel-specific architecture that must later be replaced" — not vendor consolidation. Vendor choice still matters for cost, reliability, and compliance lead time, evaluated below.

**Email — Resend.** Verified directly against Resend's current documentation: Resend added a real, self-serve **Inbound** feature (email receiving via webhook) — confirmed live, not a rumor or a roadmap item. It supports a zero-DNS-setup option (a Resend-managed `<id>.resend.app` address, useful for a fast, real technical spike before committing to a custom domain) or a production custom domain via one MX record. Resend parses the message and attachments and POSTs to a webhook you choose; attachments are delivered as metadata plus temporary download URLs. This already fits the deterministic ICS/`.ics` use case directly. Resend was also the provider this session's security-policy work already pointed to for *outbound* transactional email — using it for both directions avoids running two email vendors. **Caveat, stated plainly:** this Inbound feature is new (public since roughly late 2025), so it hasn't had years of production hardening the way SendGrid's older Inbound Parse has. Recommend a bounded technical spike (send a handful of real ICS emails to a `.resend.app` test address, confirm attachment delivery and payload shape) before committing, not a decision from documentation alone.

**SMS — Twilio.** The practical default: mature inbound-SMS webhooks (this has been core Twilio functionality for well over a decade, not something recently added), and it's also the vendor most schedule-source ecosystems and small businesses already default to, which matters for A2P 10DLC campaign registration — carriers require every US business sender to register a brand and messaging campaign before two-way SMS at any real volume, and Twilio's tooling for that registration is the most established. Verified: 10DLC brand-plus-campaign approval typically runs 2–7 business days once submitted; this has real lead time and should start as soon as the phone-verification/SMS-ingestion work is actually scheduled, not on the day it's needed. A toll-free number is a faster-to-provision alternative with its own separate verification process — worth comparing timelines directly with Twilio at spike time rather than assuming one is definitively faster, since the specific current numbers weren't independently confirmable from public documentation alone.

**Single-vendor alternative, named for completeness:** Twilio owns SendGrid, so a single-vendor path (Twilio for SMS, SendGrid for email) is real and would simplify billing/vendor management to one relationship. The tradeoff is SendGrid's inbound-email developer experience is generally regarded as older and less modern than Resend's — this is a real judgment call between vendor-count simplicity and per-channel DX, not a clear-cut answer, and worth deciding at spike time with both actually tried rather than from documentation alone.

**Recommendation:** evaluate Resend (email) + Twilio (SMS) as the leading combination via a short, bounded technical spike — not a build — before any commitment; keep SendGrid+Twilio as the named single-vendor fallback if the spike surfaces a real problem with Resend's newer Inbound feature.

## 4. Privacy/security implications

Extends, rather than replaces, what `CORRALIO_SECURITY_PRIVACY.md` already establishes:

- The verified channel-identity record (email/phone) is household-owned PII under the existing "Contact identifiers and notification content" classification added this session — same RLS discipline as any other household field.
- **A household's personal inbound alias is a credential-like value**, structurally identical to the HotelPlanner attribution token already in production use (`attr:{32-hex-id}` in Custom3) and the household-origin claim RPC's token pattern — reuse that discipline directly: opaque, not derived from anything guessable (not "familyname@..."), and revocable/regenerable if a parent believes it's been shared beyond intent (e.g., forwarded into a group thread). This should be a stated design requirement whenever Phase B is actually scoped, not left implicit.
- Content arriving via a trusted channel is not automatically higher-trust content — an ICS attachment from a verified household's alias should go through the exact same normalization/validation the web-paste flow already applies (malformed-feed rejection, the existing placeholder-location handling, etc.). Channel verification authenticates the *sender*, not the *content*.
- Inbound message logging/retention follows the Email/SMS retention principles already written this session (bounded body-content retention, longer-lived delivery metadata that never itself contains body content) — this applies symmetrically to inbound and outbound, which the existing security doc's Email/SMS sections were framed around outbound notifications; a small addendum noting inbound applies too should accompany Phase B's actual build prompt.
- A2P 10DLC registration is itself a disclosure relationship with a carrier/aggregator (already flagged in the security doc's SMS section) — nothing new here, just confirming it applies to inbound SMS exactly as it does to outbound.

## 5. Account/claim implications

**For Phase B (lightweight association), no new claim primitive is needed at all.** The household already exists and is authenticated; this only adds a new verified identity to it, using patterns (RPC-validated household field, send-code phone verification) that are ordinary, not novel.

**For Phase D (true send-before-account, future), yes — it requires the still-open "anonymous preview-to-household claim semantics" question** this project has carried since before this session's ADRs. Answering it directly: **it can safely become the eventual model**, provided claiming always requires real authentication (sign in or create an account), never mere possession of a claim link or a match on the sending address/number — email and phone numbers are both spoofable/reassignable, and "whoever clicks the link owns the household" is not an authorization model, a point already made in the prior ingestion review. When this is eventually built, design the claim primitive once, generically, so it can serve email, SMS, or any future channel identically, rather than once per channel.

## 6. Notification-channel strategy

Email and SMS becoming priority channels resolves, in effect, one of the open items already tracked in `CORRALIO_CPO_EXECUTION_STATE.md`: **Open Decision #1 (email channel launch status)** was an unresolved disagreement between "launch required" and "deliberately deferred." Reclassifying email as a priority channel is hard to read as anything but resolving that in favor of launch-relevant — I'm flagging this explicitly rather than silently closing the item, since it deserves your direct confirmation that this is what you intend, given the item was framed as requiring exactly that.

Content-wise, nothing here changes what's already been decided: Weekend Ready stays content-free where content-free already works; the daily snapshot (Section 2, Phase C) carries real schedule content and static leave-by, governed by the Email/SMS minimization and retention principles already in `CORRALIO_SECURITY_PRIVACY.md`; traffic-aware, dynamic updates remain Pro (2026-08-30 decision) and would be a later, separate notification built on top of the same verified-channel delivery target once Phase 4/5 ships.

## 7. Estimated implementation complexity

Rough sizing, for prioritization discussion only — not a commitment, and not something to schedule against without an actual Stage 1 audit:

| Phase | Complexity | Why |
|---|---|---|
| A — Channel identity | **Small**, comparable to the household-timezone foundation slice | One new household field (or two: email confirm, phone verify), standard verification flow, no new pipeline |
| B — Deterministic ingestion (email `.ics`/ICS URL; SMS URL) | **Medium**, comparable to Slice 3.6B Phase 3A | New webhook endpoints (2, one per channel), a thin adapter into the existing pipeline, vendor integration and the A2P 10DLC lead time (calendar time, not engineering time) |
| C — Notification delivery (daily snapshot) | **Medium**, comparable to Slice 3.6A | New content-bearing message design, UAT, explicit application of the retention policy — more content and more surface area than 3.6A's deliberately content-free push |
| D — True send-before-account | **Large**, a new product surface in its own right | The anonymous-claim primitive, sender-spoofing-resistant auth, unclaimed-data retention (a new data class), and its own UAT — do not estimate this against Phase B's cost, it is a different order of work |

## 8. Smallest launch-worthy version

If forced to ship the smallest version that's actually worth shipping: **Phase A + Phase B's email leg only** (skip SMS ingestion initially, keep it to a near-term follow-on) — a household adds/confirms an email address, gets a personal inbound alias, forwards an ICS/`.ics` schedule, and it appears in This Weekend exactly as if pasted. No SMS webhook, no A2P 10DLC lead time to wait on, no daily snapshot content design yet. This is buildable without waiting on carrier registration (the slowest, least engineering-controllable part of the whole plan), gets real evidence on whether parents actually forward schedules, and directly informs whether Phase B's SMS leg and Phase D are worth their larger cost.

## Sources

- [Receiving Emails - Resend](https://resend.com/docs/dashboard/receiving/introduction)
- [Inbound · Receive emails with Resend · Resend](https://resend.com/features/inbound)
- [Resend adds Inbound feature for webhooks-based email receiving and processing](https://alternativeto.net/news/2025/11/resend-adds-inbound-feature-for-webhooks-based-email-receiving-and-processing/)
- [A2P 10DLC Registration Twilio: Step-by-Step Guide (2026)](https://twilsms.com/blog/a2p-10dlc-registration-twilio/)
- [Programmable Messaging and A2P 10DLC | Twilio](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)
- [Pricing and Fees for A2P 10DLC Service - Twilio Help Center](https://help.twilio.com/articles/1260803965530-What-pricing-and-fees-are-associated-with-the-A2P-10DLC-service)
