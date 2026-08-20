# Corralio Slice 4.1 — Family This Weekend

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

Corralio Slice 4.0C is implemented and committed locally as `a70eab63` (`feat(corralio): establish branded product shell`). Verify that prerequisite from repository evidence before editing; do not rely on the commit message alone.

Slice 4.1 builds the first deliberate version of Corralio’s flagship recurring experience inside the established branded shell:

**one family + multiple children and teams + multiple schedule sources → one clear Friday-through-Sunday plan**

This is a family-first presentation slice. It is not the conflict, routing, tournament-intelligence, or travel slice.

The intended sequence remains:

- **4.0C — Product Shell & Brand Foundation** — complete
- → **4.1 — Family This Weekend** — this prompt
- → **4.2 — Basic Conflicts**
- → **4.3 — Estimated Leave-By**
- → **4.4 — Tournament/Venue Context**
- → **4.5 — Contextual Travel**

Implement locally, update required notes, run applicable offline checks and browser UAT, and commit locally. Do not push or deploy. Do not automatically apply SQL. Preserve unrelated worktree changes and stage only Slice 4.1 files.

## 1. Goal

Turn the existing authenticated `/` weekend event list into a calm, scannable family plan that answers:

> Who needs to be where this weekend, and when?

Slice 4.1 establishes:

- a family-first weekend hierarchy;
- clear Friday, Saturday, and Sunday organization;
- visible child and team identity;
- supplementary reuse of existing child colors;
- readable multi-schedule event cards;
- resilient assigned, unassigned, and unavailable-assignment presentation;
- preserved event details and directions behavior;
- a presentation structure that later slices can deliberately extend with conflicts, leave-by, tournament context, and contextual travel.

The result should feel like a family sports plan, not a calendar database, league-management system, tournament directory, or administrative dashboard.

## 2. Mandatory preconditions — check before editing

### 2.1 Slice 4.0C completion gate

Inspect:

- commit `a70eab63` and its actual diff;
- `apps/corralio/notes.md`;
- `docs/notes.md`;
- the current worktree and recent Corralio history;
- the current Corralio routes and components.

Confirm from repository evidence that Slice 4.0C established and verified:

- the approved Corralio production lockups and local Manrope font;
- semantic system light/dark tokens;
- the shared authenticated product shell;
- exactly `This Weekend`, `Upcoming`, and `Family` primary navigation;
- authenticated `/`, `/upcoming`, and `/family` route ownership;
- signed-out, account, and recovery branding;
- responsive browser UAT at approximately 375px, 768px, and 1280px in both system modes;
- passing Corralio tests, TypeScript, lint, production build, and diff checks.

The expected prerequisite commit is a reference point, not permission to ignore the current repository state. Verify that no later change has broken or reverted the prerequisite.

If Slice 4.0C is missing, has unresolved defects, or its shell/brand foundation is no longer intact:

- audit only;
- do not mix a 4.0C repair into Slice 4.1;
- report the exact prerequisite failure;
- return `SLICE 4.1 NOT READY`.

### 2.2 Concurrent-work and dev-server gate

At the time this prompt was authored, `apps/corralio/package.json` defines the Corralio development command as `next dev -p 3002`. Verify the current package script or monorepo command before acting; if a later commit changes it, use the currently configured Corralio development-server port rather than assuming `3002`.

Before editing, determine whether another person or agent is changing Corralio or performing browser UAT against the same worktree or the currently configured Corralio development-server port.

Do not edit or start another Corralio development server while another UAT session is active. Hot reload, route changes, or shared authenticated state could invalidate their evidence.

Preserve all unrelated modified and untracked files. Do not stage, rewrite, remove, or commit them.

### 2.3 Backend and data gate

Slice 4.1 is expected to require no database migration, new RPC, service-role path, cron change, feed request, or retained-data mutation.

If the audit reveals a genuine backend blocker:

- stop before expanding scope;
- identify the exact missing contract;
- do not add schema or backend behavior opportunistically;
- return `SLICE 4.1 NOT READY` or `SLICE 4.1 READY AFTER LISTED FIXES`, as appropriate.

## 3. Audit the current implementation before changing it

Inspect at minimum:

