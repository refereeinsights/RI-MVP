# Corralio Slice 4.6 — What Fits?
## Schedule-Aware Food & Coffee Planning Between Sports Commitments

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

Slices 4.3, 4.4, 4.4B, 4.4C, 4.5 and the 4.5A candidate-quality hardening work are complete or must pass their required verification before 4.6 runtime behavior is enabled.

This slice is a launch-gate product feature.

It is not another infrastructure slice.

## Product Promise

Corralio should answer:

We have time between sports commitments. What can we actually do without being late to the next one?

The desired parent experience is:

You have 1h 42m available
Arrive by 2:00 PM
Food | Coffee
Here are the best options that fit.
Leave by 1:31 PM
✓ Fits your schedule

This is not generic Nearby search.

This is:

Schedule-aware family logistics.

The governing product principle is:

Corralio recommends. Google Maps browses.

## 0. Core Success Test

4.6 succeeds when Corralio can take:

* the family's actual sports schedule;
* current/previous commitment;
* next required commitment;
* required arrival time;
* venue locations;
* clean 4.5A Food/Coffee candidates;
* estimated routing;

and reliably answer:

What can this family realistically do before they need to leave for the next commitment?

Do not optimize for restaurant discovery.

Optimize for:

Grab something. Get back on time.

## 1. Audit First

Before schema or implementation changes, audit actual repository reality.

Inspect at minimum:

* This Weekend implementation;
* household/kid/team model;
* team schema/settings;
* event schema;
* event origin/source fields;
* event start/end behavior;
* ICS parsing;
* representative ICS `SUMMARY`, `DESCRIPTION`, `LOCATION`, and any relevant custom fields;
* whether explicit arrival/warmup/report times are currently persisted;
* Slice 4.3 routing abstraction;
* route caching/persistence rules;
* estimated leave-by implementation;
* arrival-buffer behavior already present in 4.3;
* Slice 4.4 canonical venue associations;
* 4.4B provisional associations;
* 4.4C lifecycle resolution;
* 4.5/4.5A active candidate read model;
* `pool_category`;
* `intent_category`;
* `food_tags`;
* operating-status representation;
* Overture candidate quality fields;
* existing route-call quota/governance;
* existing analytics conventions;
* current This Weekend UI/card conventions.

Do not assume capabilities exist because they were discussed.

Repository reality wins.

Report material conflicts before implementation.

## 2. Explicit Non-Goals

Do NOT build in 4.6:

* generic Nearby directory;
* free-text local search;
* restaurant search engine;
* Breweries tab;
* Essentials;
* pharmacy/grocery/gas;
* hotel-aware planning;
* Back to Hotel;
* HotelPlanner changes;
* travel-intent intelligence;
* venue promotion;
* canonical venue creation;
* Overture ingestion changes except necessary read integration;
* POI quality reclassification;
* live traffic unless separately approved;
* GPS/background location;
* native app behavior;
* push notifications;
* AI/ML recommendations;
* cuisine preference onboarding;
* restaurant ratings/reviews;
* reservations;
* full family transportation optimization.

4.6 consumes the infrastructure already built.

Do not recreate it.

## 3. Required Arrival Time

The central planning deadline is:

Required Arrival Time

Do not use scheduled event start blindly.

Determine required arrival using this hierarchy.

### A. Explicit imported arrival/report/warmup time

If the imported ICS data contains a reliably and deterministically extractable arrival/report/warmup requirement, use it.

Examples may include:

* explicit arrival time;
* explicit report time;
* explicit warmup time;
* explicit "arrive X minutes early" instruction.

Do not implement broad NLP guessing.

During audit, inspect representative real ICS feeds and report:

* which deterministic patterns exist;
* how frequently they appear;
* whether they are reliable enough for V1 parsing.

Only implement deterministic supported patterns.

Preserve provenance indicating the required-arrival source.

### B. Team-level parent arrival preference

When explicit imported arrival information is unavailable, allow a parent to set:

Arrive ___ minutes before games

once per team.

This should not be required during onboarding.

The product must work with defaults before the parent configures anything.

Audit the team model and implement the smallest appropriate setting.

### C. Corralio default

When neither explicit imported arrival information nor a team preference exists, use a Corralio default.

Stage 1 must report the proposed default.

Do not silently present a default-derived time as schedule-provided truth.

Track provenance such as:

* `ics_explicit`
* `team_preference`
* `corralio_default`

or repository-equivalent values.

## 4. Practices vs. Games

Audit whether Corralio reliably distinguishes games from practices today.

If yes, 4.6 may support separate deterministic arrival defaults/preferences where justified.

For example:

* games may need an earlier arrival;
* practices may need a smaller buffer.

Do not invent event-type precision if the schedule model cannot support it.

If V1 uses one default for all sports commitments, document that explicitly.

Do not block 4.6 on sophisticated event classification.

## 5. Event-Level Arrival Override

Do not require event-by-event setup.

Preferred V1 hierarchy remains:

ICS explicit → team preference → Corralio default

If repository reality makes a one-event override extremely cheap and consistent with existing event editing, Codex may report it as an optional implementation.

Do not expand 4.6 substantially to build it.

Team-level configuration is the important V1 personalization.

## 6. Required Arrival Display

If the next event starts at:

2:30 PM

and required arrival is:

2:00 PM

the parent-facing planning constraint should emphasize:

Arrive by 2:00 PM

The scheduled event time may remain visible context:

Next game 2:30 PM

Do not call a default-derived arrival time "warmup" unless the schedule actually says warmup.

## 7. Household-Aware Available Time

This is a core Corralio differentiation.

Do not calculate availability using only one team's schedule.

A gap between Child A's games is not truly free if another household sports commitment occupies the family during that period.

Before presenting:

You have 1h 42m available

inspect relevant household commitments.

V1 does not need to solve:

* parent assignments;
* two-car optimization;
* custody;
* complex transportation delegation.

But it must not knowingly label an overlapping household commitment as free time.

Use a conservative rule:

If another relevant household commitment overlaps the proposed gap and Corralio cannot safely determine the family is free, do not present the full interval as available.

Audit the existing conflict model and reuse it.

Do not create a second conflict engine.

## 8. Gap Definition

A candidate gap begins after the prior relevant sports commitment and ends at the next required arrival time.

Conceptually:

`gap_start = prior event end`
`gap_deadline = next event required arrival`

The raw gap is:

`gap_deadline - gap_start`

Do not use:

`next event start - prior event end`

when required arrival precedes event start.

## 9. Minimum Gap

Use a conservative V1 minimum before showing What Fits.

