# Corralio Homepage Messaging & Trademark Refresh (Non-Slice / Marketing Polish)

**Status: CPO-approved and queued 2026-08-26. Not a numbered product slice and must not be treated as gating or gated by the numbered roadmap. Completed Slice 4.3–4.6 architecture and product behavior must not be reopened or modified by this work. Slice 4.5B remains deferred/non-blocking.**

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

This is a small marketing/conversion task for the public Corralio homepage.

It is not a new product slice and must not expand product scope or alter completed Corralio architecture or product behavior.

The objectives are:

1. Introduce the brand line "Corral your sports chaos."
2. Improve the transition from product explanation into signup.
3. Add restrained `Corralio™` trademark treatment.
4. Preserve the clarity of the existing Corralio positioning.
5. Surface exactly one static synthetic estimated leave-by example using the existing production presentation convention.

## 1. Audit first

Before editing anything:

1. Locate the current Corralio public homepage implementation.
2. Confirm the exact current:
   * hero copy
   * supporting copy
   * CTA
   * example-weekend/demo content
   * signup/email form
   * footer/legal treatment
   * logo/wordmark implementation
3. Determine whether homepage copy is hardcoded or sourced from shared components/config.
4. Identify existing brand color tokens/styles used for the Corralio wordmark and primary brand text.
5. Identify existing analytics instrumentation on homepage CTAs and signup actions.
6. Confirm the completed Slice 4.3 estimated leave-by presentation convention without importing its authenticated computation into the signed-out preview.
7. Preserve existing responsive/mobile behavior.

Do not rely on this prompt's description if the repository has materially changed.

Report material discrepancies before expanding scope.

## 2. Preserve the existing hero positioning

The current core positioning should remain intact:

> The planner built for sports families.
> Every kid. Every team. One plan.

Do not replace either of these with:

> Corral your sports chaos.

The hierarchy is intentional.

The hero should first tell a new visitor:

1. what Corralio is;
2. who it is for;
3. what outcome it provides.

"Corral your sports chaos." is the emotional/brand payoff, not the primary explanation of the product.

Do not turn it into the H1 unless separately instructed later.

## 3. Add the brand payoff

Introduce:

> Corral your sports chaos.

in a natural location after the main product explanation/example-weekend experience and before the final signup/CTA area.

Preferred supporting copy:

> Every schedule, every kid, every team — brought together so you can see how the weekend actually works.

Use judgment based on the existing homepage structure rather than mechanically adding another oversized section.

The desired messaging progression is:

```text
What is this?
The planner built for sports families.

        ↓

What's the promise?
Every kid. Every team. One plan.

        ↓

Show me.
Realistic multi-child / multi-team weekend

        ↓

What's the emotional outcome?
Corral your sports chaos.

        ↓

What should I do?
Get started
```

The new section should reinforce the page rather than make it longer for the sake of being longer.

## 4. Improve the CTA transition

Audit the transition between the product/example content and the existing signup/email form.

If it currently feels abrupt, add a short value bridge before signup.

Preferred direction:

> Bring your schedules together. Spot conflicts. Know what the weekend looks like.

Then lead naturally into the existing signup CTA/form.

Do not redesign onboarding.

Do not add additional signup steps.

Do not introduce a second competing primary CTA.

Preserve the existing authentication/signup behavior and analytics.

## 5. Static synthetic estimated leave-by

Estimated leave-by is a strong example of Corralio's differentiation because it moves the product from:

> Here is your schedule.

toward:

> Here is what your family needs to do.

Slice 4.3 estimated leave-by is complete in the current repository. Add exactly one realistic, static synthetic leave-by example to the existing signed-out preview fixture using the production convention exactly:

> Leave by 6:55 AM (est.) · ~52 min estimated drive

Do not shorten this to `~52 min drive` or introduce a competing format.

This is presentation-only fixture data. Rendering or interacting with the signed-out preview must make **zero Supabase, database, routing, geocoding, provider, product-data, or external fetch calls**. Do not import authenticated leave-by computation merely to render the preview.

This homepage task must not reimplement, alter, or invoke Slice 4.3 functionality.

## 6. Trademark treatment

Begin using `Corralio™` selectively on the public homepage.

The goal is restrained brand treatment, not putting ™ after every occurrence of Corralio.

### Textual eyebrow target

Apply the restrained trademark treatment specifically to the textual `Corralio` eyebrow that follows the existing logo in `SignedOutLanding.tsx`:

Render:

> Corralio™

The ™ should:

* be visually smaller than the Corralio text;
* be superscripted;
* use the same primary Corralio brand color as the associated wordmark/brand text;
* remain visually subordinate to the Corralio name;
* maintain adequate contrast/accessibility;
* render cleanly on mobile and desktop.

Use existing design tokens/styles wherever possible.

Do not introduce a one-off arbitrary hex color if the appropriate Corralio brand token already exists.

### Do not modify the logo artwork

Do not edit the Corralio SVG/PNG/logo asset merely to bake the ™ symbol into the artwork.

Keep the master Corralio wordmark clean.