- `apps/corralio/app/page.tsx`;
- `apps/corralio/app/_lib/productData.ts`;
- `apps/corralio/app/components/ThisWeekend.tsx`;
- `apps/corralio/app/components/ProductShell.tsx`;
- `apps/corralio/app/components/FamilySection.tsx`;
- `apps/corralio/app/globals.css`;
- `apps/corralio/lib/weekend.ts` and its tests;
- `apps/corralio/lib/schedules/assignment.ts` and its tests;
- the child color-token model in `apps/corralio/lib/family.ts`;
- the existing directions/navigation helper and dialog;
- current source-security, assignment, sport, refresh, and ingestion regression tests;
- `docs/corralio/CORRALIO_PRODUCT_ROADMAP.md`;
- `docs/corralio/CORRALIO_ARCHITECTURE_DECISIONS.md`;
- `docs/corralio/CORRALIO_FOUNDER_MENTOR_HANDOFF.md`;
- `docs/brand/BRAND-SPEC.md`.

These application paths are verified expected paths in prerequisite commit `a70eab63`, not timeless naming requirements. In that commit:

- `app/_lib/productData.ts` owns the server-side household/event presentation projection;
- `ProductShell.tsx` owns authenticated shell/navigation presentation;
- `FamilySection.tsx` owns family management presentation;
- `lib/weekend.ts` owns the browser-local weekend boundary helpers;
- `lib/schedules/assignment.ts` owns application-side assignment parsing/presentation, while the assignment mutation remains in its existing database RPC and server-action boundary.

If later repository changes renamed or moved one of these files, locate and inspect the equivalent implementation and its tests. Do not treat a renamed path by itself as a failed prerequisite, and do not recreate a duplicate file solely to match this prompt.

Record the audited baseline before reporting implementation results, including:

- current weekend filtering and query-window behavior;
- current event ordering;
- current event timezone formatting;
- current assignment/source fallback behavior;
- current rendered event fields;
- current empty/loading states;
- current directions interaction;
- current child/team/color information already available to the server projection;
- current light/dark and responsive behavior;
- current test assumptions tied to file locations or component structure.

Do not redesign working product behavior merely for novelty. Reuse existing components, helpers, semantic tokens, and accessible interaction patterns where practical.

## 4. Locked route and shell boundaries

Preserve the Slice 4.0C information architecture:

```text
/          → This Weekend
/upcoming  → intentional authenticated placeholder
/family    → children, teams, schedule connection, connected schedules, health, replacement, and assignment
```

Requirements:

- authenticated `/` remains the only Slice 4.1 implementation surface;
- signed-out `/` remains the existing sign-in entry;
- `/upcoming` remains a query-free placeholder;
- `/family` remains the exclusive management surface;
- Account and Sign out remain secondary actions;
- primary navigation remains exactly `This Weekend`, `Upcoming`, and `Family`;
- server-side authentication resolution and redirect behavior remain unchanged;
- do not duplicate family or schedule-management controls on `/`;
- do not add a new top-level destination.

Slice 4.1 may refactor the weekend presentation component and its plain serializable presentation props. It must not restructure the shell without a demonstrated accessibility or responsive defect.

## 5. Locked weekend semantics

Preserve the existing meaning of `This Weekend`:

- on Friday, Saturday, or Sunday, use the current Friday-through-exclusive-Monday weekend;
- on Monday through Thursday, use the upcoming Friday-through-exclusive-Monday weekend;
- continue using the existing broad server candidate window;
- continue applying the exact browser-local weekend filter;
- preserve the exclusive Monday boundary;
- preserve ascending chronological event ordering;
- preserve the existing event-timezone validation and time formatting;
- do not turn `/` into a generic upcoming, monthly, or season calendar.

Do not change the event query’s date/window semantics, filters, ordering, or limit merely to support grouping.

If day grouping exposes a previously hidden mixed-timezone ambiguity, preserve the current filtering and display semantics, add deterministic tests for the chosen presentation, and document the limitation. Do not invent a household timezone or migrate data in this slice.

## 6. Family-first organization

### 6.1 Day groups

Organize applicable events into chronological day sections for the Friday-through-Sunday plan.

Requirements:

- use semantic section headings for the relevant calendar day;
- include the weekday and concise date, such as `Saturday · Aug 22`;
- preserve chronological event ordering inside each day;
- render only day sections that contain events;
- do not render three large empty day containers when only one day has events;
- preserve one clear whole-weekend empty state when no applicable events exist;
- retain the concise weekend date range near the plan heading;
- do not add drag-and-drop, agenda editing, calendar-grid behavior, or day tabs.

