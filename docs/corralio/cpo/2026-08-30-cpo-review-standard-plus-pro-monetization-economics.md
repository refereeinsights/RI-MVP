# CPO Review — Standard / Plus / Pro Monetization & Variable-Cost Economics

**2026-08-30 · Chief Product Officer**

Pricing, entitlement, and unit-economics investigation only. No billing infrastructure, entitlement gating, SMS gates, or subscription UI was built or specified for build during this review. No canonical pricing, ADR, or roadmap document was changed — Section 14 lists what would need to change if any of this is accepted.

**Evidence discipline:** Telnyx's own pricing pages and 10DLC fee schedule (fetched directly this session) are cited with figures below — these are current list prices, not a live account quote, and should be reverified with an actual Telnyx account before being treated as final. The founder's $0.0082/segment planning rate is checked against those figures in Section 4, not assumed. Household-intensity and conversion figures throughout are explicitly modeled sensitivities, not forecasts — every number in Sections 5, 8, 9, and 11 is generated from stated assumptions you can disagree with, not observed data (Corralio has no billing cohort yet).

---

## 1. Strategic assessment — is Standard / Plus / Pro cleaner than Standard / Pro?

**Yes, conditionally.** The three-tier split maps onto a real distinction the two-tier model blurs: "Corralio tells me what's happening" (free, always-on utility) is a different product experience from "Corralio proactively reaches me without my having to check" (a delivery/communication commitment with real recurring variable cost) which is again different from "Corralio does ongoing work and monitoring on my behalf" (a compute/automation commitment with variable cost that accrues whether or not anything is ever sent). Standard/Pro forces "proactive but cheap" and "proactive and expensive" into the same tier or excludes proactivity from Standard entirely — neither is right. The three-tier structure only stays clean if the boundary is drawn on **who is doing continuous work and at what cost profile**, not on which channel is used (Section 3's warning against "Plus = the SMS tier" is the right instinct) and not on feature count. Section 3's proposed ladder (gives the plan / proactively keeps me informed / actively monitors and manages complexity) survives contact with the actual repository evidence below — the traffic-checkpoint model in particular (Section 9) is the cleanest real example of a capability that fits Section 3's Pro definition and nothing else.

**Where it's not yet clean:** schedule-change notification (Section 5's callout) doesn't sort neatly into this ladder on cost grounds alone — it's cheap enough to be Standard-affordable but proactive enough to sound like Plus's job description. This is resolved by principle, not cost, in Section 5.

## 2. Jobs-to-be-done, by tier

**Standard — "Plan it."** *When my family needs to know what's happening, Corralio has already organized it so I don't have to.* The job is organization and clarity on demand — the parent still does the checking, but checking is easy and complete once they do.

**Plus — "Stay ahead of it."** *I don't have to remember to open Corralio — it reaches me when there's something I need to know.* The job is relieving the parent of the remembering-to-check burden itself, delivered through a channel they already use without installing anything.

**Pro — "Watch it for me."** *Corralio is doing ongoing work in the background — watching conditions change — so I only hear from it when something actually requires me to act differently than planned.* The job is delegating attention to changing real-world conditions (traffic, in the only concrete example that exists today), not just delivery convenience.

## 3. Proposed entitlement hypothesis

| Capability | Tier | Status |
|---|---|---|
| Multiple children/teams/schedules, This Weekend, basic conflicts, required arrival, standard drive duration, static estimated leave-by, tournament/travel context, hotel discovery/booking | **Standard** | **Strong recommendation** — per Section 4's discipline and existing ADR-011/015/016 precedent; none of this should move behind a paywall |
| On-demand traffic-aware leave-by (parent opens Corralio, gets current traffic-aware answer) | **Standard** | **Strong recommendation, confirmed unchanged** — bounded, use-initiated cost; reversing this needs new evidence, and this review doesn't find any (Section 9) |
| Daily/event-day brief, weekend brief, schedule-change notification — delivered proactively via SMS/email without the parent opening the app | **Plus** | **Strong recommendation** for the *proactive delivery* of this content; the content itself (required arrival, drive time, leave-by) is already Standard's when the parent looks. Plus sells not-having-to-look, not the numbers |
| Important/urgent schedule-change notification specifically (a game moved or was cancelled) | **Open boundary — see Section 5** | Recommend Standard-available regardless of tier for this one category; full reasoning below |
| Background traffic monitoring (checkpoint model) + material-change SMS intervention | **Pro** | **Strong recommendation** — this is Section 3's "ongoing work regardless of outcome" case in concrete form; cost accrues whether or not a notification ever fires |
| Advanced conflict intelligence, schedule-change impact analysis, advanced What Fits, multi-event logistics coordination | **Pro — hypothesis, not strong recommendation** | **Unresolved boundary.** None of this exists today (confirmed: no code beyond the basic `deriveConflictPairs()` time-overlap detector). Section 6 below: don't pad Pro with this to hit $49.99 before it's real |
| Household iCal/calendar output | **Standard, tentative** | Outbound-only, no new claim architecture, aligns with "preserve the free core" — but flagged in the HeySammi review as needing a retention-cannibalization answer before wide promotion, independent of tier |