Working product hypothesis:

45 minutes raw gap

This is a discovery threshold, not proof that Food fits.

Actual candidate feasibility still requires:

* outbound route;
* dwell/activity time;
* route to next venue;
* required arrival deadline;
* safety assumptions.

During Stage 1, report whether 45 minutes is sensible against representative real routing/candidate data.

Do not silently change it.

If evidence strongly supports another threshold, report before changing product policy.

## 10. Food + Coffee Modes

V1 recommendation modes are:

Food | Coffee

These are contextual recommendation modes.

They are not a generic directory taxonomy.

No Breweries tab.

No Essentials.

No broad category browser.

## 11. Food Candidate Inputs

Consume the hardened 4.5A Food pool.

Do not rebuild Overture classification in 4.6.

Food candidates may have intent categories such as:

* `quick_service`
* `pizza`
* `sandwiches`
* `brewery`
* `other_food`

For automatic Food recommendations, prioritize sports-family usefulness.

When time is constrained, generally prefer:

* quick service;
* sandwiches;
* pizza;

over:

* slower/unknown other-food options;
* brewery.

Do not automatically exclude legitimate `other_food` when enough time exists.

Do not build ML ranking.

Use deterministic/versioned ranking.

## 12. Coffee Candidate Inputs

Consume the hardened 4.5A Coffee pool.

Coffee is intentionally included because shorter gaps may support:

grab coffee and return

even when a meal does not comfortably fit.

Coffee uses its own dwell-time assumption.

Do not treat Coffee as merely another restaurant subtype.

## 13. Food Tags

4.5A may provide descriptive `food_tags`, including values such as:

* mexican
* chinese
* italian
* japanese
* sushi
* american
* burgers
* bbq

In 4.6 V1:

* food tags may be displayed as descriptive metadata where useful;
* they do not drive preference learning;
* they do not create personalized rankings;
* they do not create cuisine tabs;
* they do not create free-text search.

Do not require a tag for a candidate to qualify.

## 14. Operating Status

Consume 4.5A's operating-status state.

Confirmed closed

Never recommend.

Confirmed open

Eligible if all other rules pass.

Status unknown

May be eligible if the candidate otherwise passes the 4.5A quality bar.

Do not label it:

Open

or:

Open now

unless the data actually establishes that.

Do not make live-hours API calls in 4.6.

## 15. Dwell-Time Assumptions

Routing time alone is insufficient.

4.6 needs a deterministic V1 assumption for time spent at the intermediate place.

Define conservative dwell times by intent/mode.

Stage 1 should audit/recommend simple defaults such as:

* Coffee: shorter dwell
* Quick Service: moderate dwell
* Sandwiches: moderate dwell
* Pizza: moderate dwell
* Other Food: longer dwell or stricter eligibility

Do not build restaurant-specific dwell prediction.

Do not use ratings/popularity to infer speed.

Store/version the dwell-time policy.

The CPO/founder should approve final V1 values if the prompt does not already specify them.

## 16. Route Chain

A candidate may display:

✓ Fits your schedule

only after evaluating the relevant route chain.

For a between-event gap:

current/prior event venue
→ candidate
→ next event venue

The feasibility calculation must include:

1. estimated drive from current venue to candidate;
2. candidate dwell time;
3. estimated drive from candidate to next venue;
4. required arrival deadline;
5. any approved safety buffer.

Do not qualify based only on venue → candidate distance.

## 17. Same-Venue Next Event

If the next event is at the same venue as the previous event, the second route leg is:

candidate → same venue

Do not assume "back" merely because event IDs differ.

Use resolved venue/location identity.

## 18. Different-Venue Next Event

If the next commitment is at another venue:

candidate → next venue

must be routed explicitly.

This is why generic:

Back by

can be ambiguous.

The UI should communicate the actual action.

## 19. Candidate Leave-By Time

For each fitting candidate calculate:

Leave Candidate By

Conceptually:

`candidate_leave_by = required_arrival - candidate_to_next_drive - approved arrival/safety routing buffer`

This is the actionable time the parent needs.

Example:

Leave by 1:31 PM
Arrive by 2:00 PM

Do not label this as live-traffic precision when routing is estimated/non-live.

## 20. Available-Time Hero

The visual north star is:

You have 1h 42m available
Arrive by 2:00 PM

Be precise about what the first number represents.

It should represent the household-aware planning interval available between the relevant commitments—not simply the difference between scheduled event start times.

If dwell/routing constraints mean the full interval isn't usable at any candidate, do not imply otherwise.

## 21. Estimated Routing

Reuse the existing routing abstraction/provider decisions.

Do not reopen routing-provider selection.

If routes are non-live:

* treat them as estimated;
* use appropriate UI language;
* do not imply traffic awareness.

Do not add live traffic in this slice unless separately authorized.

## 22. Routing Cost / Call Control

Do not route every stored candidate indiscriminately.

The active 4.5A pool may contain up to:

* 15 Food
* 15 Coffee

per venue.

Implement a bounded deterministic prefilter before route calculations using available:

* straight-line distance;
* candidate quality;
* intent priority;
* operating status;
* existing route cache where valid.

Then perform route calculations only for the bounded candidates needed to determine fitting recommendations.

Stage 1 must report:

* maximum route calculations per gap;
* caching/reuse behavior;
* estimated provider usage/cost;
* failure behavior.

Do not sacrifice recommendation quality merely to minimize calls, but keep external work bounded.

## 23. Recommendation Feasibility

A candidate fits only when:

`gap_start`
+ outbound drive
+ dwell time
+ candidate→next-event drive
+ approved buffers
≤
`required_arrival`

Use explicit deterministic arithmetic.

Version the feasibility rule.

No AI reasoning determines whether something fits.

## 24. Ranking

Among candidates that fit, use a simple deterministic ranking.

Product priority should favor:

1. comfortable schedule fit;
2. quick sports-family utility;
3. lower routing burden;
4. candidate quality;
5. useful intent diversity where appropriate.

Do not rank purely by Overture existence confidence.

Do not rank purely by straight-line distance.

Do not build personalized ranking.

Stage 1 should report the exact deterministic ranking rule before locking it.

## 25. Top 3 + See More

Do not expose all stored candidates by default.

Show:

Best 3 that fit

If more qualified candidates pass the exact same schedule-feasibility and quality gates, show a secondary action such as:

See 7 more that fit

Expanded results may show up to:

10 total fitting candidates

Do not expose the raw 15-candidate pool.

Every expanded candidate must independently pass the same 4.6 feasibility calculation.

Never use "See more" to show candidates that have not been proven to fit.