Use the browser-local calendar date of `startsAt` for the Friday/Saturday/Sunday day bucket, matching the calendar basis already used by the exact weekend filter. Continue formatting the event’s displayed start time with its validated event timezone when present. Do not introduce a household timezone in this slice. Add a deterministic mixed-timezone edge-case test and document that this preserves the existing browser-local-boundary/event-timezone-display model.

Extract a small pure grouping/presentation helper if it improves determinism and testability. Do not create a speculative calendar framework.

### 6.2 Default view

The default and only view in Slice 4.1 is the complete family weekend.

Do not add child, team, sport, schedule-source, or day filters in this slice. Filtering can hide cross-family context and should be evaluated only after the complete family plan and basic conflicts exist.

Do not add persisted view preferences, URL filter parameters, search, sorting controls, or personalization.

## 7. Child and team identity

Use the existing assignment model and active family projection to make ownership immediately scannable.

### 7.1 Assigned events

For a valid child-only assignment:

- show the child’s display name prominently;
- use the child’s existing color token as a supplementary visual cue.

For a valid team assignment:

- resolve the owning active child through the existing team relationship;
- show `Child · Team` or an equivalently clear text hierarchy;
- use the owning child’s existing color token as a supplementary cue.

Requirements:

- text must communicate identity without relying on color;
- reuse only the established `forest`, `ocean`, `amber`, `violet`, `rose`, and `teal` tokens;
- do not introduce arbitrary color values, a color picker, team colors, source colors, or per-event colors;
- do not copy display names or colors into persisted event/source fields;
- derive presentation from the existing household-authorized family rows;
- do not expose archived child/team internals.

### 7.2 Unassigned events

An unassigned imported event must remain useful.

- Preserve the connected schedule’s display name as the established fallback context.
- Use a neutral presentation rather than borrowing a child color.
- If both assignment and source context are absent, use concise neutral copy only if needed to prevent a visually ambiguous card; do not infer a child or team.
- Do not force assignment before an event can appear.

### 7.3 Unavailable historical assignments

Preserve the existing neutral `Previous assignment unavailable` behavior for assignment IDs that are no longer present in the active family projection.

- Do not guess the prior child or team.
- Do not reveal archive state or hidden names.
- Do not silently treat the event as assigned to an active family member.
- Use a neutral visual treatment, not an active child’s color.
- Keep reassignment/unassignment controls exclusively on `/family`.

### 7.4 Presentation data contract

Extend the weekend presentation contract only with data required for the current family-first rendering, such as a bounded assignment kind and child color token.

Do not add speculative fields for:

- conflicts;
- leave-by;
- drive time;
- arrival buffers;
- tournament identity;
- canonical venues;
- weather;
- hotels;
- travel;
- collaboration or driver assignment.

Keep the client boundary plain, serializable, household-authorized, and free of private source URLs.

## 8. Event-card hierarchy

Refactor the existing event card deliberately for family scanning while preserving all currently rendered information and behavior.

Each event must continue to provide, where available:

- child/team assignment context or source fallback;
- sport and its existing local presentation icon;
- event title;
- start date/time using the established timezone behavior;
- location;
- field label under the existing source/display-location rule;
- directions/navigation interaction.

Preferred hierarchy:

1. child/team or neutral source context;
2. start time;
3. event title and sport;
4. location and field;
5. directions affordance.

The exact responsive composition may vary after auditing the existing cards, but it must make identity and timing faster to scan than the Slice 4.0C card.

Do not render:

- conflict badges;
- overlap warnings;
- leave-by values;
- route durations;
- arrival buffers;
- tournament labels inferred from event text;
- venue matches;
- weather;
- hotel or travel calls to action;
- edit, delete, assign, or reconnect controls.

Design the card so later slices can add a bounded contextual region without forcing a total rewrite, but do not pre-render empty placeholders or speculative props.

## 9. Empty, loading, and partial-context states

Preserve or improve the established states:

### No connected schedules

- Keep the existing root-level onboarding message.
- Direct the owner to Family to connect a schedule.
- Do not duplicate the connection form on `/`.

### Connected schedules but no weekend events

