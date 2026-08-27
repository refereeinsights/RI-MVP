# Corralio Homepage Messaging & Trademark Refresh (Non-Slice / Marketing Polish)

**Status: CPO-approved and queued 2026-08-26. Not a numbered product slice — does not enter the 4.3→4.4→4.4B→4.4C→4.4D→4.5→4.5A→4.5B→4.6→4.7→4.8 sequence and must not be treated as gating or gated by it.**

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

This is a small marketing/conversion task for the public Corralio homepage.

It is not a new product slice and must not expand product scope or interfere with the existing Corralio roadmap/Slice 4.3 sequencing.

The objectives are:

1. Introduce the brand line "Corral your sports chaos."
2. Improve the transition from product explanation into signup.
3. Add restrained `Corralio™` trademark treatment.
4. Preserve the clarity of the existing Corralio positioning.
5. Optionally surface estimated leave-by in the synthetic homepage example only if that capability genuinely exists in the branch being edited.

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
6. Confirm whether Slice 4.3 estimated leave-by functionality exists in the current branch before making any claim about leave-by.
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

## 5. Estimated leave-by readiness

Estimated leave-by is a strong example of Corralio's differentiation because it moves the product from:

> Here is your schedule.

toward:

> Here is what your family needs to do.

However, do not advertise functionality that does not exist.

Before modifying the synthetic/example weekend, verify whether Slice 4.3 estimated leave-by functionality is actually available in the current branch.

If it is available and the homepage example uses reusable Corralio presentation components/data structures, add one realistic leave-by example such as:

> Leave by 6:55 AM (est.) · ~52 min drive

Use the actual product's formatting and estimate-label convention rather than hardcoding a competing format.

If Slice 4.3 is not available:

* do not add leave-by;
* do not fake it;
* do not make a marketing claim implying it exists;
* report that the homepage example remains ready for this enhancement after Slice 4.3.

This homepage task must not implement Slice 4.3 functionality itself.

## 6. Trademark treatment

Begin using `Corralio™` selectively on the public homepage.

The goal is restrained brand treatment, not putting ™ after every occurrence of Corralio.

### First prominent textual brand occurrence

Find the first natural prominent textual occurrence of the Corralio brand on the homepage.

Where appropriate, render:

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

If the ™ is visually associated with a rendered wordmark, add it through appropriate markup/CSS around the existing logo/component rather than modifying the underlying brand asset.

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

Inspect the existing footer/legal content.

If the repository already establishes the legal entity that owns Corralio, add a restrained trademark statement such as:

> Corralio™ is a trademark of [existing legal entity].

Do not invent or infer the legal entity.

If the ownership entity is not clearly established in existing repository/site legal content:

* do not create the ownership statement;
* leave the existing legal footer intact;
* report that the legal entity needs founder confirmation.

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
* implement leave-by if Slice 4.3 is not already available;
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
8. whether the footer trademark statement was added or deferred pending legal-entity confirmation;
9. whether leave-by was added to the example;
10. if leave-by was not added, why;
11. analytics preserved;
12. mobile/browser verification performed;
13. automated checks run;
14. any blockers or deviations.

Do not push or deploy unless separately instructed.

This is homepage conversion/brand polish, not a product-scope expansion.