This preserves:

Corralio recommends first.

while allowing parent choice when the ranking does not reflect their personal preference.

## 26. Food / Coffee Switching

The parent may switch:

Food | Coffee

Each mode independently evaluates fitting candidates.

Do not assume Food and Coffee have identical dwell-time rules.

The top 3/See More behavior applies per mode.

Do not automatically route all candidates in both modes if the user has not opened both and doing so materially increases cost.

Audit whether lazy evaluation is appropriate.

## 27. No Search

Do not implement free-text search in 4.6 V1.

The mockup search box is future/north-star direction.

No:

* "Jimmy John's" search;
* "Mexican near me" search;
* generic place search.

The product hypothesis being tested is curated schedule-aware recommendation.

Search can be earned later.

## 28. Recommendation Card

Keep cards decision-oriented.

Each card should communicate approximately:

* place name;
* useful intent/food tag;
* distance where useful;
* clearly labeled route information;
* ✓ Fits your schedule;
* Leave by X.

Avoid ambiguous:

6 min drive

if the parent cannot tell which leg it represents.

Possible presentation:

Subway
Sandwiches · 1.6 mi
7 min from here · 9 min to next game
✓ Fits your schedule
Leave by 1:31 PM

Exact visual treatment should follow existing Corralio design conventions.

Do not turn cards into restaurant detail pages.

## 29. Directions Action

Audit existing directions/map handoff behavior.

If there is an existing safe pattern, allow a simple:

Directions

action.

Do not build turn-by-turn navigation.

Do not block 4.6 on sophisticated map UI.

If adding Directions materially expands scope, report and defer.

## 30. No-Fit State

Never force a recommendation.

If Food has no safe options:

No Food options comfortably fit this gap.

Coffee may still have options.

If neither mode has anything useful, the entire module may remain minimal/absent according to the final UX.

No result is not an error.

Do not reduce dwell/arrival safety assumptions just to fill cards.

## 31. Too-Short Gap

If the raw household-aware gap is below the approved minimum:

do not run unnecessary candidate routing.

Do not show What Fits.

The schedule itself remains normal.

## 32. Missing Venue / Candidate Data

If either relevant event cannot resolve to usable routing coordinates:

do not claim What Fits.

If no 4.5A candidate pool exists:

do not claim What Fits.

The rest of This Weekend remains fully usable.

No scary error state.

## 33. Multiple Household Commitments

This is mandatory.

Before claiming availability, inspect relevant household events/conflicts.

Do not knowingly recommend Food/Coffee across a period occupied by another family sports commitment.

Use existing household/conflict data.

Keep V1 conservative.

Do not solve parent assignment.

If ambiguity means Corralio cannot safely claim the family has the gap:

suppress What Fits for that interval.

This protects the differentiation:

Team apps know the team's gap. Corralio knows the family's weekend.

## 34. This Weekend Integration

What Fits belongs contextually inside:

This Weekend

around a real useful gap.

Do not make a standalone Nearby page the primary V1 experience.

The user should encounter the feature because Corralio understands:

* what just happened;
* what is next;
* where both commitments are;
* when the family needs to arrive;
* whether the household is actually free;
* what nearby options safely fit.

The module should feel like part of the family's weekend plan, not an advertisement or generic local-search widget.

## 35. Visual North Star

Use the approved mockup as visual direction, not literal scope.

Preserve the strongest concepts:

* You have X available
* Arrive by Y
* Food / Coffee
* compact place cards
* distance
* useful drive-time context
* ✓ Fits your schedule
* actionable Leave by X

Do not interpret the mockup as authorization for:

* free-text search;
* Breweries tab;
* uncapped scrolling;
* generic Nearby;
* hotel actions;
* restaurant detail pages.

## 36. Default vs. Expanded Recommendations

Initial state:

Best 3 that fit

This is the primary Corralio recommendation experience.

If additional candidates pass the same quality and feasibility rules, allow:

See X more that fit

Expanded results are capped at:

10 total candidates per mode

The expanded list is not the raw 4.5A candidate pool.

Every expanded result must have passed:

* candidate-quality gate;
* operating-status rule;
* route feasibility;
* dwell-time rule;
* household availability;
* required-arrival deadline.

If only two candidates fit, show two.

Do not manufacture a third.

## 37. Recommendation Explainability

Parents should be able to understand why Corralio says something fits without seeing technical calculations.

The UI should communicate enough context to make the recommendation trustworthy.

For example:

MOD Pizza
Pizza · Italian
9 min from here · 8 min to next game
✓ Fits your schedule
Leave by 1:31 PM

Do not expose:

* Overture confidence;
* matcher versions;
* route cache details;
* internal ranking score;
* evidence counts.

Those are implementation details.

## 38. Arrival Preference UX

If team-level arrival preference is implemented, keep it lightweight.

Conceptually:

Game arrival
30 minutes early
Change

Do not force this during onboarding.

The default should allow What Fits and leave-by to work immediately.

The setting should live naturally with the team or planning settings.

If the parent changes the team arrival preference:

* future required-arrival calculations use the new value;
* affected What Fits calculations become stale/recomputed;
* existing schedule event start times remain unchanged.

Do not mutate imported ICS event times.

## 39. Arrival Provenance in UI

Do not burden the main UI with technical provenance.

But where useful, allow a lightweight explanation such as:

Arrive by 2:00 PM
Based on your team's 30-minute arrival setting

or:

Arrive by 2:00 PM
Estimated arrival time

If the schedule explicitly supplied the requirement:

Arrive by 2:00 PM
From team schedule

Exact copy may be refined during implementation.

The product must not imply schedule authority when Corralio generated the value from a default.

## 40. Recalculation / Staleness

What Fits depends on mutable inputs.

A previously calculated recommendation becomes stale when relevant inputs change, including:

* previous event timing;
* next event timing;
* previous venue/location;
* next venue/location;
* required-arrival setting;
* team arrival preference;
* household conflict state;
* candidate pool/release;
* candidate operating eligibility;
* route assumptions/cache according to existing routing policy;
* dwell-time policy version.

Audit existing invalidation conventions and reuse them.

Do not show a stale:

✓ Fits your schedule

after an input has materially changed.

## 41. Schedule Refresh

ICS refresh may alter:

* event time;
* event end;
* location;
* event cancellation/removal;
* event ordering.

After a successful refresh, affected What Fits results must be re-evaluated or invalidated.

Do not let What Fits failure:

* fail schedule refresh;
* mark source unhealthy;
* alter schedule-source health incorrectly.

Recommendation intelligence remains best-effort enrichment.

