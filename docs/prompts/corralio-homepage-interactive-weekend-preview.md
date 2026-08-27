# Corralio Homepage — Interactive Weekend Preview (Non-Slice / Marketing Polish)

**Status: CPO-drafted and queued 2026-08-26, per founder request. Not a numbered product slice — does not enter the 4.3→4.8 sequence and must not be treated as gating or gated by it. Sequence this after `corralio-homepage-messaging-trademark-refresh.md` (Section K) — both edit `SignedOutLanding.tsx`; build on K's shipped result rather than in parallel with it, to avoid duplicate/conflicting edits to the same component.**

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

This is a small marketing/conversion task for the public Corralio homepage. It is not a new product slice and must not expand product scope, add a new backend surface, or interfere with the existing Corralio roadmap/slice sequencing.

## 0. Why this exists, and the one rule that governs everything below

The founder asked whether an unauthenticated visitor could scroll through a richer example weekend on the homepage and "experience" leave-by and travel time, the same way a signed-in parent would. That's a good idea with one hard constraint: **nothing on this page may be a live computation, and nothing may claim a capability the product doesn't have yet.**

Concretely:

* Leave-by and travel-time values shown to anonymous visitors are **pre-baked, hardcoded synthetic numbers** using the real product's presentation components and copy conventions — never a live Geocodio/OpenRouteService call triggered by an anonymous page view. An open, unauthenticated demo that fires real provider calls per visitor is an open-ended cost and abuse surface with no household behind it to rate-limit against, and it is not necessary to make the point.
* **Hotel/travel suggestions are excluded entirely.** That capability does not exist in the shipped product (Slice 4.7/4.8 are not built), and showing it would be showing a fabricated feature to a prospective customer — the same "do not fake it" line already drawn for leave-by in Section K's prompt applies here without exception.
* Everything shown must be clearly framed as an illustrative preview, not a live personalized result.

If a later phase of this task turns out to need real provider calls to feel convincing, stop and report that rather than adding them.

## 1. Audit first

Before editing anything:

1. Read `apps/corralio/app/components/SignedOutLanding.tsx` in full, including the existing `EXAMPLE_DAYS` synthetic fixture (Jordan/Riley, multi-child/multi-team, Saturday/Sunday) and the `weekendPreview` section that renders it. This is the existing synthetic data structure to extend — do not invent a parallel one.
2. Confirm whether `corralio-homepage-messaging-trademark-refresh.md` (Section K) has already shipped against this file. If it has, read the current state of the file and build on it. If it has not, report that dependency before proceeding — this task assumes K's hero-preservation, CTA-transition, and trademark-treatment decisions are already in place, and should not re-litigate or revert them.
3. Confirm whether Section K added a leave-by example to this fixture already (K's own prompt made that conditional on Slice 4.3's availability in-branch). If K already added one, extend it rather than adding a second, differently-formatted one.
4. Identify the actual Slice 4.3 leave-by presentation component/formatting convention used in the authenticated product (not a re-derived format) — the synthetic values here must use the same label conventions (for example, an "(est.)" qualifier and the real drive-time phrasing) as the real feature, so the preview is honest about what the real feature looks like.
5. Identify whether an existing realistic multi-child/multi-team UAT or pre-launch-test fixture already exists elsewhere in the repo (the pre-launch test design references "a realistic multi-child/multi-team weekend"; Slice 4.5A's UAT referenced a "Dwight Merkel" regression fixture in a different context). If a canonical realistic-household fixture already exists and is reusable/exportable as static content, prefer adapting it over inventing new names/events from scratch, for internal consistency. If none exists in a reusable form, extending `EXAMPLE_DAYS` with 1–2 more realistic events is sufficient — do not build new fixture infrastructure for this.
6. Identify existing scroll/reveal patterns already used elsewhere on the site (if any) before introducing a new interaction pattern.
7. Identify existing analytics instrumentation on this page (per Section K's audit) so nothing here duplicates or conflicts with it.
8. Preserve existing responsive/mobile behavior.

Report material discrepancies before expanding scope.

## 2. What to build

Extend the existing "Example weekend" preview section into a slightly richer, scrollable proof point — not a new page section, not a competing hero, not a rebuild:

1. **More than one representative event chain.** The existing two-day, four-event `EXAMPLE_DAYS` fixture is close to right-sized already; you may add at most one or two more events only if it makes the "multiple kids, multiple teams, one plan" point more concretely, not to make the page longer. Do not turn this into an exhaustive tournament weekend.
2. **One or two synthetic leave-by / travel-time examples**, attached to realistic entries in the existing fixture, using the real component/label conventions identified in the audit (for example: `Leave by 6:55 AM (est.) · ~52 min drive`). These are static values baked into the fixture data, computed once by a human/design decision, not by calling any routing provider at request time or build time from live traffic.
3. **A visual/interaction treatment that invites scrolling or stepping through the events** (for example, a lightweight step-through or an already-scrollable list with a subtle affordance), appropriate to whatever interaction primitives already exist in this codebase. Do not introduce a new client-side state-management pattern, animation library, or dependency for this — use what the existing frontend stack already provides.
4. **A small, unobtrusive label** (for example "Example weekend — illustrative") staying visible near this section so it's never mistaken for the visitor's own data. This is a strengthening of, not a replacement for, the existing "Example weekend" eyebrow copy already in the component.

## 3. Explicitly out of scope

Do not:

* add hotel/travel suggestions, links, or claims of any kind;
* add maps;
* make any live provider call (geocoding, routing, Overture, HotelPlanner) triggered by anonymous page load or scroll;
* store or transmit any real visitor location or personal data as part of this preview;
* replace the existing hero, positioning, or Section K's brand-payoff/CTA-transition/trademark work;
* redesign the entire homepage;
* change authentication, onboarding, or signup steps;
* add a second competing primary CTA;
* create a new numbered product slice;
* introduce a new analytics system or duplicate existing events — if this section's added interaction is worth tracking, reuse the existing analytics convention with one clearly-named event, nothing more;
* implement or reference anything from Slice 4.7/4.8 (travel intent, hotel booking) even as an "example."

Keep this narrowly scoped — it is a proof-point enhancement to an existing homepage section, not a new demo product.

## 4. Verification

After implementation:

1. Run the existing Corralio TypeScript/typecheck process.
2. Run lint.
3. Run the production build.
4. Run `git diff --check`.
5. Run any existing relevant homepage/UI tests.
6. Verify the homepage in a real browser if existing project tooling allows it — desktop and a representative mobile width.
7. Confirm no network calls to any provider fire from this section on page load or interaction (check the network panel, not just the code path) — this is the one thing that must be independently verified, not just asserted.
8. Confirm existing signup/CTA behavior and analytics remain intact.
9. Confirm no console/page errors were introduced.

Do not make outbound production calls merely to verify this copy/UI task.

## 5. Final report

Report:

1. files changed;
2. exactly what was added to the synthetic fixture (events, leave-by/travel-time examples) and their exact copy;
3. confirmation that no live provider call is triggered anywhere in this section, and how that was verified;
4. how the scroll/step interaction was implemented and what existing pattern it reused;
5. how this built on (or was blocked by) Section K's shipped state;
6. analytics preserved, and whether any new event was added;
7. mobile/browser verification performed;
8. automated checks run;
9. any blockers or deviations.

Do not push or deploy unless separately instructed.

This is homepage conversion/brand polish, not a product-scope expansion.