## 4. Telnyx economics — verified against list pricing, not a live account

Fetched directly from Telnyx's own pricing and 10DLC fee pages this session:

| Component | Telnyx list price |
|---|---|
| Outbound SMS, local/10DLC | $0.004/segment |
| Inbound SMS, local/10DLC | $0.004/segment |
| Outbound SMS, toll-free | $0.0055/segment |
| Carrier pass-through, per segment (varies by carrier) | AT&T ~$0.003–0.0035, T-Mobile ~$0.003–0.0045, Verizon ~$0.0045, US Cellular ~$0.005 |
| Local number monthly rental | $1.00 (volume discount to $0.79) |
| Brand registration (one-time) | $4.50 |
| Campaign review (one-time) | $15.00 |
| Monthly campaign fee | $1.50 (low-volume mixed) to $10.00 (standard) |
| TCR monthly pass-through, by use case | $0–$30/month depending on use-case classification (e.g., sole proprietor ~$2, 2FA ~$10, agents/franchises ~$30) |

**Base rate vs. the founder's $0.0082 planning number:** Telnyx's own base segment price is $0.004, not $0.0082 — the founder's figure is closer to **base + a typical carrier pass-through** ($0.004 + ~$0.003–0.0045 ≈ $0.007–$0.0085), which is the right thing to plan against for message-level unit economics, since Corralio can't avoid carrier fees. **Verdict: $0.0082 is a reasonable, slightly conservative proxy for the fully-loaded per-segment cost, not the Telnyx list price** — worth stating precisely so it isn't mistaken for the sticker price when someone else looks up Telnyx's site later.

**What $0.0082 does not include, and what materially changes the picture at small scale: the fixed monthly platform costs.** Number rental, campaign fee, and TCR pass-through are flat monthly charges independent of message volume — roughly **$10–$25/month total**, depending on use-case classification (a real open question for the spike: does a proactive family-planning notification program register as "low-volume mixed" or "standard," and that alone is a $1.50 vs. $10/month swing before TCR fees are even added). Amortized per household:

| Activated families | Fixed platform cost, per household/year |
|---|---|
| 15 (bounded pilot) | **$8.00–$20.00** |
| 100 | $1.20–$3.00 |
| 1,000 | $0.12–$0.30 |
| 10,000 | $0.01–$0.03 |

This is the single most important correction to make to a naive "$0.0082/segment is basically free" read: **at bounded-pilot scale, the fixed platform overhead can exceed the entire variable per-household SMS cost several times over.** It vanishes by 1,000 households, but a 10–15 family pilot should budget for it explicitly rather than assume SMS costs nothing until scale arrives.

## 5. Household-intensity economics — the founder's scenarios, verified and extended

The founder's arithmetic checks out exactly at $0.0082/segment. Extended with a fully-loaded range ($0.0075 low / $0.0090 high, reflecting lighter vs. heavier carrier mix) and one added tier for a genuinely extreme household:

| Tier | Segments/mo | @ $0.0082/yr (founder) | @ fully-loaded range/yr |
|---|---|---|---|
| 1-child recreational | 10–20 | $0.98–$1.97 | $0.90–$2.16 |
| 2–3 child active | 30–50 | $2.95–$4.92 | $2.70–$5.40 |
| 4+ child heavy | 60–100 | $5.90–$9.84 | $5.40–$10.80 |
| Extreme (multi-child, tournament-heavy) | 120–180 | $11.81–$17.71 | $10.80–$19.44 |