- Keep a calm whole-weekend empty state.
- Explain that the schedule is connected and events appear when they fall in the applicable Friday-through-Sunday window.
- Do not imply a fetch failure when the result is legitimately empty.

### Loading

- Preserve a meaningful loading announcement while the browser resolves the local weekend boundary.
- Avoid a misleading flash of `No events` before local-time filtering is ready.

### Partial context

- Events missing sport, location, field, assignment, or source context must still render safely.
- Do not fabricate absent data.
- Do not suppress an otherwise valid event because enrichment is incomplete.

## 10. Directions and location behavior

Preserve the existing navigation dialog and safe link construction.

Requirements:

- the raw authorized event location remains the navigation input;
- field labels remain subject to the existing source/display-location rule;
- Apple Maps, Google Maps, Waze, copy-address, cancel, backdrop, and close behavior remain functional;
- external map links retain safe target/rel behavior;
- dialog labeling, focus behavior, Escape/close behavior, and keyboard access remain usable;
- do not geocode, canonicalize, or route locations;
- do not call a map, routing, venue, weather, or travel provider;
- do not expose a private calendar source URL.

## 11. Visual and brand requirements

Build inside the existing Slice 4.0C visual foundation.

Use:

- the checked-in Manrope variable font already wired through `next/font/local`;
- the approved Corralio lockup treatment already selected by surface;
- existing semantic light/dark tokens;
- coral as the primary product action/accent color;
- supporting teal only for product UI where contrast remains sufficient;
- warm-white/light surfaces and the established dark equivalents;
- the existing child-color token system.

Do not:

- alter or regenerate brand assets;
- reference `docs/brand/source/` from application code;
- add runtime/build-time font downloads;
- add a design framework or component library;
- introduce component-specific raw colors when a semantic or child token applies;
- turn every event into a brightly colored tile;
- use child color as the only identity signal;
- add a theme toggle or persisted theme preference.

The product should remain calm even with several children and many events.

## 12. Responsive behavior

The family plan must remain mobile-first.

Verify at minimum:

- approximately `375px` width;
- approximately `768px` intermediate width;
- approximately `1280px` desktop width;
- each width in emulated system light and system dark modes.

Requirements:

- no horizontal overflow;
- day headings remain visible and understandable;
- time, identity, title, sport, and location do not collide;
- long child, team, source, event, and location text wraps safely;
- cards do not become excessively dense on mobile;
- desktop remains a wider consumer plan, not an admin grid/dashboard;
- touch targets remain at least approximately 44px where interactive;
- the directions dialog remains usable at mobile widths;
- shell navigation remains unchanged and understandable.

Do not use horizontal card scrolling as the primary overflow solution.

## 13. Accessibility

Preserve or improve:

- one page-level `h1`;
- logical heading order for weekend and day sections;
- semantic ordered or grouped event structure;
- accessible names for sport icons and directions controls;
- meaningful `<time dateTime>` values;
- visible keyboard focus in both system modes;
- logical focus order;
- dialog labeling and close behavior;
- status/empty/loading communication;
- readable primary and muted text;
- borders and surfaces with sufficient contrast;
- child identity conveyed in text as well as color;
- active navigation conveyed through text/weight/shape as well as color;
- reduced-motion behavior;
- usable zoom and responsive reflow.

Explicitly inspect in both modes:

- assigned identity treatments for every child color used in UAT;
- neutral unassigned and unavailable states;
- event title and time hierarchy;
- source fallback text;
- location/directions affordance;
- day dividers/headings;
- loading and empty states;
- focus indicators;
- dialog surfaces and actions.

If an existing child token does not provide accessible contrast for the chosen treatment, keep the persisted token key but use an accessible text-independent presentation derived from that token. Document the exact treatment and rationale in `apps/corralio/notes.md`. Do not mutate stored colors.

## 14. Preserve backend and security semantics

Do not change the behavior of:

- authentication or password recovery;
- household ownership or membership;
- RLS;
- children or teams;
- schedule connection;
- schedule sport;
- assignment, reassignment, or explicit unassignment;
- source replacement;
- scheduled refresh or persistent refresh recovery;
- canonical ingestion;
- imported-event stable identity;
- source/display location behavior;
- private calendar URL protection;
- event directions/navigation.

Do not add:

- migrations, tables, columns, indexes, policies, triggers, or RPCs;
- service-role reads in the page or browser;
- browser-supplied household IDs;
- feed fetches or refresh calls;
- cron changes;
- analytics;
- external integrations;
- provider-specific schedule logic.

Presentation may derive additional bounded identity information from the already-authorized active family projection. It must not broaden database access.

## 15. Focused automated coverage

Add or update the smallest meaningful offline tests for the final design.

Cover at minimum:

- Friday/Saturday/Sunday grouping at the established weekend boundary;
- stable chronological ordering inside day groups;
- browser-local day bucketing while preserving validated event-timezone display formatting;
- omission of empty day sections;
- whole-weekend empty behavior;
- assigned child identity and color;
- assigned team resolving through its owning child;
- unassigned source fallback;
- unavailable-assignment neutral behavior;
- invalid timestamps remaining safely excluded under existing semantics;
- event presentation data containing no source URL;
- preservation of source-derived sport;
- preservation of location/field rules;
- no conflict, leave-by, tournament, venue, route, or travel fields in the Slice 4.1 presentation contract.

Prefer pure helper tests over brittle full-source regex assertions where a stable behavioral seam exists. If existing security tests intentionally inspect source boundaries, update them to follow the new architecture without weakening what they prove.

Automated tests must remain offline. Do not fetch a font, real calendar, map, route, venue, weather, tournament, hotel, or other external resource.

## 16. Browser UAT dataset boundary

The flagship experience requires meaningful populated-state inspection, but retained household data must not be mutated merely to prove a presentation slice.

Historical evidence, not a current-state assertion:

- at the end of Slice 4.0B, cleanup restored the then-used UAT household to one retained source, 151 retained events, and zero synthetic children or teams;
- Slice 4.0B independently confirmed that the retained source and all 151 retained events remained unchanged after its synthetic fixture was removed;
- Slice 4.0C’s authenticated smoke identity exposed an empty Corralio household projection and was used read-only.

Those records describe prior verification snapshots only. They do not define the household’s current baseline. The user may add real children, teams, sources, or events after those slices. Treat every row present before the Slice 4.1 UAT preflight—including newly added user data—as retained data that must not be renamed, reassigned, edited, disconnected, or deleted for UAT.

Immediately before UAT, perform a read-only audit of the currently approved authenticated household. Record current counts and the presentation states available without exposing private values. If current retained data naturally satisfies some or all of the populated Slice 4.1 acceptance matrix, inspect those states read-only and do not create redundant synthetic rows.

Only missing required presentation states may justify a reversible synthetic fixture. Do not assume a fixture is necessary from the historical 4.0B or 4.0C notes.

Before creating any fixture, present the exact fixture and cleanup plan and obtain explicit user approval. The instruction to implement Slice 4.1 is not by itself authorization to mutate the dedicated UAT household or any retained row.

The preferred approved fixture is additive and isolated:

- create at least two unmistakably synthetic active children and the minimum synthetic team rows;
- create separate synthetic schedule sources/events as needed to represent child-only, team-assigned, and unassigned source-fallback states across at least two current weekend days;
- use deterministic fixture identifiers or another exact cleanup key;
- never fetch the synthetic sources or use a real/private calendar URL;
- do not reassign, edit, disconnect, or delete any row present in the UAT preflight, including user-added children, teams, sources, and events;
- do not rely on the retained events falling inside the current weekend;
- record preflight counts and identifying state before insertion;
- clean up only the exact synthetic rows after UAT;
- independently confirm the household returns to its exact immediate pre-fixture state and that all retained child, team, source, and event identity/assignment/state fields are unchanged.

A fixture data script is not a schema migration. Do not add or apply a migration, policy, RPC, trigger, cron, or production feature to support UAT. Do not commit credentials or private source URLs. If an isolated reversible fixture cannot be created within existing trusted boundaries, stop and request direction.

Use this order of preference:

1. an explicitly approved dedicated Corralio UAT household with reversible synthetic fixtures;
2. an already-populated dedicated UAT household whose existing state can be inspected without mutation;
3. read-only inspection of available authenticated state plus explicit reporting of states that could not be rendered.

If reversible synthetic fixture mutation is authorized:

- record the exact starting counts/state;
- use unmistakably synthetic names and events;
- do not fetch a real feed;
- do not invoke production cron;
- restore the exact starting state;
- independently confirm cleanup;
- do not touch unrelated household sources or events.

