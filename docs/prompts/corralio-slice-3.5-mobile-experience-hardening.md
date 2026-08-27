# Corralio Slice 3.5 — Mobile Experience Hardening
## Launch-Blocking End-to-End Mobile UX and UAT

You are working inside the existing TournamentInsights / RefereeInsights / Corralio monorepo.

Slice 3.4 — Schedule Connection Activation is complete locally, **and has passed independent CPO live-browser UAT (2026-08-27)** — platform picker, per-platform instructions, connected-schedule management, and privacy copy were all verified against the running app on real household data, verdict PASS.

Slices 4.3–4.6 and their accepted architecture/product behavior are complete locally.

This slice does not add a new Corralio capability.

Its purpose is:

> **Make the existing Corralio core loop feel excellent in a mobile-sized browser experience before families are invited into the launch pilot.**

Do not push or deploy.

Do not begin Slice 3.6 notifications/traffic work.

If independent CPO Slice 3.4 UAT identifies a material blocker before this slice begins, resolve that gate first. *(No blocker was identified — see above. Proceed.)*

---

# 1. Product Standard

Corralio is a mobile-first sports-family planning product.

The target context is a parent:

- standing in a parking lot;
- sitting in a gym;
- walking between fields;
- getting children out the door;
- checking tomorrow's schedule one-handed;
- copying a calendar link from another sports app;
- trying to understand a busy weekend quickly.

The standard is not:

> The responsive layout technically works.

The standard is:

> **A parent can comfortably complete Corralio's core job from their phone without confusion, precision tapping, unnecessary navigation, or needing desktop context.**

The desired outcome remains:

> **We've got the weekend figured out.**

---

# 2. Core Mobile Journey

Audit and UAT the complete existing journey:

**Signed-out landing**
→ **Sign up / sign in**
→ **Household / Family**
→ **Add child/team as required**
→ **Connect first schedule**
→ **Connect another schedule**
→ **See This Weekend**
→ **Understand conflicts**
→ **Understand estimated leave-by**
→ **Use What Fits when eligible**
→ **See More when available**
→ **Open directions**
→ **Return to This Weekend**

Do not evaluate these as isolated screens only.

Evaluate the transitions between them.

---

# 3. Audit First

Before changing implementation, inspect current repository and actual rendered behavior.

Review at minimum:

- signed-out landing;
- authentication entry/return;
- Family;
- child/team creation and editing;
- Slice 3.4 schedule-source picker;
- platform instructions;
- calendar-link input;
- connection loading/success/failure states;
- connected-schedule management;
- This Weekend;
- event cards;
- conflicts;
- estimated leave-by;
- directions chooser;
- What Fits;
- Food/Coffee toggle;
- Top 3 + See More;
- no-fit/suppression states;
- global/mobile navigation;
- loading and error boundaries.

Review existing mobile/responsive tests and conventions before adding new ones.

Repository reality wins.

Do not redesign a component merely because another design might be preferable.

---

# 4. Viewport Matrix and Testing Method

Corralio's existing mobile UAT practice (Slices 3.1, 4.3, 4.4B, 4.6, per `apps/corralio/notes.md`) uses **exact CSS-pixel emulated viewports** via Playwright or the Claude-in-Chrome browser tool — never physical devices. Follow that same practice. Do not attempt to source physical iPhone/Android hardware for this slice, and do not report or imply that physical-device testing occurred.

At minimum verify these exact viewport combinations:

### iPhone-class
- 375×812 (compact iPhone);
- 430×932 (larger iPhone).

### Android-class
- 393×851 or 412×915 (representative Android).

Use Playwright's `setViewportSize` (or equivalent direct CDP-level viewport control) as the primary method — it reliably reproduces the target width, unlike resizing an outer browser window.

If the browser tool in use cannot reliably resize its own rendering viewport (a known failure mode: the Claude-in-Chrome `resize_window` action has been observed to change the outer window dimensions without changing what is actually rendered/captured), fall back to the team's existing documented workaround — a same-origin iframe harness at the exact CSS dimensions, as used in prior UAT passes (see `notes.md`, Slice 4.4B mobile sweep). Verify the fallback actually worked (e.g. check `window.innerWidth` matches the target, or that the rendered layout visibly reflows) before treating a screenshot as evidence. Do not report a viewport as "tested" if the visual evidence shows a desktop-width render.

Record, for each viewport, both the pixel dimensions **and** the method used (direct Playwright/CDP viewport control vs. iframe-harness workaround) — this record is required in Section 23's notes and Section 25's report.

Browser/emulated UAT may verify responsive layout, focus/input semantics, overflow, interaction flow, directions chooser behavior, and correctly encoded navigation links. It must not claim to verify native software-keyboard obstruction, cross-app clipboard/paste behavior, physical notch/home-indicator safe areas, native Apple Maps/Google Maps/Waze handoff, or OS back-navigation after native handoff. Directions UAT must inspect the chooser and encoded links without completing external navigation.