**None of this includes the fixed platform overhead from Section 4**, which — per household, at pilot scale — is larger than every row in this table. It also doesn't yet include Pro-specific costs (Section 9) or non-SMS costs (payment processing, email, support) the founder explicitly flagged in Section 10 of the prompt as real and not yet modeled. **The conclusion the founder's own framing points to is correct: "SMS variable cost is below subscription revenue" is true and also not the right test.** Contribution after all attributable costs (Section 8/9) is the right test, and it's meaningfully thinner than the base-segment comparison alone suggests, mainly because of pilot-scale fixed costs, not per-message rates.

**On what actually drives cost (Section 11's question):** number of children is a weak, indirect proxy. Event count, schedule-change frequency, and tournament/travel participation are the real drivers — a one-child travel-tournament family plausibly generates more segments and more Mapbox calls than a three-child household of once-a-week recreational leagues. Recommend modeling and, eventually, monitoring cost against **event count and schedule-change frequency directly**, not household size, and explicitly not using household size as an entitlement/paywall mechanism (per Section 4 of the founder's prompt — confirmed, no disagreement).

## 6. GSM-7 / segment economics

The economics are stark enough to state as a hard design rule, not just a preference: **one non-GSM-7 character (an emoji, a curly quote, an em-dash) forces the entire message into UCS-2 encoding, dropping the per-segment character budget from 160 to 70.** A message that would have been one segment in plain GSM-7 can silently become three in UCS-2 for the same visible content. Concatenated multi-segment messages carry their own overhead too — each linked segment loses several characters to concatenation headers (roughly 153 usable characters per segment in a multi-part GSM-7 message, not 160), so a message that looks like it should barely fit in two segments can spill into three.

**Recommend, as an explicit written rule, not an aspiration:** every outbound SMS template is authored and tested for GSM-7 compatibility (ASCII punctuation only — straight quotes, hyphens, no emoji) as the default, with a one-segment (160 char) target and a two-segment ceiling treated as an accepted exception for a schedule-change alert that needs both an old and new time, never a norm. Track **billed segments, not messages sent**, as the primary internal cost metric from the first message onward (Section 13).

## 7. Message-consolidation strategy

Consolidation is a product-quality lever at least as much as a cost lever, and the two point the same direction here: a parent with six Saturday events wants one household-level "here's your Saturday" message, not six separate ones, regardless of cost — six separate texts is worse *SMS product discipline* per Section 8's principle even before counting segments. Recommend:

- **Household-level, not per-event, as the default unit of an outbound message.** A daily brief is one message covering every event that household has that day, not one per child per event.
- **A materiality threshold for schedule-change alerts** — a 3-minute field-time nudge doesn't warrant a text; a moved game time or cancelled event does. This needs an explicit, stated threshold before build (the traffic-checkpoint model already has one: "don't notify for a shift smaller than ~5–10 minutes" — the same discipline should extend to schedule-change alerts generally, not just traffic).
- **A frequency/consolidation window** for same-day changes to the same household (batch multiple same-morning changes into one message where practical, rather than firing one text per detected change).
- Do not consolidate at the cost of the household missing something material — a genuinely urgent single change (Section 5's "important transactional" carve-out) should still fire immediately, not wait for a batch window.

## 8. Plus economics

Using the typical-tier household-intensity numbers (Section 5) plus the pilot-scale fixed-cost caution (Section 4):

| Plus price | Typical variable SMS COGS/yr (2–3 child active tier) | Heavy-tier COGS/yr | Contribution at typical tier (before fixed platform cost, payment processing, email, support) |
|---|---|---|---|
| $19.99 | ~$3–5 | ~$6–11 | ~$15–17 typical; ~$9–14 heavy |
| $24.99 | ~$3–5 | ~$6–11 | ~$20–22 typical; ~$14–19 heavy |
| $29.99 | ~$3–5 | ~$6–11 | ~$25–27 typical; ~$19–24 heavy |

**The founder's ~$4/year internal design sensitivity (Section 13 of the prompt) is a reasonable target for typical-tier households and gets exceeded by heavy-tier households at the top of their range** (up to ~$10.80/year fully loaded) — meaning a subset of the most sports-intensive Plus households, the very families this product is built for, will run close to or above that envelope on message discipline alone, before fixed costs or non-SMS costs are added. This isn't a reason to abandon the $4 sensitivity — it's a reason to treat consolidation and materiality thresholds (Section 7) as load-bearing for the heavy-tier economics, not optional polish, since that's the population most likely to blow through any cost envelope.

## 9. Traffic / Pro economics — the three-way distinction, modeled

**A. On-demand traffic-aware planning** (parent opens the app, gets a live answer): bounded, use-initiated, no standing cost. Confirmed unchanged recommendation: **stays Standard.** Nothing in this review's evidence argues for reversing the existing decision, and the founder's prompt is explicit not to casually reverse it.

**B + C. Background monitoring + intervention**, modeled against the actual accepted checkpoint architecture (`2026-08-28-slice-3.6b-traffic-check-model.md`: four Mapbox calls per event — at 90/60/30/15 minutes before standard departure — not per household-day):

| Household event intensity | Routable events/mo | Mapbox calls/mo (4/event) | Mapbox cost/yr (marginal, above free tier) |
|---|---|---|---|
| Light | 8 | 32 | ~$0.77 |
| Typical | 16 | 64 | ~$1.54 |
| Heavy | 30 | 120 | ~$2.88 |

Mapbox's own free tier (100,000 requests/month, verified from Mapbox's pricing page in the prior HeySammi review) means **Corralio's entire pilot and plausibly its entire early-launch Pro cohort runs on Mapbox for $0** — the same finding the 2026-08-27 audit already reached, now re-run against the actual four-calls-per-event checkpoint cadence rather than the rougher earlier estimate, per the open item flagged in `CORRALIO_CPO_EXECUTION_STATE.md`. **This closes that open TEST FIRST item: at any household count Corralio will plausibly reach in year one, background traffic monitoring's Mapbox cost is negligible, even before free-tier headroom is considered.**

Adding an assumed SMS intervention rate (modeling assumption, not observed data — say 20% of monitored events produce one material-change text):

| Household event intensity | Interventions/mo (20% of events) | SMS cost/yr |
|---|---|---|
| Light | 1.6 | ~$0.16 |
| Typical | 3.2 | ~$0.32 |
| Heavy | 6.0 | ~$0.59 |

**Combined Pro variable cost (background monitoring + intervention SMS), typical household: roughly $1.86/year. Heavy household: roughly $3.47/year.** Both trivial against $49.99. **The founder's stated principle — "do not charge merely for knowing the answer, charge for Corralio continuously doing work" — is economically sound but the "continuous work" here is cheap.** Pro's $49.99 price point cannot be justified by B+C's COGS alone; it has to be justified by the *value* of not having to think about traffic, which is a willingness-to-pay question (Section 15/17), not a cost-plus one. This directly supports Section 6's caution: don't pad Pro's feature list to make $49.99 feel earned by cost — the honest story is that Pro's variable cost is low and its price has to be earned by outcome value, which hasn't been tested yet.

## 10. Pricing recommendation