If no dedicated populated UAT state is available, do not mutate a retained production household. Complete all safe browser checks and report populated-state checks as unverified; do not claim they passed. A missing UAT dataset is not permission to add demo/fixture behavior to the product.

To return `SLICE 4.1 COMPLETE LOCALLY`, browser UAT must inspect a meaningful approved populated state containing at minimum:

- two distinguishable active children;
- at least one child-only assigned event;
- at least one team-assigned event;
- at least one unassigned event with source fallback;
- events on at least two weekend days;
- at least one event with a navigable location;
- enough simultaneous content to assess mobile scanning and wrapping.

The unavailable-historical-assignment visual state should be browser-checked only when it already exists in approved UAT data or can be created and removed through an explicitly authorized reversible synthetic fixture. It must always have automated coverage.

If the minimum populated browser state cannot be inspected, the maximum truthful verdict is `SLICE 4.1 READY AFTER LISTED FIXES`, with populated-state UAT listed as the remaining item.

## 17. Browser UAT

At every required width and in both system modes, record the actual route, width, and mode checked.

Verify:

- signed-out `/` remains unchanged and correctly branded;
- authenticated `/` loads with `This Weekend` active;
- `/upcoming` and `/family` still load with correct active states;
- unauthenticated `/upcoming` and `/family` redirect to `/` before authenticated content renders;
- the complete family plan groups events under the correct non-empty weekend days;
- events remain chronologically ordered;
- child-only assignment is immediately understandable;
- team assignment shows the owning child and team;
- different children are distinguishable through text plus existing color;
- unassigned events retain source context and neutral styling;
- unavailable historical assignment uses neutral safe copy if such an approved fixture exists;
- long child/team/source/event/location text wraps safely;
- event title, time, sport, location, and field remain readable;
- directions opens by pointer and keyboard;
- dialog actions and close behavior work;
- no private source URL appears in DOM text, attributes, serialized props, or visible navigation targets;
- empty and loading states remain coherent;
- no filter, conflict, leave-by, tournament, venue, weather, hotel, or travel UI appears;
- shell navigation, Account, and Sign out remain reachable;
- local Manrope and correct logo variants remain active;
- no horizontal overflow exists;
- focus is visible;
- light and dark surfaces remain readable;
- no Next.js error overlay, console error, page error, or failed same-origin application request appears;
- desktop remains a consumer product rather than an admin dashboard.

Do not submit family, assignment, connection, replacement, refresh, password, or recovery mutations unless an explicitly approved dedicated UAT plan requires them. Slice 4.1 should ordinarily need presentation-only browser interaction.

## 18. Required deferral and knowledge ledger

Deferrals are part of the deliverable. They prevent later work from being lost, silently pulled forward, or re-decided from incomplete context.

Update both:

```text
apps/corralio/notes.md
docs/notes.md
```

Record the following destination-based ledger explicitly:

### Slice 4.2 — Basic Conflicts

Deferred:

- overlap detection in the Corralio weekend UI;
- conflict badges, summaries, or explanations;
- family-plan conflict prioritization;
- conflict engagement analytics.

### Slice 4.3 — Estimated Leave-By

Deferred:

- household default origin;
- route-duration lookup or reuse;
- arrival-buffer policy;
- estimated leave-by calculation and labels;
- route caching, staleness, provider cost controls, and traffic awareness.

### Slice 4.4 — Tournament/Venue Context

Deferred:

- explicit or inferred TournamentInsights association;
- tournament labels, official links, and weather;
- canonical venue matching;
- match confidence/provenance;
- canonical venue writes or venue evidence.

### Slice 4.5 — Contextual Travel

Deferred:

- travel-needed inference;
- HotelPlanner search or handoff;
- hotel cards and travel calls to action;
- commercial attribution and Hotel Program resolution;
- booking behavior.

### Later or separately approved slices

Deferred without assigning an unsupported slice number:

- child/team/sport/source/day filtering and persisted view preferences;
- manual-event creation/editing;
- household collaboration, invitations, roles, and “who’s taking whom”;
- notifications and schedule-change briefings;
- analytics infrastructure;
- direct TeamSnap, GameChanger, SportsEngine, or other provider integrations;
- disconnect/suppression lifecycle work not already implemented;
- theme preferences or account-level theme storage;
- interactive marketing demo;
- Pro entitlements, pricing, or paywalls.