## 42. Event End Time

Audit the reliability of imported event end times.

A usable gap requires a credible starting point.

If ICS supplies `DTEND`, audit whether it is consistently meaningful across representative sports feeds.

If event end time is missing or unreliable, do not silently invent precision.

Stage 1 must report:

* percentage of representative events with usable end time;
* patterns for missing/placeholder durations;
* whether a deterministic fallback is justified.

If a fallback is required, make it:

* explicit;
* conservative;
* versioned;
* clearly distinguishable from schedule-provided end time.

Do not build sport-specific game-duration prediction unless explicitly approved.

## 43. Cancelled / All-Day / Non-Sports Events

Audit current event classification.

Do not create What Fits around:

* cancelled events;
* all-day placeholders;
* events without usable timing;
* events without usable routing locations;
* clearly non-actionable schedule entries.

Household events may still affect availability even when they are not recommendation anchors.

Reuse existing event semantics where possible.

## 44. Household Availability — Conservative V1

The household-aware rule must remain implementable.

For V1:

If another relevant household event overlaps the candidate gap such that Corralio cannot safely conclude the family has the proposed free interval:

do not offer What Fits for the full interval.

Do not attempt to infer:

* which parent drives which child;
* whether there are two cars;
* whether one parent can split off;
* whether another caregiver is available.

Those are future coordination features.

Conservative suppression is preferable to falsely telling the family they are free.

## 45. Candidate Pre-Filtering

Before routing candidates, use deterministic cheap filters.

At minimum consider:

* candidate active status;
* pool mode;
* confirmed-closed exclusion;
* straight-line distance;
* intent priority;
* obvious inability to fit based on lower-bound timing where calculable.

Do not re-run Overture classification.

Do not query discarded 4.5A candidates.

The objective is to keep routing bounded while preserving enough candidate diversity to produce useful recommendations.

## 46. Routing Failure

If one candidate's route lookup fails:

* do not fail the whole What Fits module;
* exclude that candidate from a confident `Fits` result;
* continue evaluating other bounded candidates where safe.

If routing fails for all candidates:

* do not claim any candidate fits;
* degrade gracefully;
* preserve the rest of This Weekend.

Use existing external-call logging/governance conventions.

## 47. Route Reuse

Audit whether route results can legally and technically be reused under the existing routing-provider contract.

Reuse existing approved route results when:

* origin/destination pair is unchanged;
* provider/policy permits reuse;
* result is within the existing accepted staleness policy.

Do not invent a new persistence/caching policy in 4.6.

If 4.6's candidate routing introduces a materially different route-storage requirement, stop and report before implementation.

## 48. Safety Buffer

Audit whether the existing routing/leave-by system already has an appropriate buffer beyond the team arrival buffer.

Do not accidentally double-count:

* arrival buffer;
* routing/departure buffer;
* dwell time.

Define the arithmetic explicitly.

Conceptually:

required arrival time
minus candidate → next venue drive
minus routing safety/departure buffer if approved
=
leave candidate by

The team arrival buffer has already been used to determine required arrival and must not be subtracted again.

## 49. Dwell-Time Versioning

Dwell-time assumptions must be centrally defined and versioned.

Do not scatter constants through UI components.

Conceptually:

`what_fits_policy_version`

should identify the active combination of:

* minimum gap;
* dwell times;
* routing safety buffer;
* ranking rule;
* feasibility rule.

Exact implementation may differ based on repository conventions.

The goal is reproducibility.

## 50. Recommendation Result Persistence

Audit whether recommendation results should be:

* computed server-side on demand;
* cached/persisted;
* partially precomputed;
* or another bounded approach.

Do not persist large recommendation snapshots merely because it is convenient.

If persisted, retain only the minimum needed for:

* stable rendering;
* invalidation;
* audit/debugging;
* bounded analytics.

Do not copy sensitive household schedule details into shared/public tables.

All What Fits results are household-scoped/private.

## 51. Privacy

What Fits combines:

* children's schedules;
* event locations;
* household conflicts;
* timing;
* route calculations.

Treat all recommendation state as sensitive household planning data.

Require:

* household-scoped access;
* RLS where persisted;
* server-side validation;
* no public/shared exposure of family gap calculations;
* sanitized analytics;
* no child names/event text in analytics payloads.

Do not allow What Fits usage to become public venue evidence.

4.4/4.4B/4.4C own venue evidence.

## 52. Analytics

Instrument the product behavior minimally and privately.

Track sanitized events such as:

* What Fits eligible gap identified;
* module rendered;
* Food selected;
* Coffee selected;
* top recommendation clicked;
* See More opened;
* expanded recommendation clicked;
* directions action clicked where implemented;
* no-fit state;
* arrival-setting changed.

Do not send:

* child name;
* raw venue address;
* raw schedule text;
* household origin;
* private notes.

Reuse existing analytics conventions.

## 53. "See More" as Product Signal

Track whether parents frequently open:

See X more that fit

This is useful evidence about ranking quality.

If most parents accept the top 3:

ranking may be doing its job.

If many parents consistently expand:

top-3 ranking may not reflect actual preferences.

Do not build personalization in response yet.

Measure first.

## 54. Success Metrics

Report at minimum:

Eligible Gap Count

Household-aware gaps meeting the basic minimum requirements for evaluation.

What Fits Coverage

`eligible gaps with >=1 feasible recommendation / eligible gaps evaluated`

Report separately for:

* Food;
* Coffee;
* either mode.

Recommendation Depth

Distribution of:

* 0 fitting;
* 1;
* 2;
* 3;
* 4–10.

Interaction

* top-3 recommendation interaction rate;
* See More open rate;
* expanded-result interaction rate;
* directions/action rate where implemented.

Arrival Source

Distribution of required-arrival provenance:

* explicit ICS;
* team preference;
* Corralio default.

Routing Cost

* route calls per evaluated gap;
* cache/reuse rate;
* provider failures;
* cost/usage estimate.

Return Behavior

Where existing analytics safely permit:

compare subsequent weekly return behavior for activated families exposed to What Fits.

Do not claim causation from a small launch sample.

## 55. Primary Business Metric

The overall Corralio primary metric remains:

Weekly returning families with multiple connected schedules

4.6 is successful strategically if it strengthens that recurring behavior.

Do not optimize 4.6 around recommendation clicks at the expense of family planning utility.

The ultimate question is:

Did Corralio make the weekend easier enough that the family comes back next weekend?

## 56. Standard vs. Pro

4.6 V1 is part of proving the core Corralio product.

Do not put the basic What Fits experience behind Pro during launch validation.