**$19.99 Plus and $49.99 Pro are defensible starting hypotheses, not evidence-backed prices — treat both exactly as the founder frames them.** The unit economics support both: Plus's ~$15–17/year typical contribution and Pro's ~$46–48/year typical contribution (after the modeled variable costs above, before fixed platform/payment/support costs) both leave real margin at these price points. **The open question is not "can Corralio afford to charge this," it's "will a sports parent pay this for this specific value" — and Corralio has zero cohort data to answer that yet.** Recommend annual-only at launch (matches existing ADR-011 discipline and avoids building monthly billing/dunning/proration complexity before there's evidence anyone wants monthly), and recommend testing $19.99 as the anchor Plus price specifically because a wider gap to $49.99 Pro (Section 18's cannibalization framing) makes Pro's incremental step feel more deliberate than a $24.99/$49.99 or $29.99/$49.99 pairing would.

## 11. Conversion scenarios — sensitivities only, at two illustrative activated-family bases

Using $19.99 Plus / $49.99 Pro, typical-tier COGS assumptions (~$4/Plus household/year, ~$6/Pro household/year including modeled Section 9 costs and a margin for fixed-cost amortization at scale):

**At 1,000 activated families:**

| Plus% / Pro% | Plus ARR | Pro ARR | Total ARR | Total COGS | Contribution | Revenue/activated family |
|---|---|---|---|---|---|---|
| 5% / 2% | $999 | $1,000 | $1,999 | $320 | $1,679 | $2.00 |
| 10% / 5% | $1,999 | $2,500 | $4,498 | $700 | $3,798 | $4.50 |
| 15% / 7.5% | $2,998 | $3,749 | $6,748 | $1,050 | $5,698 | $6.75 |
| 20% / 10% | $3,998 | $4,999 | $8,997 | $1,400 | $7,597 | $9.00 |

**At 10,000 activated families** (same conversion rates, ARR scales linearly, contribution margin improves slightly as fixed platform costs amortize further):

| Plus% / Pro% | Total ARR | Total COGS | Contribution |
|---|---|---|---|
| 5% / 2% | $19,993 | $3,200 | $16,793 |
| 10% / 5% | $44,985 | $7,000 | $37,985 |
| 15% / 7.5% | $67,478 | $10,500 | $56,978 |
| 20% / 10% | $89,970 | $14,000 | $75,970 |

**None of these conversion rates is a forecast — they're the founder's own stated sensitivity bands, computed through.** The pattern worth carrying forward is that **contribution margin is favorable at every scenario shown** — variable COGS never exceeds ~16% of subscription ARR in any row — which means the real strategic question is conversion rate and activated-family count, not whether the unit economics work at any specific rate.

## 12. Cannibalization analysis

**Risk A (Plus cannibalizes Pro):** plausible and worth designing against, not dismissing. If Plus's proactive brief already answers "what do I need to know today," a family that would have paid for Pro's traffic monitoring might reasonably conclude Plus is "enough." The mitigation is in Section 3's ladder holding up in practice: Plus has to visibly stop at delivery convenience and never quietly include monitoring/intervention behavior, or the $30 gap to Pro has no product justification left to sell against.

**Risk B (no Plus leaves money on the table):** also plausible — a family happy to pay ~$20/year for "just tell me and stop making me check" but unwilling to pay $50/year for traffic monitoring they don't feel they need (a family near their venues, or one where a parent already drives the same route regardless of traffic) is a real, currently-unserved willingness-to-pay band under a two-tier model.

**Neither is answerable today — Corralio has no billing cohort.** Recommend the test, not the answer: once Plus exists, track the fraction of Plus subscribers who engage with content that *would* differentiate Pro if it existed (e.g., do Plus subscribers ask about or click through to a traffic-aware view more than Standard subscribers?) as a leading indicator of Pro's addressable demand within the existing Plus base, rather than guessing at a conversion split before either tier has shipped.

## 13. HotelPlanner interaction — confirmed unchanged

HotelPlanner travel commerce should remain available across Standard, Plus, and Pro — nothing in this review's economics argues for gating it, and gating discovery/booking behind a subscription would work against Corralio's own affiliate-revenue incentive (more households seeing hotel options, not fewer). Plus/Pro's proactive framing does create additional natural moments to surface travel context (a Plus brief could mention an upcoming multi-day tournament the same way it mentions today's leave-by) without changing who can act on it — that's a content/timing opportunity, not a commercial-boundary change. Recommend keeping subscription ARR and HotelPlanner/travel revenue as separate, explicitly-labeled lines in any future reporting, exactly as Section 17 of the prompt requires — don't let a good travel-attach quarter mask weak subscription conversion or vice versa.

## 14. Recommendation