Report every applicable physical-device-only behavior as:

`UNVERIFIED ON PHYSICAL DEVICE`

These behaviors remain required for final pre-pilot physical-device UAT, not for automated Slice 3.5 completion.

---

# 5. Mobile Interaction Requirements

Audit and fix concrete issues involving:

- touch-target size;
- spacing between adjacent controls;
- accidental taps;
- thumb accessibility;
- sticky/fixed UI;
- safe-area handling;
- horizontal overflow;
- clipped content;
- overlapping content;
- modal/drawer behavior;
- back navigation;
- scroll restoration;
- focus behavior;
- visible focus where applicable;
- keyboard opening/closing;
- keyboard covering primary actions;
- paste behavior;
- long text wrapping;
- loading feedback;
- disabled states;
- error recovery;
- perceived responsiveness.

Do not introduce a new design system.

Reuse existing Corralio primitives and visual language.

---

# 6. Schedule Connection Mobile UAT

Slice 3.4 is particularly important on mobile because the parent may be switching between a team app and Corralio.

Verify:

**Where does this schedule live?**
→ platform choice
→ instructions
→ calendar-link field
→ paste
→ validation/import
→ success
→ connect another schedule
→ This Weekend.

Approved picker remains:

- GameChanger
- TeamSnap
- Stack Team App
- Other calendar.

Do not add platforms in this slice.

### Specific mobile checks

Verify:

- tiles are comfortably tappable;
- selected state is obvious;
- instructions are readable without excessive scrolling;
- calendar-link input works well with mobile paste;
- technical ICS terminology is not required to begin;
- loading state clearly indicates work is happening;
- successful event count is visible;
- `Connect another schedule` is obvious;
- `See This Weekend` is obvious;
- switching schedule source after an error is understandable.

### Slice 3.4 follow-up

Specifically evaluate the known minor UX question, confirmed during independent CPO UAT:

> After a failed connection, is it sufficiently obvious that the parent can choose another schedule source?

If not, add the smallest explicit affordance such as:

> **Choose another schedule source**

Do not reopen the broader Slice 3.4 design.

---

# 7. This Weekend Mobile Quality

This Weekend is Corralio's hero experience.

On a phone, a parent should be able to answer quickly:

1. What's happening?
2. Which child/team?
3. Where?
4. Is there a conflict?
5. When do we need to leave?
6. What happens next?

Review:

- day hierarchy;
- event ordering;
- child/team recognition;
- event-time prominence;
- venue/location readability;
- conflict prominence;
- leave-by prominence;
- estimated-routing qualification;
- directions affordance;
- event density;
- scrolling burden;
- empty/loading/error states.

Do not turn This Weekend into a generic calendar.

Do not add feature breadth.

---

# 8. Conflict UX

Conflicts must be noticeable without overwhelming the schedule.

Verify on mobile:

- conflict state is visually distinct;
- affected events are understandable;
- text wraps correctly;
- no important action is obscured;
- the parent can understand why Corralio is warning them.

Do not add parent assignment, caregiver inference, vehicle optimization, or complex conflict resolution.

---

# 9. Leave-By UX

Preserve existing approved semantics.

Estimated/non-live routing must remain honestly labeled.

Verify:

- leave-by is visually easy to find;
- `(est.)` or approved equivalent remains clear;
- estimated drive context remains readable;
- directions remain easy to access;
- no mobile treatment accidentally implies live traffic.

Do not implement Mapbox traffic-aware routing in this slice.

That belongs to the separately approved Slice 3.6 decision/work.

---

# 10. What Fits Mobile UX

What Fits must feel like planning intelligence, not a restaurant directory.

Verify eligible real/synthetic UAT scenarios for:

- module discovery;
- `[duration] between events`;
- `Arrive by`;
- arrival provenance;
- Food default;
- Coffee toggle;
- candidate cards;
- route context;
- `✓ Fits your schedule`;
- `Leave by`;
- `Estimated drive times · No live traffic`;
- `Hours not verified` where applicable;
- Best 3;
- `See X more that fit`;
- expanded results;
- directions;
- mode-specific no-fit behavior;
- graceful absence when evaluation is unavailable.

Verify brewery candidates, if encountered, remain ordinary Food candidates with no alcohol-oriented UI.

Do not add search, Nearby, additional modes, hotel actions, or preference learning.

---

# 11. Loading and Perceived Performance

A mobile parent must understand when Corralio is working.

Audit:

- schedule validation/import;
- This Weekend loading;
- leave-by calculation;
- What Fits evaluation;
- directions preparation where applicable.