We need to learn whether families value the behavior before deciding final entitlement.

Future advanced intelligence may become Pro, including:

* live traffic;
* smarter predictive timing;
* proactive alerts;
* preference learning;
* more advanced coordination.

Do not cripple the launch test through premature monetization.

## 57. No Hotel / Travel Expansion

Even if Corralio already knows hotel context:

do not add hotel-aware What Fits behavior in 4.6.

No:

* Back to Hotel;
* hotel → venue routing;
* hotel gap optimization;
* hotel recommendations.

Those belong to later travel work.

Do not let a compelling mockup expand this slice.

## 58. No Generic Search

No search box in V1.

Do not build:

* name search;
* cuisine search;
* brand search;
* "Jimmy John's" search;
* "Mexican" search.

Food tags are retained for future use.

The V1 hypothesis is automatic schedule-aware recommendations.

## 59. No Generic Nearby Destination

Do not add a main-navigation:

Nearby

destination in this slice.

What Fits appears because the family has an actionable schedule gap.

This preserves the differentiation:

Team apps organize the team. Corralio plans across the family.

## 60. Query / Compute Bounds

Stage 1 must establish hard bounds for:

* gaps evaluated per household/render or processing run;
* candidates prefiltered per mode;
* candidates routed per mode;
* route calls per gap;
* route calls per household;
* execution duration;
* retry behavior.

Do not create unbounded N×M routing across a large weekend.

Prefer evaluating the most relevant upcoming gaps.

Report the chosen bounds and rationale.

## 61. Failure Isolation

What Fits is enrichment.

Failure must never:

* break This Weekend;
* fail schedule ingestion;
* fail schedule refresh;
* remove events;
* alter canonical/provisional venue truth;
* mutate Overture candidate data;
* affect HotelPlanner;
* mark a family/source unhealthy.

Graceful absence is always acceptable.

## 62. Required Unit / Integration Tests

At minimum cover:

Required arrival

* explicit imported arrival;
* team preference;
* Corralio default;
* provenance correct;
* preference change invalidates result.

Gap

* same-team normal gap;
* next event required arrival reduces raw gap;
* gap below minimum;
* household conflict suppresses gap;
* missing end time behavior;
* cancelled event excluded.

Candidate modes

* Food;
* Coffee;
* confirmed closed excluded;
* status unknown handled according to policy;
* missing food tags allowed.

Feasibility

* candidate comfortably fits;
* outbound drive makes it fail;
* dwell time makes it fail;
* second route leg makes it fail;
* arrival buffer not double-counted;
* different next venue;
* same next venue.

Ranking

* deterministic;
* quick options prioritized under tight window according to approved rule;
* no personalized behavior;
* tie stable.

Top 3 / See More

* 1 result;
* 2 results;
* 3 results;
* maximum 10 expanded;
* expanded results all independently fit;
* raw non-fitting candidates never exposed.

Failure

* one route fails;
* all routes fail;
* no candidates;
* missing venue coordinates;
* stale recommendation invalidated.

## 63. Household / Privacy Tests

Cover:

* another child's overlapping event suppresses false free-time claim;
* no cross-household recommendation access;
* analytics contain no raw sensitive values;
* persisted recommendation state, if any, is household-scoped;
* household deletion cleans up persisted private What Fits state according to existing deletion rules.

## 64. Routing Governance Tests

Verify:

* bounded route-call count;
* existing route reuse where legal;
* quota behavior;
* retry behavior;
* provider failure isolation;
* no unexpected Geocodio calls;
* no unexpected Overture extraction;
* no live-traffic provider introduced.

## 65. Browser UAT Scenarios

Use disposable/safe UAT data consistent with existing conventions.

At minimum verify:

Scenario A — Food fits

Prior event ends. Next event has required arrival sufficiently later. At least three Food candidates fit.

Expected:

* available-time hero;
* Arrive by;
* top 3;
* Fits badges;
* candidate Leave by;
* See More if >3.

Scenario B — Coffee only

Gap is too constrained for Food under dwell policy but Coffee fits.

Expected:

* Food has no safe result;
* Coffee provides safe recommendations;
* no forced Food recommendation.

Scenario C — Nothing fits

Expected:

* no false recommendation;
* graceful no-fit state/minimal absence.

Scenario D — Household conflict

Another child's commitment occupies the apparent team gap.

Expected:

* Corralio does not claim the full interval is free;
* What Fits suppressed or conservatively adjusted according to implemented policy.

Scenario E — Team arrival preference

Set team to arrive earlier.

Expected:

* required arrival changes;
* fitting candidate set may shrink;
* Leave by recalculates.

Scenario F — Different next venue

Expected:

* second route leg uses next venue;
* candidate feasibility changes appropriately.

## 66. Visual UAT

Compare browser implementation against the approved north-star direction.

Verify:

* available time is visually prominent;
* arrival constraint is obvious;
* Food/Coffee choice is simple;
* top 3 are easy to scan;
* See More is secondary;
* Fits signal is understandable;
* Leave by is actionable;
* no generic-directory feel;
* no search box;
* no Breweries;
* no hotel card.

Do not chase pixel perfection at the expense of correctness.

## 67. Stage 1 Workflow

Before production migration/application:

1. Audit repository and representative ICS data.
2. Report arrival/warmup parsing findings.
3. Report event-end-time reliability.
4. Propose exact default arrival buffer(s).
5. Propose exact dwell-time policy.
6. Confirm 45-minute minimum gap or report evidence for changing it.
7. Define deterministic feasibility arithmetic.
8. Define deterministic ranking.
9. Define route prefilter/call bounds.
10. Define invalidation/staleness behavior.
11. Implement schema/code.
12. Prepare unapplied migration if needed.
13. Add offline tests.
14. Prepare catalog verifier if schema changes.
15. Prepare rollback-only behavioral verifier if schema changes.
16. Run TypeScript.
17. Run lint.
18. Run all four production builds:
   * `corp-app`
   * `corralio-app`
   * `referee-app`
   * `ti-web`
19. Run `git diff --check`.
20. Report route/API usage implications.
21. Commit locally only after full diff review.

Do not push.

Do not deploy.

Do not enable cron/background processing.

## 68. Stage 1 — CPO Decision Gate

Before implementing parent-facing What Fits?, stop after the repository/data/product audit and present one focused decision packet to the CPO.

Do not ask the CPO to redesign settled architecture.

Do not begin Stage 2 implementation until the following product semantics are explicit enough that implementation does not require Codex to invent consumer behavior.

The decision packet must be concise, evidence-based, and where possible include a recommended V1 default rather than an open-ended question.