| Item | Classification | Why |
|---|---|---|
| Three-tier positioning (Standard/Plus/Pro) | **TEST NEXT** | Strategically cleaner than two tiers per Section 1, but untested with any real cohort — validate the ladder holds up against actual Plus-tier usage before treating it as final packaging |
| Plus tier as a concept | **TEST NEXT** | Real, cheap-to-deliver value (Section 8); gated on the SMS channel work (already a separate, in-progress investigation) actually shipping — this review doesn't change that dependency |
| $19.99 Plus pricing | **TEST NEXT — hypothesis, not decision** | Unit economics support it comfortably; willingness-to-pay is untested |
| $49.99 Pro pricing | **TEST NEXT — hypothesis, not decision** | Same caveat, more acute — Pro's variable cost (Section 9) is low enough that the price has to be earned entirely on outcome value, which has zero usage evidence behind it yet |
| Traffic-aware leave-by staying Standard (on-demand) | **DO NOW — confirmed, no change** | Reaffirmed by this review's own economics; reversing it needs new evidence this review doesn't find |
| Background traffic monitoring + intervention as Pro | **DO NOW to decide as the working hypothesis; DEFER the build** | Cleanest available example of Section 3's Pro definition; not buildable yet regardless of tier decision (Section 9 of the earlier HeySammi review — gated on 3.6B Phase 1's required-arrival accuracy) |
| Advanced conflict intelligence / advanced What Fits as Pro-justifying features | **DEFER** | None of it exists; don't use it to pad Pro's story before it's real (Section 6) |
| Message consolidation + materiality thresholds + GSM-7 discipline | **DO NOW as design requirements**, ahead of any Plus/Pro build | These aren't optional polish — Section 8 shows heavy-tier households can exceed the Plus cost envelope without them |
| Household size as a paywall/entitlement mechanism | **REJECT** | Confirmed per the founder's own instruction and Section 5's finding that event count, not child count, is the real cost driver |
| Monthly billing option | **DEFER** | No evidence yet that it's worth the added complexity over annual-only |
| Entitlement architecture as capability flags, not hard-coded tier checks | **DO NOW, as a build principle whenever billing work starts** | Section 21's `trafficAwareLeaveBy = pro` anti-pattern is worth stating explicitly before any entitlement code is written — no billing/entitlement infrastructure exists yet, so there's nothing to retrofit, only a rule to follow from the start |

**None of this changes the 3.6B critical path.** Everything here is either already gated on Phase 1 (the daily brief, background traffic monitoring) or explicitly not ready to build (billing/entitlement infrastructure, which doesn't exist and isn't being requested here).

---

## Appendix — where this review's evidence came from

- Telnyx pricing and 10DLC fee schedule: fetched directly from Telnyx's own pricing page and 10DLC fees help article this session (see Sources).
- Mapbox pricing and checkpoint-model cost re-run: `2026-08-28-slice-3.6b-traffic-check-model.md` (accepted design) and `2026-08-27-slice-3.6-notification-and-traffic-routing-audit.md` (verified Mapbox first-party pricing: free to 100,000 requests/month, $2.00/1,000 for 100,001–500,000/month).
- Existing entitlement/billing infrastructure: confirmed absent from `apps/corralio` in prior reviews this session (no Stripe, no subscription-tier column, no paywall code).
- Existing conflict-detection implementation: `apps/corralio/lib/weekendPlan.ts:95-135` (`deriveConflictPairs`), confirmed in the HeySammi competitive review.
- Competitive pricing: HeySammi ($4/mo founding, $9.99/mo regular — unlaunched, waitlist-stage, from `heysammi.com`). No other genuinely comparable family-planning (not team-management) product's consumer pricing was independently verified this session — treat that as a gap, not an absence of competitors, if a deeper competitive-pricing pass is wanted later.
- All household-intensity, conversion-scenario, and Pro-cost figures in Sections 5, 9, and 11 are explicitly modeled from stated assumptions, not observed Corralio data — Corralio has no billing cohort.

## Sources

- [Telnyx Messaging Pricing](https://telnyx.com/pricing/messaging)
- [Telnyx Phone Number Pricing](https://telnyx.com/pricing/phone-numbers)
- [Telnyx — 10DLC Fees and Charges](https://support.telnyx.com/en/articles/5634625-10dlc-fees-and-charges)
- [Sammi — Every family's team parent](https://heysammi.com/)
- Corralio repository/Project docs (this session): `docs/corralio/cpo/2026-08-28-slice-3.6b-traffic-check-model.md`, `docs/corralio/cpo/2026-08-27-slice-3.6-notification-and-traffic-routing-audit.md`, `docs/corralio/CORRALIO_CPO_EXECUTION_STATE.md`