Do not wrap, alter, replace, or otherwise modify the logo component to add the mark. The trademark belongs on the separate textual eyebrow specified above.

Do not distort, resize, recolor, or otherwise redesign the Corralio logo as part of this task.

### Frequency

Do not render:

`Corralio™`

every time the word Corralio appears.

One prominent homepage treatment plus appropriate footer/legal treatment is sufficient.

All normal body-copy references can remain:

`Corralio`

### Do not use ®

Do not use the registered trademark symbol (`®`) anywhere.

This task makes no representation that CORRALIO is federally registered.

## 7. Footer trademark treatment

The repository audit found no authoritative legal-entity owner in the inspected Corralio surface. Do not add a footer ownership or legal-entity statement. Leave the existing footer/legal treatment intact and report that ownership wording remains deferred pending founder confirmation.

Do not make broader Terms, Privacy Policy, copyright, trademark-registration, or legal-policy changes as part of this task.

## 8. Do not trademark the tagline in this task

Do not append ™ to:

> Corral your sports chaos.

For this task, the trademark presentation applies to the Corralio brand name, not the marketing tagline.

Keep the tagline visually clean.

## 9. Design principles

Corralio should continue to feel:

* calm
* organized
* modern
* smart
* trustworthy
* consumer-oriented
* sports-family aware

The emotional transformation remains:

> Chaos → Clarity

Do not introduce:

* western/cowboy imagery
* horses
* lassos
* ranch motifs
* novelty western typography
* sports-ball clichés
* unnecessary decorative graphics

"Corral" is the conceptual origin of the brand, not a literal visual theme.

## 10. Mobile requirements

Treat mobile as the primary verification surface.

Confirm:

* "Corral your sports chaos." wraps naturally;
* the new section does not create excessive vertical space;
* the ™ remains correctly positioned at small sizes;
* the ™ does not create awkward line-height or baseline issues;
* the brand hierarchy remains clear;
* the CTA remains obvious;
* the signup form remains easy to reach and understand;
* no new horizontal overflow is introduced.

The homepage hierarchy should remain:

1. What Corralio is
2. What Corralio promises
3. How it helps
4. Product/example proof
5. Emotional brand payoff
6. CTA/signup

Do not add sections merely to satisfy this ordering if the existing page already communicates one of these effectively.

## 11. Analytics

Preserve all existing homepage analytics.

Do not:

* rename existing CTA events without a migration reason;
* remove signup instrumentation;
* create a new analytics system;
* introduce duplicate events.

If the new brand-payoff section introduces no interaction, it does not need its own analytics event.

This task is primarily messaging/conversion polish.

## 12. Explicitly out of scope

Do not:

* redesign the entire homepage;
* replace the existing hero;
* change Corralio positioning;
* change authentication;
* redesign onboarding;
* add new signup steps;
* add hotel/travel functionality;
* add hotel/travel claims;
* add venue-intelligence claims that are not currently supported;
* add maps;
* invoke, duplicate, or modify authenticated leave-by computation;
* modify TournamentInsights;
* modify RefereeInsights;
* change the product roadmap;
* create a new numbered product slice;
* modify the master logo artwork to include ™;
* use ®;
* claim a trademark registration;
* trademark "Corral your sports chaos." as part of this task.

Keep this narrowly scoped.

## 13. Verification

After implementation:

1. Run the existing Corralio TypeScript/typecheck process.
2. Run lint.
3. Run the production build.
4. Run `git diff --check`.
5. Run any existing relevant homepage/UI tests.
   * Explicitly update `apps/corralio/lib/landing.test.ts` to verify that the existing hero positioning remains unchanged, the approved tagline appears, the restrained trademark appears on the textual Corralio eyebrow, and the leave-by example is static synthetic content using the exact approved production wording.
   * The test must also verify that the signed-out preview introduces no Supabase, product-data, fetch, routing, geocoding, or provider dependency.
6. Verify the homepage in a real browser if existing project tooling allows it.
7. Verify at minimum:
   * desktop
   * representative mobile width
8. Confirm existing signup/CTA behavior still works.
9. Confirm existing analytics instrumentation remains intact.
10. Confirm no console/page errors were introduced.

Do not make outbound production calls merely to verify this copy/UI task.

## 14. Final report

Report:

1. files changed;
2. exact copy added or changed;
3. where "Corral your sports chaos." was placed;
4. whether the CTA transition changed and how;
5. where `Corralio™` is rendered;
6. how the ™ is styled and which existing brand token/color it uses;
7. whether any logo asset was changed — expected answer should be no unless repository evidence required otherwise;
8. confirmation that no footer ownership/legal-entity statement was added because authoritative ownership remains unestablished in the inspected Corralio surface;
9. confirmation that exactly one static synthetic leave-by example was added with the approved production wording and zero live dependencies or calls;
10. analytics preserved;
11. mobile/browser verification performed;
12. automated checks run;
13. any blockers or deviations.

Do not push or deploy unless separately instructed.

This is homepage conversion/brand polish, not a product-scope expansion.

These specification boundaries do not authorize broader redesign or architecture changes.