Resolve:

1. **Required Arrival Time hierarchy**
   * exact precedence among schedule-derived arrival/report information, team-level parent setting, and Corralio default;
   * exact behavior when schedule information is ambiguous;
   * exact labeling when Corralio derives the requirement rather than receiving it from the schedule.
2. **Default arrival buffer**
   * exact V1 default when no reliable schedule-derived or team-specific requirement exists;
   * whether game and practice defaults differ.
3. **Team-level arrival setting**
   * exact parent-facing setting;
   * whether it applies to all team events or can distinguish event types;
   * where it is configured;
   * ensure it is not forced during initial onboarding.
4. **Game vs. practice handling**
   * determine whether V1 requires different default arrival behavior;
   * preserve conservative behavior for unknown/ambiguous event types.
5. **Event-level override**
   * determine whether an individual event needs a V1 arrival override;
   * do not add this merely for theoretical completeness.
6. **Minimum gap**
   * validate or revise the working 45-minute raw-gap threshold using representative weekend data;
   * make clear that this threshold only determines whether What Fits is considered;
   * it does not mean any candidate necessarily fits.
7. **Dwell assumptions**
   * approve simple deterministic V1 dwell times for Coffee, Quick Service, Sandwiches, Pizza, and Other Food;
   * do not build restaurant-specific dwell prediction.
8. **Food / Coffee behavior**
   * confirm the V1 parent-facing modes remain Food and Coffee;
   * no generic Nearby mode; no Breweries tab; no Essentials mode; no free-text search.
9. **Food prioritization**
   * approve deterministic ranking behavior that generally favors faster-use categories in tighter windows;
   * quick_service, sandwiches, and pizza should not be crowded out by slower/lower-priority Food options;
   * food tags remain descriptive metadata and do not become preference-learning/ranking inputs in V1.
10. **Operating-status behavior**
   * `confirmed_closed` must never be recommended;
   * decide the exact eligibility and presentation treatment for sufficiently credible `status_unknown`;
   * never claim Open or Open Now unless the available data actually proves that claim.
11. **Household-aware suppression**
   * define conservative behavior when another household commitment makes the apparent team-level gap unavailable;
   * do not infer parent assignments, two-car availability, caregiver availability, or independent transportation;
   * when Corralio cannot safely conclude the family has the interval available, suppress or conservatively reduce What Fits rather than presenting false certainty.
12. **Recommendation-card semantics** — approve exact parent-facing meaning and wording for: available-time framing; required arrival / "Arrive by" framing; candidate name; Food/Coffee context; useful distance and/or drive context; `✓ Fits your schedule`; actionable Leave by time; estimated/non-live routing treatment where applicable; status-unknown treatment if such candidates remain eligible. The card must communicate a planning answer, not merely describe a nearby place.
13. **Top 3 + See More**
   * default presentation: Best 3 that fit;
   * when additional candidates independently pass all quality, route, and schedule-feasibility rules, allow: See X more that fit;
   * expanded result set should be capped at approximately 10 total fitting candidates per mode;
   * never expose the raw 15-candidate Overture pool directly;
   * expansion must not weaken feasibility requirements.
14. **No-fit behavior** — define exact behavior when: the gap is too short; household context makes the interval unsafe; locations cannot be routed confidently enough; no Food candidates fit; no Coffee candidates fit; no candidates of either mode fit. No-fit is a valid product result. Do not manufacture a recommendation simply to avoid an empty state.
15. **Success metrics** — approve the exact analytics contract for evaluating 4.6, distinguishing at minimum: eligible gap identified; What Fits surfaced; What Fits opened/viewed; mode selected; candidate shown; candidate selected; directions/action initiated where applicable; See More opened; no-fit encountered; reason-class for suppression/no-fit using sanitized taxonomy; subsequent weekend return. Do not treat recommendation impressions alone as success. The strategic retention question remains whether useful planning moments contribute to families returning on subsequent weekends.

## 69. Stage 1 Output

At the end of Stage 1, provide:

* repository/data audit findings;
* representative ICS arrival/report-time findings;
* existing household/conflict primitives available for reuse;
* existing routing primitives available for reuse;
* exact 4.5A candidate contract available to 4.6;
* gaps between current implementation and required 4.6 behavior;
* recommended answers to each unresolved CPO decision;
* any genuine blocker discovered.

Separate:

Repository fact

from:

Product recommendation

from:

CPO decision required

Do not turn uncertain product preferences into architectural facts.

## 70. Stage 1 Stop Condition

After presenting the decision packet:

STOP.

Do not implement speculative product decisions while waiting for CPO approval.

Proceed to Stage 2 only after the required CPO decisions are resolved.

If repository evidence exposes a genuine architecture/security blocker, report it explicitly.

Do not create a new architecture slice merely because implementation requires ordinary bounded engineering work.

---

# Stage 2 — Implementation

## 71. Stage 2 Objective

Implement the smallest credible version of What Fits? that answers:

We have time between sports commitments. What can we actually do without being late to the next one?

The feature must combine household schedule context, required arrival time, route feasibility, deterministic dwell assumptions, and 4.5A-vetted candidate intelligence to produce a small recommendation set that is meaningfully more useful than generic Nearby search.

## 72. Eligibility

What Fits must only be considered when the relevant interval satisfies the CPO-approved minimum-gap behavior.

Eligibility alone does not qualify any place as fitting.

A candidate must still independently satisfy all route, dwell, arrival, quality, operating-status, and household-safety requirements.

## 73. Required Arrival Time

Implement the exact CPO-approved hierarchy.

Do not use the event's displayed start time as though it automatically equals the family's required arrival time.

If the required arrival is derived from a Corralio default or parent setting rather than explicitly supplied by the schedule, preserve that distinction in product semantics.

Do not call a value warmup time unless the underlying schedule actually represents it that way.

Internal product concept: Required Arrival Time.

## 74. Household-Aware Gap Calculation

Do not calculate an apparent gap using only one team or child.

Use existing household schedule/conflict information to determine whether the interval can reasonably be treated as available to the family.

Example: Child A appears to have a two-hour gap, but Child B has a game inside that interval. Corralio must not automatically tell the household: You have two hours available.

V1 does not require solving parent assignment, two-car availability, caregiver assignments, or shared-custody logistics. Where those unknowns prevent a safe family-level conclusion, use the CPO-approved conservative suppression/reduction behavior.

## 75. Route Feasibility

A candidate may receive `✓ Fits your schedule` only after evaluating the complete required movement: previous/current event location → candidate → next event location, accounting for route duration to candidate, CPO-approved dwell/activity time, route duration from candidate to the next commitment, required arrival deadline, and the approved routing/safety buffer.