Prefer existing lightweight loading/skeleton/progress conventions.

Avoid layout shifts that make controls move under the parent's finger.

Do not add speculative caching or new infrastructure solely for perceived performance.

If actual latency exposes a material infrastructure problem, report it separately.

---

# 12. Error and Recovery Quality

Test realistic failures including:

- invalid schedule link;
- private/local schedule link;
- unreachable calendar;
- no upcoming events;
- duplicate schedule;
- temporary connection failure;
- missing event location;
- unavailable route;
- missing What Fits pool;
- no qualifying What Fits result.

The parent should receive useful product language, not infrastructure terminology.

Every recoverable error should provide an obvious next action.

Do not expose:

- provider errors;
- SQL errors;
- raw URLs;
- feed contents;
- credentials;
- internal IDs;
- stack traces.

---

# 13. Accessibility Baseline

Perform a bounded launch accessibility pass.

At minimum inspect:

- semantic controls;
- labels;
- form associations;
- keyboard navigation where applicable;
- focus behavior;
- contrast;
- touch-target sizing;
- screen-reader names for icon-only actions;
- status/error announcements where existing architecture supports them;
- reduced-motion compatibility for any relevant animation.

Do not turn this into a full accessibility re-platforming project.

Fix concrete launch-impacting defects.

Report larger systemic issues separately if discovered.

---

# 14. Privacy / Sensitive Mobile Data

Mobile polish must not weaken existing security/privacy boundaries.

Do not expose:

- schedule subscription URLs after submission;
- raw feed content;
- child-sensitive schedule data outside authorized household surfaces;
- private household origins;
- provider credentials;
- private route endpoints in analytics/logging;
- auth/share/handoff tokens.

Do not add client-side data merely to make mobile rendering easier when it is currently protected server-side.

Household-scoped authorization and RLS remain authoritative.

---

# 15. Signed-Out Landing

Do not redesign completed Section K.

Verify only that the current landing experience remains high quality at mobile widths, including:

- hero hierarchy;
- logo/Corralio treatment;
- approved tagline;
- Example Weekend;
- static synthetic `via GameChanger` / `via TeamSnap` labels;
- static synthetic estimated leave-by;
- primary CTA.

The signed-out preview must remain synthetic and dependency-free.

No live Supabase, household, routing, provider, or product-data calls may enter the preview.

---

# 16. Navigation

Audit whether the current mobile navigation supports the core journey without confusion.

Do not add a new navigation architecture unless the current implementation materially prevents core-task completion.

Prioritize:

- This Weekend;
- Family;
- schedule management;
- account/settings only where necessary.

Avoid exposing internal product structure to the parent.

---

# 17. Scope Discipline

This slice MAY:

- fix responsive layout defects;
- improve touch targets;
- improve spacing;
- improve mobile hierarchy;
- improve loading/error states;
- improve bounded navigation friction;
- add the small `Choose another schedule source` recovery affordance if UAT supports it;
- fix accessibility defects;
- make existing actions easier to discover.

This slice MUST NOT:

- add new product features;
- add sports platforms;
- add direct APIs/OAuth;
- implement notifications;
- implement Mapbox traffic-aware routing;
- implement leave-soon;
- add live traffic;
- add search/Nearby;
- expand What Fits;
- add hotels/travel;
- add Pro;
- implement Slice 4.5B;
- redesign venue architecture;
- redesign schedule ingestion;
- build native iOS/Android applications.

---

# 18. Measurement

Do not add or modify analytics schemas, event vocabularies, device attributes, or analytics writers. Use the existing Slice 3.4 and Slice 4.6 measurement only. If existing measurement cannot answer a mobile-quality question, report it as unmeasured.

Do not add viewport/device fingerprinting or unnecessary device-identifying analytics.

---

# 19. Tests

Add/update deterministic tests for concrete implementation changes.

At minimum preserve coverage for:

- schedule-source picker;
- schedule connection success;
- connection recovery;
- Connect another schedule;
- See This Weekend;
- This Weekend rendering;
- conflicts;
- leave-by semantics;
- What Fits;
- Top 3 / See More;
- no-fit;
- signed-out synthetic preview;
- privacy boundaries.

Add responsive/component tests where they provide meaningful regression protection.

Do not create brittle screenshot tests for arbitrary pixel-perfect layout unless the repository already uses them appropriately.

---

# 20. Browser UAT

Stage 2 UAT must walk the product as a parent, not merely inspect pages.

## UAT fixture and provider contract

Use disposable/synthetic UAT data.