If implementation discovers a new deferred requirement, add it to the appropriate future slice or the unallocated-later list. Do not silently implement it.

Update `docs/corralio/CORRALIO_PRODUCT_ROADMAP.md`, `docs/corralio/CORRALIO_ARCHITECTURE_DECISIONS.md`, or other canonical strategy documents only if Slice 4.1 makes a genuinely new accepted product/architecture decision. Do not churn canonical documents merely to repeat implementation notes.

## 19. Required implementation outcomes

### Family plan

- applicable events are grouped into clear non-empty weekend day sections;
- chronological order remains intact;
- child and team identity is scannable through text plus existing child color;
- unassigned and unavailable states remain truthful and neutral;
- empty/loading behavior remains coherent.

### Event regression preservation

- event query and weekend boundary are unchanged;
- assignment/source fallback is unchanged in meaning;
- source-derived sport remains intact;
- event title, time, location, and field remain available;
- directions remains functional;
- private source URLs remain undisclosed;
- stable event/source identity is unchanged.

### Shell regression preservation

- approved brand and local Manrope remain intact;
- light/dark modes remain CSS/system-driven;
- primary navigation remains exactly three items;
- `/upcoming`, `/family`, account, and recovery behavior remain intact;
- responsive and accessibility guarantees remain intact.

### Explicit non-outcomes

Confirm that none of the following were added:

- filters or view preferences;
- conflicts;
- leave-by or routing;
- tournament or venue context;
- weather;
- travel or hotels;
- collaboration;
- analytics;
- provider integrations;
- schema, RPC, cron, or feed behavior;
- theme preferences;
- speculative future event props.

## 20. Automated verification

Run only checks applicable to the final diff, including:

- focused weekend grouping/presentation tests;
- affected assignment, family, source-security, sport, navigation, and weekend tests;
- the full Corralio library/schedule suite;
- Corralio TypeScript typecheck;
- Corralio lint;
- Corralio production build;
- `git diff --check`.

Report only commands actually run and their results. Do not describe browser or mutation UAT as passed unless it was actually completed against the recorded route, width, mode, and state.

## 21. Notes and commit

Update:

```text
apps/corralio/notes.md
docs/notes.md
```

Record:

- audited pre-slice weekend behavior;
- component/data-boundary changes;
- exact day-grouping semantics;
- assignment, source-fallback, unavailable, and child-color treatments;
- timezone behavior and any documented limitation;
- event fields and directions behavior preserved;
- responsive and accessibility decisions;
- light/dark verification;
- the complete destination-based deferral ledger from Section 18;
- actual browser routes, widths, modes, and populated states inspected;
- mutation checks performed or explicitly left unverified;
- automated checks actually run;
- confirmation that no migration, real feed, cron, retained-data mutation, push, or deployment occurred.

After validation:

- inspect the complete diff;
- preserve unrelated worktree changes;
- stage only files intentionally belonging to Slice 4.1;
- commit locally;
- do not push or deploy.

Suggested commit:

```text
feat(corralio): build family weekend plan
```

## 22. Final report

Return:

1. the audited pre-slice weekend query, filtering, ordering, assignment, event-card, state, and directions behavior;
2. files and user-facing presentation changed;
3. exact family/day grouping behavior implemented;
4. child-only, team, unassigned, unavailable, and child-color treatments;
5. timezone behavior and any known limitation;
6. evidence that event details, directions, source-derived sport, assignment meaning, identity, and URL security remain intact;
7. responsive, light/dark, keyboard, dialog, and accessibility results;
8. only automated checks actually run;
9. actual browser routes, widths, modes, and fixture states verified;
10. any checks intentionally left unverified because of the retained-data boundary;
11. the destination-based deferral ledger and confirmation that excluded features were not implemented;
12. whether canonical roadmap/ADR files changed and why;
13. confirmation that no migration, feed fetch, cron invocation, retained production-data mutation, push, or deployment occurred;
14. the local commit hash.

Choose exactly one final verdict:

- `SLICE 4.1 COMPLETE LOCALLY`
- `SLICE 4.1 READY AFTER LISTED FIXES`
- `SLICE 4.1 NOT READY`

Stop after Slice 4.1.