Do not qualify a candidate using venue-to-candidate proximity alone. Support same next venue and different next venue. Reuse existing approved routing infrastructure. Do not introduce live traffic unless separately approved.

## 76. Estimated Routing Semantics

Where routing is non-live, do not imply traffic-aware certainty. Preserve the existing Corralio principle that non-live leave-by calculations are estimated. The UI may be decisive about the computed planning recommendation while remaining accurate about the quality of its routing inputs.

## 77. Candidate Source

4.6 consumes the clean candidate pool produced by 4.5/4.5A. Do not perform generic consumer place search, create a second POI ingestion architecture, bypass 4.5A quality rules, expose the raw candidate pool, use household origins to expand Overture extraction, or mutate canonical venue truth.

## 78. Food / Coffee

Expose only the CPO-approved V1 modes: Food | Coffee. Food may internally use the existing intent taxonomy (`quick_service`, `pizza`, `sandwiches`, `brewery`, `other_food`). Do not expose that taxonomy as a set of top-level browsing modes unless explicitly approved later.

## 79. Food Tags

`food_tags` may support concise descriptive presentation if approved and useful. They must not become V1 acceptance, rejection, ranking, preference-learning, deduplication, or diversity inputs. Do not create a brand-to-cuisine inference table.

## 80. Deterministic Ranking

Use a deterministic, inspectable, versioned ranking approach. Do not implement ML ranking. Ranking should prioritize candidates that best satisfy the approved combination of feasibility, useful fit for the available window, candidate quality, deterministic category priority, route burden, and approved diversity behavior. Do not simply sort by straight-line distance.

## 81. Best 3

For each mode, show the Best 3 that fit by default. These are recommendations, not merely the first three records returned from storage. Every displayed candidate must independently pass the full 4.6 qualification pipeline.

## 82. See More

If more than three candidates qualify, See X more that fit may expose additional qualifying candidates up to the approved cap, approximately 10 total per mode. Expanded candidates must pass the identical qualification rules. Do not weaken the threshold after expansion. Do not expose non-fitting candidates under a generic "nearby" fallback.

## 83. No Search

Do not add free-text place search, restaurant-name search, cuisine search, or generic Nearby search. The V1 hypothesis is: Corralio chooses useful options that fit the family's schedule. Search must earn its place through later evidence.

## 84. No-Fit State

No-fit must be treated as a legitimate planning answer. Prefer an accurate "Nothing nearby fits this window." or CPO-approved equivalent over recommending an option that risks making the family late. Where useful and truthful, distinguish between insufficient available time, household schedule conflict, insufficient routing confidence, no qualifying Food, and no qualifying Coffee. Do not expose technical pipeline details to parents.

## 85. This Weekend Integration

What Fits belongs inside the existing This Weekend planning experience. Do not create a separate generic place-discovery product. The user should encounter What Fits in the context of the actual interval between family commitments. Preserve the primary product hierarchy: This Weekend first. What Fits is an intelligent action within that plan.

## 86. Recommendation Card

Implement the CPO-approved card semantics. The visual north star should preserve prominent available-time framing, prominent arrival constraint, compact recommendations, useful route/distance context, `✓ Fits your schedule`, and actionable Leave by time. Avoid clutter that makes the experience resemble a restaurant directory.

## 87. Action Semantics

Any directions/navigation action must use the actual candidate relevant to the planning recommendation. Do not imply Corralio controls third-party navigation accuracy or live traffic when it does not. Do not add reservation functionality. Do not add ordering functionality. Do not add restaurant-specific operational predictions.

## 88. Operating Status

Never recommend `confirmed_closed`. Apply the CPO-approved policy to `status_unknown`. Never render Open or Open Now from absence of closure evidence.

## 89. Failure Behavior

What Fits must fail conservatively — missing event location, unresolved route, stale/unusable candidate, missing next-event location, household ambiguity, routing timeout, or no qualifying candidates. A failure in What Fits must not make the underlying event or This Weekend plan unusable.

## 90. Performance and Cost

Reuse approved server-side routing boundaries, caching, deduplication, timeout, and cost controls. Do not issue uncontrolled route requests on every render. Avoid computing routes for candidates that can already be rejected by cheaper deterministic eligibility checks. The implementation should narrow candidates before expensive routing work where correctness permits.

## 91. Privacy

What Fits must preserve the private/public boundary. Never send private household origins, child-sensitive schedule details, raw private event locations, private notes, or household assignments into public venue evidence, Overture extraction, public analytics, or ordinary logs. Private household data remains household-scoped. Routing involving private locations must remain within approved protected server-side boundaries.

## 92. Analytics

Use sanitized IDs and bounded taxonomies. Do not log or emit child names, home addresses, raw private event addresses, private notes, schedule-source credentials, auth/share/handoff tokens, or trusted HotelPlanner configuration. Instrument enough to answer: do families encounter eligible gaps; does What Fits produce qualifying recommendations; do parents act on them; how often does See More indicate the top-three ranking was insufficient; how often does Corralio correctly produce no-fit/suppression; do families receiving useful What Fits moments return on subsequent weekends.

## 93. No Monetization Gate

Do not put What Fits behind a permanent Pro entitlement as part of this slice unless separately approved. Pro remains a product hypothesis. The immediate job is to determine whether this planning intelligence creates recurring consumer value.

## 94. No Hotel / Travel Expansion

Do not add Back to Hotel, hotel-aware routing, hotel-origin gaps, lodging recommendations inside What Fits, HotelPlanner actions, or travel-intent expansion. Those belong to later travel work.

## 95. No Venue Architecture Expansion

Do not redesign canonical venue ownership, provisional venue creation, provisional lifecycle, Overture ingestion architecture, canonical promotion, or 4.5B. 4.6 consumes existing venue/place intelligence. It does not become a venue-governance slice.

---

# Stage 2 Verification Workflow

## 96. Automated Tests

Add deterministic tests covering at minimum: gap below threshold; gap exactly at/around threshold boundaries; same-venue next event; different-venue next event; Food candidate fits; Food candidate does not fit; Coffee candidate fits; route-out fits but route-to-next-event makes candidate fail; dwell time makes otherwise-nearby candidate fail; required arrival buffer makes candidate fail; schedule-derived arrival requirement; team-setting-derived arrival requirement; default-derived arrival requirement; household conflict suppresses/reduces apparent gap; confirmed-closed candidate excluded; approved status-unknown behavior; fewer than three candidates; exactly three candidates; more than three candidates; See More cap; every expanded candidate independently fits; no-fit behavior; routing failure; missing location; candidate-quality exclusion; deterministic ranking; analytics redaction.