- Use a disposable household, or the repository smoke identity only after proving it has no retained Corralio household.
- Use controlled public ICS fixtures containing no credentials.
- Existing public canonical venues may be read-only inputs.
- Do not create or modify canonical venues.
- Do not create or modify provisional venues.
- Do not promote or reconcile venues.
- Do not refresh Overture.
- Prefer already-geocoded fixture events.
- Avoid external provider calls wherever possible.
- Establish and document a hard cap before any unavoidable Geocodio/OpenRouteService calls.
- Report exact provider-ledger usage.

Cleanup must independently confirm zero remaining UAT household, schedules, events, interaction measurements, engagement records, quota/provider rows, Auth fixtures, and temporary calendar objects.

Simulate unreachable or temporary connection failures through deterministic offline tests or controlled fixture responses. Do not make arbitrary outbound requests merely to manufacture failures.

Run at least:

### Journey A — New family activation

Landing
→ signup/sign-in
→ household
→ child/team
→ GameChanger connection
→ success
→ connect another schedule
→ TeamSnap/Stack/Other connection
→ success
→ This Weekend.

### Journey B — Recovery

Schedule connection
→ deliberately invalid/private feed
→ contextual error
→ recover/retry or choose another source
→ successful connection.

### Journey C — Weekend planning

This Weekend
→ inspect multiple children/teams
→ conflict
→ estimated leave-by
→ directions.

### Journey D — What Fits

Eligible gap
→ Food
→ candidate
→ See More if available
→ Coffee
→ candidate/no-fit
→ directions.

Use synthetic/disposable data where mutation is required.

Clean fixtures to zero.

Do not expose real schedule URLs in screenshots, recordings, logs, or reports.

---

# 21. Independent CPO UAT

The founder/CPO has separately completed hands-on Slice 3.4 UAT (2026-08-27, PASS — see the note at the top of this prompt).

Do not treat that as a substitute for this slice's mobile UAT.

If a further CPO review returns a concrete new 3.4 defect before 3.5 completion:

- determine whether it is a small mobile/activation-quality fix appropriate to 3.5;
- otherwise report it rather than silently broadening scope.

---

# 22. Verification

Before declaring completion run:

- focused affected tests;
- complete Corralio test suite;
- TypeScript;
- zero-warning lint;
- `git diff --check`;
- all four production builds:
  - `corp-app`
  - `corralio-app`
  - `referee-app`
  - `ti-web`.

If no database/schema change is required, do not create one.

If a material database/security change unexpectedly becomes necessary, stop and report why rather than folding it into mobile polish.

---

# 23. Notes and Commit

Update `apps/corralio/notes.md` with:

- viewports tested and the method used for each (direct Playwright/CDP viewport control vs. iframe-harness workaround);
- journeys completed;
- concrete mobile issues found;
- fixes made;
- accessibility findings/fixes;
- performance observations;
- privacy/security result;
- tests/builds;
- UAT result;
- cleanup-zero result;
- deferred issues;
- final verdict.

Review the complete diff.

Preserve unrelated worktree changes.

Commit Slice 3.5 work locally as **a small number of focused commits, grouped by area** (for example: connection-flow recovery affordance, This Weekend/conflict layout fixes, accessibility fixes) rather than forcing everything into a single commit. Each commit message should describe what it fixes and why. Do not let commit-count pressure discourage reporting the full scope of what was found.

If the audit finds no implementation defect requiring code changes, a notes/report-only closeout commit is acceptable. Do not manufacture code changes merely to create a Slice 3.5 implementation commit.

Do not push.

Do not deploy.

---

# 24. Completion Standard

Do not declare the slice complete merely because all tests pass.

The final product question is:

> **Can a sports parent comfortably complete the full core journey in each required mobile viewport, with no observed layout, interaction, accessibility, privacy, or recovery blocker?**

Physical-device-only behavior—including native software keyboards, cross-app paste, safe-area hardware, and native Maps handoff—is outside this automated slice and must be labeled unverified rather than inferred.

A minor cosmetic issue does not block completion.

Confusing navigation, difficult connection, obscured actions, broken keyboard behavior, unsafe errors, unreadable planning information, or materially poor real-phone interaction does.

---

# 25. Final Verdict

Return exactly one:

`SLICE 3.5 COMPLETE LOCALLY`
`SLICE 3.5 READY AFTER LISTED FIXES`
`SLICE 3.5 BLOCKED BY AUDIT FINDING`
`SLICE 3.5 NOT READY`

Report:

- audit findings;
- viewports tested and method used (direct Playwright/CDP viewport control vs. iframe-harness workaround) — do not report or imply physical-device testing;
- journeys completed;
- UX defects found;
- fixes implemented;
- accessibility result;
- privacy/security result;
- tests/builds;
- UAT result;
- fixture cleanup result;
- deferred non-blockers;
- local commit hash(es);
- confirmation that nothing was pushed or deployed.

Do not begin Slice 3.6.