## 97. Household Safety Tests

Explicitly test multi-child/multi-team weekends.

**Scenario A — true family gap.** No household commitments interfere. Expected: What Fits may recommend candidates.

**Scenario B — sibling commitment inside apparent gap.** One child's schedule appears open, but another child's event occupies the interval. Expected: Corralio does not falsely present the full interval as safely available.

**Scenario C — ambiguous household logistics.** The system lacks enough information to know whether commitments can be handled independently. Expected: apply approved conservative behavior; do not invent parent/car/caregiver assignments.

## 98. Route Feasibility Tests

For each representative candidate verify the actual calculation path: current event → candidate → next event → required arrival. Confirm route durations are the approved source; dwell is applied once and correctly; required arrival is respected; safety/routing buffer is applied correctly; displayed leave-by matches the underlying calculation; non-live results use approved estimated semantics.

## 99. Candidate Quality UAT

Use real 4.5A candidate data from bounded representative venues. Confirm obvious false positives, closed records, stale identities, physical duplicates, and unsuitable category contamination do not appear in the parent-facing recommendations where 4.5A should already exclude them. Do not demand perfect global POI truth — the product requirement is that obvious bad recommendations are unlikely to enter the top parent-facing results.

## 100. Recommendation UAT

For representative weekend gaps, manually answer: if I were a sports parent looking at this interval, does this recommendation make sense? Then verify technically why each displayed result qualifies. The test is not whether a place is nearby — the test is whether the family can actually do this and still make the next commitment on time.

## 101. Top 3 UAT

For cases with more than three fitting candidates: inspect the default three; confirm they are plausibly the best recommendations under the deterministic ranking; open See More; confirm every additional candidate exposed through See More independently passes the same feasibility, quality, and household-safety checks as the default three — never a weaker bar. A candidate that only appears because the raw pool has room, without independently satisfying route feasibility, dwell time, operating status, and household availability, is a defect, not an expanded result.

## 102. No-Fit and Suppression UAT

Reconfirm, in the browser, the exact no-result behaviors already exercised at the unit level (Section 96) and in Scenario C/D of Section 65/97: a too-short gap shows no module at all; a household-suppressed gap does not present false availability; a gap with zero fitting Food and zero fitting Coffee shows the approved no-fit state rather than a forced recommendation. Confirm none of these degrade This Weekend's own rendering, and that independent test-fixture cleanup leaves zero retained rows, consistent with every prior slice's UAT discipline.

## 103. Stage 2 Sign-Off

Before reporting a verdict, confirm: all automated tests (Section 96) pass; household/privacy tests (Section 97) pass; route feasibility tests (Section 98) pass; candidate-quality, recommendation, top-3/See-More, and no-fit/suppression UAT (Sections 99–102) all pass against real or realistic fixture data; TypeScript, lint, `git diff --check`, and all four production builds (`corp-app`, `corralio-app`, `referee-app`, `ti-web`) pass; independent cleanup-zero confirmation for any disposable fixtures used. No push, deployment, cron, or backfill without separate explicit authorization.

---

## Final Restrictions

- Do not begin runtime/schema implementation until `SLICE 4.5 COMPLETE LOCALLY` and `SLICE 4.5A READY FOR 4.6` (or `SLICE 4.5A READY AFTER LISTED FIXES` with the fixes applied) are both confirmed — Slice 4.5's own Stage 2 and Slice 4.5A's migration application plus Stage 2 atomic replacement are each independently required; audit and CPO-decision-packet preparation (Sections 1, 68–70) may proceed in the meantime.
- No free-text search, no Breweries tab, no Essentials, no generic Nearby destination — this stays a curated schedule-aware recommendation, not a directory, regardless of how compelling the reviewed mockup is.
- Food and Coffee are the only V1 modes, consuming 4.5A's existing `pool_category`/`intent_category`/`food_tags`/`operating_status` fields exactly as specified — no new ingestion, no reclassification, no new category.
- Show Best 3 that fit by default; a "See X more" action may expose up to 10 total per mode, and every expanded candidate must independently pass the identical feasibility/quality/household-safety gates as the default three — never a weaker bar for expanded results.
- Required arrival time follows the exact three-tier hierarchy (explicit ICS signal → team preference → Corralio default), with provenance preserved and never presented as more authoritative than it is.
- Household-aware availability is mandatory: never present a gap as available when another relevant household commitment overlaps it and Corralio cannot safely rule out a conflict. Conservative suppression beats false certainty. Do not attempt to solve parent/car/caregiver assignment.
- The arrival buffer is applied exactly once, inside required-arrival-time resolution — never subtracted a second time as a separate routing/departure buffer. Define and test this arithmetic explicitly.
- Feasibility and ranking are fully deterministic and versioned — no ML, no AI reasoning, no personalization, no ranking purely by Overture confidence or straight-line distance.
- Operating status governs eligibility strictly: `confirmed_closed` is never recommended, `status_unknown` may be eligible per the CPO-approved policy, and "open"/"open now" is never claimed without data that actually establishes it.
- No error state under any failure condition — a too-short gap, a suppressed household conflict, a missing venue/candidate pool, or a routing failure all resolve to absence, never a visible error.
- No hotel/lodging UI, handoff, or hotel-aware routing of any kind — that belongs to later travel work, not this slice, regardless of what Corralio may already know about a booked stay.
- No venue identity, Overture ingestion, provisional-venue, evidence, canonical-promotion, or 4.5B architecture changes of any kind — 4.6 is a pure consumer of what 4.4/4.4B/4.4C/4.5/4.5A already provide.
- No permanent Pro paywall on the core What Fits experience during launch validation.
- Privacy and analytics: all recommendation state is household-scoped and RLS-protected where persisted; analytics use sanitized IDs and bounded taxonomies with no child names, raw addresses, schedule text, or household origins.
- Routing reuses the existing Slice 4.3 abstraction and provider exactly — no new provider, no live traffic without separate authorization, bounded and reported call counts per gap, existing route-reuse policy only (no new caching architecture invented here).
- Run all four production builds and complete Stage 2 sign-off (Section 103) before any future push. No push, deploy, cron, or backfill without separate authorization.

## Final Verdict

Report exactly one:

- `SLICE 4.6 COMPLETE LOCALLY`
- `SLICE 4.6 READY AFTER LISTED FIXES`
- `SLICE 4.6 BLOCKED BY AUDIT FINDING`
- `SLICE 4.6 NOT READY`
