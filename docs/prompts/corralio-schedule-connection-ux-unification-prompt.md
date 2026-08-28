# Corralio — Schedule Connection UX Unification

**Post-Arbiter Activation UX Hardening + Expandable Schedule-Source Guidance**

Status: Founder-approved. Incorporates the complete 2026-08-28 founder decisions (Amendment Log below) on top of CPO review verdict `SCHEDULE CONNECTION UX UNIFICATION READY AFTER LISTED FIXES`. This document is the single canonical prompt — do not implement from an earlier draft.

## Amendment Log — Founder Decision, 2026-08-28

The founder reviewed the CPO and implementation concerns and issued these authoritative decisions:

1. Keep LeagueApps in the catalog as `COMPATIBLE`, not `VERIFIED`.
2. Use the exact LeagueApps caveat in Section 10. Do not describe the duplicate state as temporary.
3. Record `Outstanding UAT — LeagueApps Reschedule Behavior` in `apps/corralio/notes.md`.
4. Do not claim correct cancellation/reschedule semantics for LeagueApps until a representative feed is tested.
5. Keep the source picker flat and catalog-derived. Do not add Common/More hierarchy or search in this slice.
6. Add only catalog metadata required for current behavior, especially explicit `team` / `household` contexts represented as a readonly array and static HTTPS official-support metadata. Do not broaden into a speculative catalog redesign.
7. Use one pure typed context-eligibility rule in both UI pickers and both Server Actions. Prove with deterministic orchestration tests that Arbiter Officials cannot be attached through team connection by manipulating client state and that rejection occurs before fetch or persistence.
8. Use the exact context matrix in Section 5; do not infer or independently duplicate it.
9. Treat future compatible-platform additions as bounded catalog/content work plus, where required by the existing closed measurement vocabulary, a narrow constraint migration with verifiers. LeagueApps requires that migration in this slice.
10. Use the explicit disposable-fixture, provider-call, ledger-reporting, and cleanup-zero UAT contract in Section 32.

All other requirements from the original 42-section prompt remain in force. Points 1–7 are folded directly into the numbered sections below (marked **[Founder amendment]** at each affected point) rather than left as a separate addendum, so there is one authoritative document.

---

You are working inside the existing TournamentInsights / RefereeInsights / Corralio monorepo.

Run this work only after Slice 3.7 is fully complete locally, including application of its platform-constraint migration and successful catalog and rollback-only behavioral verification.

Inherit the final canonical Slice 3.7:

* schedule-source catalog;
* ArbiterLive behavior;
* Arbiter Officials behavior;
* instructions;
* caveats;
* parser behavior;
* analytics vocabulary;
* compatibility classifications;
* database state.

Do not redefine or reopen settled Slice 3.7 behavior.
This is primarily a schedule-connection UX and activation improvement.
It does not add a new ingestion architecture.
Do not push or deploy.

## 1. Product Problem

Corralio's household-level Connect a schedule experience asks:

Where does this schedule live?

and provides platform-specific guidance.

However, the child/team workflow still exposes a raw:

Calendar link

field with ICS/iCal terminology and no equivalent source-selection/help experience.

That creates two different connection experiences for the same underlying task.

At the same time, Corralio will encounter additional sports-management platforms that provide standards-compatible recurring calendar subscriptions.

We should not require:

* a direct API integration;
* a Corralio test account for every vendor;
* a new engineering slice for every platform;

merely to provide useful connection guidance when the vendor officially documents a compatible recurring calendar feed.

## 2. Product Objective

A parent should be able to think:

My kid's schedule is in LeagueApps.

not:

I need to find an ICS URL.

The desired experience is:

Where does this schedule live? → choose recognizable platform → concise Corralio instructions → obtain/copy calendar link → return to Corralio → paste link → connect → see imported events → connect another schedule / See This Weekend.

Product principle:

Keep the sports apps you already use. Corralio brings their schedules into your family's plan.

Corralio's value begins after ingestion: Aggregate → Understand → Resolve → Plan

The connection experience should therefore make ingestion as low-friction as practical.

## 3. Audit First

Before editing, inspect the post-Slice-3.7 repository state.

Audit:

* household-level Connect a Schedule;
* child and team creation/editing;
* team schedule connection;
* the typed/versioned schedule-platform catalog created by Slice 3.4 and expanded by Slice 3.7;
* final Arbiter instructions and caveats;
* calendar-link inputs;
* connection actions and `FormState`;
* connection success/failure handling;
* assignment behavior;
* Slice 3.4 measurement calls and database constraints;
* mobile layout;
* existing disclosure/dialog/details primitives;
* existing tests.

Confirm specifically:

1. Slice 3.7's platform values are accepted by the applied Slice 3.4 measurement boundary.
2. `connectTeamSchedule()` still uses the canonical generic ingestion path.
3. Successful team ingestion assigns the source/events to the selected team through existing server-validated behavior.
4. Team creation and schedule connection remain separate actions.
5. Existing household/team flows never render persisted source URLs.
6. The repository has an appropriate existing disclosure primitive before introducing a new modal/drawer/sheet.
7. Platform selection remains activation/help classification and does not influence ingestion trust or parser behavior.

Repository reality wins. If Slice 3.7 is incomplete or its platform values are not accepted by the applied measurement constraint, stop and report the prerequisite rather than working around it.

## 4. Product Model

Preserve the distinction between:

**Team schedule** — A schedule belonging to a child's team. Examples include: GameChanger, TeamSnap, Stack Team App, ArbiterLive, LeagueApps, Other calendar.

**Household schedule** — A family commitment that does not necessarily belong to a child/team. This includes the existing post-Slice-3.7 support for: Arbiter Officials.

Do not add: adult profiles; parent roles; caregiver roles; official roles; parent-to-event assignment; new event origin types; new assignment architecture.

Existing unassigned household sources/events remain sufficient for V1.

The team/household distinction is a hard eligibility boundary, not a display convenience — see Section 6's server-side enforcement requirement.

## 5. One Canonical Schedule-Source Knowledge Model **[Founder amendment: point 6]**

Maintain one typed, versioned source of truth for schedule-source connection guidance. Reuse and extend the final post-Slice-3.7 platform catalog. Do not independently maintain platform instructions inside: household Connect a Schedule; team cards; onboarding; troubleshooting; error recovery.

Add only the catalog metadata this slice actually requires. Do not use this slice to speculatively redesign the catalog shape. Concretely:

* **Required:** `contexts: readonly ScheduleConnectionContext[]`, where `ScheduleConnectionContext` is the closed union `"team" | "household"`. Do not use `Set`; the catalog must remain plainly serializable.
* **Required:** `officialSupportUrl` as static catalog metadata. It must be HTTPS-only, contain no credentials or private subscription data, and never be populated from user input. Render it with appropriate external-link `target` / `rel` treatment.
* **Not required by this slice:** `lastReviewed` / `contentVersion` as new typed catalog fields. Record LeagueApps' documentation-review date and evidence summary in `apps/corralio/notes.md` (Section 39) instead of adding new catalog schema for it, unless engineering judges an in-catalog field is genuinely simpler than the alternative — that is an implementation-detail call, not a product requirement.
* Keep the existing compatibility-tier field and its existing name/shape (already `VERIFIED | COMPATIBLE | MANUAL | DIRECT_INTEGRATION` per Slice 3.4/3.7) rather than renaming it.

Follow existing repository naming/conventions rather than mechanically adopting any specific type sketch. Do not create a CMS. Do not create a database-backed platform catalog.

The approved context matrix is exact:

| Platform | Team | Household |
| --- | --- | --- |
| GameChanger | Yes | Yes |
| TeamSnap | Yes | Yes |
| Stack Team App | Yes | Yes |
| ArbiterLive | Yes | Yes |
| Arbiter Officials | No | Yes |
| LeagueApps | Yes | Yes |
| Other calendar | Yes | Yes |

Both pickers must derive eligibility from this canonical catalog rather than duplicate the matrix independently.

## 6. Critical Boundary — Catalog Metadata Is Not Trust **[Founder amendment: point 7]**

`contexts`, compatibility status, display name, and platform selection are presentation/help metadata only. They must not: alter fetching; alter parsing; relax SSRF protections; establish source-provider trust; affect venue creation; affect venue evidence; affect canonical/provisional matching; change refresh behavior; change event identity; change event assignment; authorize a URL; infer partnership/API access.

Server-side household/team assignment remains authoritative independently of the catalog. All compatible sources continue through the existing secure generic ICS/iCal/webcal ingestion path unless separately approved in a future integration slice.

**Server-side enforcement is mandatory, not merely a test to pass.** Implement one pure typed `isSchedulePlatformAllowed(context, platform)` rule. Both UI pickers and both Server Actions must consume or enforce that same canonical rule. Context eligibility must remain independent of what the client renders or submits. Specifically: `connectTeamSchedule()` (or its equivalent server-side entry point) must independently reject an attempt to attach a household-only source — Arbiter Officials today, and any future household-only source — even if a client sends manipulated form state. The picker hiding Arbiter Officials from the team UI is a UX affordance; it is not the security boundary.

Add the smallest injectable team-connection orchestration required for deterministic manipulated-form testing. Tests must prove that LeagueApps household submission is allowed under the approved matrix and that Arbiter Officials submitted to team connection is rejected **before fetch or persistence**. Regex/source inspection alone is insufficient.

## 7. Compatibility / Evidence Model

Corralio must distinguish between verified behavior and vendor-documented compatibility.

**VERIFIED** — Corralio has exercised an appropriate representative feed through the Corralio ingestion path and verified relevant behavior. Examples may include sources already verified through prior slices/UAT.

**COMPATIBLE** — The platform's current official documentation establishes a recurring standards-compatible ICS/iCal/webcal subscription mechanism expected to work through Corralio's generic ingestion path, but Corralio has not completed representative feed regression testing. Parent-facing language must not imply the same evidence level as VERIFIED.

**MANUAL** — No compatible recurring schedule feed has been established. Manual Corralio alternatives may be used where supported.

**DIRECT_INTEGRATION** — Reserved for a genuine API/OAuth/native platform integration. Do not use this status for ICS/iCal/webcal compatibility.

## 8. Vendor-Documented Compatibility

Corralio may provide platform-specific connection guidance without possessing a vendor test account when:

1. current official vendor documentation clearly establishes a recurring standards-based calendar subscription;
2. the documented mechanism is compatible with Corralio's existing generic ingestion path;
3. concise Corralio-owned instructions can accurately describe the workflow;
4. the source is honestly classified as COMPATIBLE rather than VERIFIED;
5. no platform-specific parser exception is required;
6. no custom authentication, scraping, reverse engineering, browser automation, or security relaxation is required.

This allows Corralio to support more sports families without pretending every source has been independently regression-tested.

## 9. LeagueApps — Initial Documented-Compatible Source **[Founder amendment: point 1]**

Add LeagueApps to the canonical schedule-source catalog as a team-appropriate `COMPATIBLE` source, subject to confirming the current official vendor documentation during implementation. **LeagueApps must be classified `COMPATIBLE`, never `VERIFIED`, until a representative Corralio-side feed test exists — this is a founder decision, not open for reinterpretation during implementation.**

Current official LeagueApps documentation describes a recurring calendar-subscription workflow including: Subscribe to Calendar → Copy Link, and distinguishes recurring subscriptions from one-time calendar imports.

Use the official LeagueApps documentation as the authoritative external provenance: LeagueApps — Calendar Sync, `https://support.leagueapps.com/hc/en-us/articles/360039381354-Calendar-Sync`

Do not reproduce the vendor article. Do not copy substantial vendor text. Do not copy vendor screenshots. Create concise Corralio-owned instructions based on the documented workflow.

Conceptually:

1. Open your LeagueApps schedule.
2. Choose Subscribe to Calendar.
3. Choose Copy Link.
4. Return to Corralio.
5. Paste the calendar link.

Use exact wording only after checking the current official documentation. Store the official support URL as secondary help/provenance.

## 10. LeagueApps Caveats **[Founder amendment: points 2 and 4]**

Audit the current official documentation and preserve only caveats materially relevant to Corralio.

The catalog's LeagueApps caveat text must explicitly disclose the documented reschedule behavior, in parent-honest language substantially equivalent to:

> If a LeagueApps game is rescheduled, its calendar feed may contain both the old game marked RESCHEDULED and the new game. Corralio hasn’t yet verified how that appears here, so double-check important changes directly in LeagueApps.

This is not optional discretionary content — it is a specific, founder-required disclosure, because LeagueApps' own support documentation states that a rescheduled game is marked RESCHEDULED in place while the new time appears as a separate event, which — absent Corralio-side verification — could otherwise read to a parent as a duplicate/phantom commitment.

Do not claim correct cancellation/reschedule semantics for LeagueApps anywhere in the product (copy, notes.md, verdict) until a representative LeagueApps feed has actually been run through Corralio's ingestion path. Until then, treat this identically to how Arbiter Officials' unverified lifecycle semantics were disclosed in Slice 3.7 (COMPATIBLE + honest caveat + tracked outstanding UAT), not as a blocking condition.

Other potentially relevant documented behavior to review and record (not necessarily surfaced in-product):

* recurring subscribed calendars update when LeagueApps events change;
* the subscription window may be bounded into the future/past.

Do not overburden the connection UI with technical caveats. Record useful caveats in the catalog so troubleshooting can use them, support can understand them, and future verification knows what to test.

Do not modify Corralio's parser merely because LeagueApps documents a particular behavior unless real feed evidence demonstrates an actual ingestion defect.

## 11. Future Platform Addition Rule

Future documented-compatible platforms should normally require only bounded catalog/content work and, where the existing closed measurement vocabulary records the platform, a narrow constraint migration with verifiers—not a new ingestion architecture slice.

LeagueApps requires that narrow measurement-constraint migration in this slice.

A future source may be added as COMPATIBLE when: official vendor documentation establishes recurring calendar subscription; Corralio's existing secure ingestion path supports the documented mechanism; platform instructions can be written accurately; evidence status is honest; review date is recorded; no new ingestion/security behavior is required.

If a platform requires: API authentication; OAuth; scraping; browser automation; proprietary parsing; custom credential handling; relaxed SSRF rules; platform-specific trusted-source semantics — it is not a catalog-only addition and requires separate review.

## 12. Household-Level Source Picker **[Founder amendment: point 5 affects presentation]**

Preserve the existing household-level "Where does this schedule live?" experience. After Slice 3.7, this should expose the canonical approved household-eligible sources derived from the shared catalog, **as a flat, catalog-derived list — no Common/More tiering (see Section 14)**.

The household picker must use the exact Section 5 matrix: GameChanger, TeamSnap, Stack Team App, ArbiterLive, Arbiter Officials, LeagueApps, and Other calendar.

Do not hard-code a second independent list. Derive eligibility from the catalog's `contexts`. Arbiter Officials belongs in the household-level flow.

## 13. Team-Level Schedule UX **[Founder amendment: point 5 affects presentation]**

Replace the team card's raw-first "Calendar link" experience. The team workflow should instead begin: "Where does this team schedule live?"

Only team-eligible sources may appear, **presented as a flat, catalog-derived list — no Common/More tiering (see Section 14)**.

Expected team-appropriate sources include: GameChanger, TeamSnap, Stack Team App, ArbiterLive, LeagueApps, Other calendar.

The final list must be derived from the canonical catalog rather than duplicated in the component. Arbiter Officials must not appear in the team picker — and per Section 6, this must hold even if a client attempts to submit it directly.

## 14. Picker Presentation — Flat, Not Tiered **[Founder amendment: point 5 — replaces the original "Picker Scalability" section]**

The founder has explicitly decided: keep the source picker flat and catalog-derived. Do **not** build a Common/More-schedule-apps hierarchy in this slice. Do **not** add search to schedule-source selection in this slice.

Present all context-eligible sources (team or household, per Section 5's `contexts`) as a single flat list, in a stable order (catalog order is sufficient), using the existing repository's compact list/select mobile pattern. This is a deliberate, evidence-based sequencing call: the catalog is going from ~4 to ~6–7 platforms with this slice, not to a size where progressive disclosure earns its complexity cost yet.

This section is not deferred as "nice to have later" — it is an explicit rejection of the CPO's original hierarchy proposal for this slice. If the catalog later grows enough that a flat list becomes genuinely unusable on mobile (a real UX finding, not a hypothetical), that is new-slice scope, evaluated with real evidence at that time.

## 15. Platform Instructions

After selecting a source, provide an obvious action such as: "Show me how to get the calendar link"

Use the smallest existing mobile-friendly disclosure pattern. Prefer an existing `<details>` disclosure, expandable help surface, or existing dialog/drawer rather than introducing a new interaction framework.

Instructions must come from the canonical shared catalog.

## 16. Instruction Standard

Instructions should use parent language. The parent should not need to understand: ICS; iCal; webcal; subscription feeds.

Those terms may appear secondarily when they help the parent recognize terminology used by the source platform.

The basic mental model is: Open your sports app → find its calendar subscription → copy the calendar link → paste it into Corralio.

Do not expose internal ingestion terminology unnecessarily.

## 17. Official Instructions Escape Hatch

Where a platform has a reliable official help article, provide a secondary action such as: "Official instructions"

This should navigate to the vendor's authoritative support content using an external-link treatment with appropriate `target` / `rel`. The primary Corralio experience should still contain enough concise guidance that the parent normally does not need to leave Corralio.

`officialSupportUrl` is static HTTPS-only catalog metadata. It may not contain credentials or private subscription data and must never be populated from user input.

Do not make vendor support pages the primary connection experience.

## 18. Calendar-Link Entry

After source selection/help, retain the existing secure calendar-link input and generic ingestion path. Use parent-facing language such as "Paste calendar link" rather than presenting "ICS/iCal URL" as the primary instruction.

Preserve existing privacy reassurance where appropriate. Never display a previously persisted source URL back to the parent.

## 19. Do Not Add a Fake Copy Button

Do not add a Copy button unless Corralio itself possesses a legitimate value the parent needs to copy. Normally the parent obtains the calendar URL from the external sports platform.

Useful Corralio actions are instead: "Show me how"; "I have the link"; "Paste calendar link"; potentially "Official instructions".

Do not invent external deep links.

## 20. Team Creation Remains Independent

Do not force schedule connection in order to create/save a team. A parent must still be able to: create the team; save the team; connect its schedule immediately or later.

Do not increase onboarding requirements.

## 21. Successful Connection

Preserve the existing Slice 3.4 reward semantics where applicable: "Schedule connected — we found N upcoming events"

Provide obvious continuation. Depending on context: Connect another schedule; Return to Family; See This Weekend.

Do not automatically navigate before the parent understands that the connection succeeded.

## 22. Failure Recovery

Reuse the existing Slice 3.4 safe error-kind contract. Do not create a separate error system for team-level connection.

After failure, the parent should be able to: correct/paste another link; reopen instructions; choose another schedule source; retry safely.

Evaluate whether an explicit "Choose another schedule source" action materially improves mobile recovery. Add it if the current UI makes switching sources insufficiently obvious.

## 23. Assignment Semantics

Team-level schedule connection must preserve existing child/team assignment behavior. Household-level Arbiter Officials remains unassigned under the existing architecture.

Do not modify: event schema; schedule-source schema except where the post-3.7 catalog already requires it; child/team assignment; conflict detection; event origin types; venue matching; source trust semantics.

## 24. Mobile UX **[Founder amendment: point 5 removes the "More schedule apps" bullet]**

Schedule connection is primarily a mobile activation task. Verify at the required mobile-sized browser viewports:

* team card does not become excessively tall;
* source selection is easy;
* selected source is obvious;
* the full flat source list remains scannable without excessive scrolling;
* help is obvious;
* instructions are readable;
* returning from help to paste is obvious;
* calendar-link input remains usable;
* Save Team and Connect Schedule remain distinct;
* success state is clear;
* error recovery is obvious.

Do not claim physical-device-only behavior from browser emulation. Carry cross-app paste/software-keyboard behavior into final physical-device launch UAT where appropriate.

## 25. Analytics

Do not add or modify analytics schemas, event vocabularies, device attributes, or analytics writers solely for this UX work. Reuse existing Slice 3.4 measurement.

If the expanded catalog requires an existing closed platform enum/constraint to accept LeagueApps, audit the post-Slice-3.7 measurement architecture first.

If a database constraint must be expanded solely so the existing approved platform-selection measurement can represent LeagueApps: use the established forward-migration + verifier pattern; do not broaden the event vocabulary; do not add arbitrary platform strings; stop for human database application before claiming completion.

If no migration is necessary, do not create one.

## 26. Security / Privacy

Preserve all existing schedule-source protections. Never: expose persisted source URLs; send source URLs to analytics; log source URLs; include real URLs in screenshots/fixtures; weaken SSRF protections; alter protocol restrictions; alter parser/fetch behavior based on platform selection; treat platform selection as trusted provider evidence.

All catalog-supported sources continue through the secure generic ICS/webcal ingestion path. Vendor support URLs are public documentation links and must remain separate from private calendar subscription URLs.

## 27. Explicit Non-Goals

Do not: add direct platform APIs/OAuth; add parent/official role models; add adult profiles; change schedule refresh/freshness behavior; modify Slice 3.5.5; modify notifications; modify Mapbox/routing; add SignUpGenius; build a public help center; build an SEO program; copy vendor screenshots; build platform partnerships; redesign Family; redesign This Weekend; modify What Fits; add generic search.

## 28. Tests **[Founder amendment: point 5 changes test #8; point 7 elevates tests #22–23]**

Add/update deterministic tests covering at minimum:

1. household picker derives sources from canonical catalog;
2. team picker derives sources from canonical catalog;
3. contexts control presentation eligibility only;
4. ArbiterLive appears in applicable team/household contexts;
5. Arbiter Officials appears in household but not team context;
6. LeagueApps appears as team-appropriate COMPATIBLE source;
7. Other calendar remains available;
8. the flat source list renders in stable, deterministic order for a given context (no Common/More branching to test);
9. correct shared instructions render;
10. official support link is correct where configured, HTTPS-only, static catalog metadata, and rendered with appropriate external-link `target` / `rel` treatment;
11. source selection does not alter fetch/parser/security behavior;
12. team can be saved without a schedule;
13. successful team connection preserves assignment;
14. existing safe errors are reused;
15. instructions can be reopened after failure;
16. parent can choose another schedule source after failure;
17. persisted/private calendar URLs are never rendered back to the parent;
18. LeagueApps platform selection is accepted by the existing approved measurement boundary where platform selection is measured;
19. no arbitrary platform string can enter the closed measurement contract;
20. documented-compatible status does not cause a source to be treated as VERIFIED;
21. official support URLs remain public documentation metadata and cannot be confused with private subscription URLs;
22. **LeagueApps household submission succeeds under the approved matrix through the deterministic server/orchestration boundary;**
23. **Arbiter Officials cannot be submitted through the team connection workflow merely by manipulating form state, and rejection occurs before fetch or persistence (deterministic orchestration test, not regex/source inspection);**
24. existing household-level schedule connection remains unchanged except for consuming the shared catalog;
25. no new analytics vocabulary is introduced;
26. no regression to Slice 3.4 connection success/recovery behavior;
27. no regression to Slice 3.7 ArbiterLive or Arbiter Officials behavior;
28. no regression to schedule refresh, assignment, duplicate handling, cancellation, venue resolution, leave-by, or What Fits behavior.

Do not call external sports platforms from deterministic/offline tests. Use secret-free fixtures only.

---

## 29. LeagueApps Documentation Verification

Before finalizing LeagueApps content, inspect the current official LeagueApps Calendar Sync documentation. Verify: the recurring subscription workflow still exists; the current parent-facing terminology for obtaining the subscription; Copy Link remains an available documented path; any documented calendar-window limitation; documented reschedule/update behavior relevant to Corralio; the official support URL remains current.

Record: review date; compatibility classification; concise evidence summary; materially relevant caveats.

Do not require a LeagueApps account merely to classify the officially documented recurring subscription mechanism as `COMPATIBLE`. Do not classify LeagueApps as `VERIFIED` without representative Corralio feed testing. If the official documentation no longer establishes a recurring standards-compatible calendar subscription, do not add LeagueApps as COMPATIBLE — report the finding instead.

Do not scrape LeagueApps. Do not make authenticated requests to LeagueApps.

---

## 30. Browser UAT **[Founder amendment: point 5 removes "More schedule apps" steps]**

Run controlled signed-in browser UAT using a disposable authorized Auth identity and household plus controlled public credential-free ICS fixtures. Prefer fixtures without locations where practical. Do not expose real subscription URLs in screenshots, logs, reports, browser-visible debug output, or analytics.

### Journey A — Household connection

Family / Connect a Schedule → **Where does this schedule live?** → verify the flat canonical source list → select a source → open instructions → return to connection form → paste controlled calendar link → connect → confirm successful event count → confirm appropriate continuation actions.

Verify Arbiter Officials is available in the household context.

### Journey B — Team connection

Family → child → team → **Where does this team schedule live?** → select GameChanger, TeamSnap, Stack Team App, ArbiterLive, or another applicable team source → open "Show me how to get the calendar link" → return to the same team connection context → paste controlled calendar link → connect → confirm successful event count → confirm imported source/events retain the existing team assignment.

Verify: Arbiter Officials is absent; LeagueApps is discoverable in the flat team-appropriate list; Other calendar remains available.

### Journey C — LeagueApps guidance

Team connection → locate LeagueApps in the flat source list → select LeagueApps → confirm it is not represented as a direct integration or partnership → review concise Corralio instructions **and confirm the reschedule caveat from Section 10 is visible or reachable** → verify the official LeagueApps help link → return to the Corralio connection flow.

A real LeagueApps subscription is not required for this UAT unless one becomes legitimately available. Do not fabricate VERIFIED status.

### Journey D — Recovery

Select a schedule source → submit a controlled invalid link → receive existing contextual safe error → reopen platform instructions → choose another schedule source → submit a valid controlled fixture → connect successfully.

The recovery path must make changing the selected source understandable without requiring page reload or navigation back through unrelated Family UI.

### Journey E — Team without schedule

Create or edit a team → do not connect a schedule → save successfully → return later → connect the schedule.

Schedule connection must remain optional.

---

## 31. Mobile-Sized Browser UAT **[Founder amendment: point 5 removes "More schedule apps" bullet]**

Repeat the key source-selection/help interactions at the required mobile-sized browser viewports established by the current Corralio mobile UAT conventions.

Verify: team card remains reasonably compact; the flat source list is understandable and scannable; LeagueApps can be found without excessive scrolling; source selector has adequate touch-sized controls in the emulated layout; selected state is obvious; help disclosure does not obscure the connection task; instructions wrap correctly; official-help link is distinguishable from the private calendar-link input; returning from help to paste is obvious; Save Team and Connect Schedule remain visually distinct; errors and source switching remain understandable.

Do not claim physical-device verification from browser emulation. Physical-device-only behavior such as cross-app copy/paste, software-keyboard obstruction, and external-app return behavior remains part of final pre-launch physical-device UAT.

---

## 32. UAT Fixture and Provider Boundaries

This is a UX/catalog slice. Declare a hard ICS-fetch cap before UAT. Expected Geocodio calls: `0`. Expected OpenRouteService calls: `0`.

Use: a disposable authorized Auth identity and household; controlled public credential-free ICS fixtures, without locations where practical; existing public canonical venues read-only where needed.

Do not: connect a real household's private feed merely for this UAT; refresh Overture; create or modify canonical venues; create or modify provisional venues merely for this slice; invoke Mapbox traffic routing; invoke Geocodio merely for connection UX verification; invoke arbitrary third-party URLs to manufacture failures.

Use deterministic fixture responses for failure testing. Report actual fixture fetches and existing provider-ledger deltas; do not add new instrumentation. If any unavoidable external call occurs, report it explicitly.

Independently confirm cleanup zero across: Auth identities; households; children; teams; schedule sources; events; interaction measurements; engagement records; quota/provider rows; and temporary fixture records.

---

## 33. Database Gate — Only If Required

No schema migration should be necessary for the UX/catalog architecture itself. However, LeagueApps or other newly cataloged platform values may need to be accepted by an existing closed database constraint used for the already-approved Slice 3.4 interaction measurement.

Audit this before implementation. If the applied database already supports the required value without weakening the closed enum/constraint: do not create a migration.

If a database constraint must be extended:

1. create a new forward migration;
2. do not edit a historical migration;
3. keep the platform vocabulary closed;
4. add only the explicitly approved platform value(s);
5. do not introduce arbitrary strings;
6. prepare a catalog verifier;
7. prepare a rollback-only behavioral verifier;
8. do not apply the migration automatically.

Stop at: `SCHEDULE CONNECTION UX UNIFICATION READY FOR DATABASE VERIFICATION`

A human will apply the reviewed migration. After application: run catalog verification; run rollback-only behavioral verification; verify the new approved value succeeds; verify arbitrary/unapproved values remain rejected; verify existing platform values remain accepted; confirm rollback cleanup zero.

Only then continue final UAT.

---

## 34. Security Review **[Founder amendment: point 7 — this is a hard gate, see Section 6]**

Before completion, explicitly confirm:

* platform catalog metadata remains non-authoritative presentation/help metadata;
* **client-submitted platform/context values cannot bypass server-side assignment authorization — verified by an actual server-side test (Section 28, tests 22–23), not by inspecting client code alone;**
* team connection cannot be converted into household/Officials assignment through form manipulation;
* persisted source URLs remain protected;
* no private source URL is embedded in an official-help link;
* official vendor support URLs are static/public catalog metadata;
* generic ICS/webcal SSRF protections remain unchanged;
* parser behavior remains unchanged;
* source-provider trust semantics remain unchanged;
* no vendor-specific hostname allowlisting or trust escalation was introduced;
* no direct platform credentials were introduced.

If implementation requires weakening any of these boundaries, stop and report rather than expanding scope.

---

## 35. Accessibility Review

Perform a bounded accessibility check of the changed connection surfaces.

Verify: source selectors use semantic controls; selected state is understandable without color alone; disclosure/help controls have meaningful accessible names; form labels remain associated with inputs; official-instructions links have understandable link text; keyboard interaction works for the source selector/disclosure in browser testing; focus behavior remains sensible after opening/closing help; error messages remain associated with the relevant connection flow.

Do not create a broad accessibility redesign. Fix concrete defects introduced or exposed by this UX change.

---

## 36. Verification

Before declaring completion, run: focused schedule-connection/catalog tests; all affected deterministic tests; complete Corralio test suite; explicit Corralio TypeScript validation; zero-warning Corralio lint; `git diff --check`; all four production builds: `corp-app`, `corralio-app`, `referee-app`, `ti-web`.

Also verify: no unrelated schedule-ingestion behavior changed; no Slice 3.5.5 freshness behavior changed; no Slice 3.6 notification/routing work entered the diff; no vendor-specific network dependency was introduced into normal rendering; signed-out landing behavior remains unchanged.

Do not push. Do not deploy.

---

## 37. Completion Standard

The slice succeeds when:

> A parent receives the same clear, guided schedule-connection experience whether they start from Connect a Schedule or from a child's team card, and can find supported/documented-compatible sports apps without needing to understand ICS/iCal terminology or search the web themselves.

The product distinction must remain clear:

> Team schedule → team-appropriate schedule sources
> Household schedule → broader family commitments, including Arbiter Officials

And the platform evidence distinction must remain honest:

> VERIFIED means Corralio tested it.
> COMPATIBLE means the vendor documents a recurring standards-compatible calendar connection that Corralio can guide the parent through, but Corralio has not completed representative feed verification.

Adding another documented-compatible ICS platform should normally become a small catalog/content change rather than another product architecture slice.

---

## 38. Launch-Blocking vs. Deferred **[Founder amendment: points 1–5 update both lists]**

### Required for this slice

* unified household/team connection guidance;
* context-aware source eligibility, enforced server-side (Section 6);
* Arbiter Officials excluded from team context (client and server);
* LeagueApps documented-compatible guidance, classified COMPATIBLE, with the explicit reschedule caveat (Section 10);
* a flat, catalog-derived source list for both team and household contexts — no Common/More hierarchy;
* shared canonical instructions;
* secure existing ingestion path;
* contextual recovery;
* mobile-sized browser UAT;
* privacy/security verification;
* database constraint update/verifiers only if actually required.

### Deferred

* LeagueApps VERIFIED status until representative feed testing exists;
* LeagueApps reschedule-behavior verification (tracked as `Outstanding UAT — LeagueApps Reschedule Behavior` per Section 39) until a representative feed is tested;
* Common/More schedule-app hierarchy and in-picker search — explicitly deferred by founder decision, to be revisited only with real evidence the flat list has become unusable;
* additional vendor catalog expansion beyond the explicitly approved sources;
* public help center;
* SEO pages;
* vendor screenshots;
* direct APIs/OAuth;
* platform partnerships;
* parent/adult role model;
* SignUpGenius;
* automatic vendor-documentation monitoring;
* native app connection flows.

Do not let deferred work block this slice.

---

## 39. Notes and Durable Record **[Founder amendment: point 3]**

Update `apps/corralio/notes.md` with:

* audit findings;
* final shared catalog structure;
* team vs. household context behavior;
* final platform set;
* LeagueApps evidence classification and official-documentation review date;
* **an explicit `Outstanding UAT — LeagueApps Reschedule Behavior` entry, stating that LeagueApps' documented reschedule behavior (old event marked RESCHEDULED, new event appears separately) has not been verified against a real Corralio-side feed, mirroring how the Arbiter Officials lifecycle UAT was tracked in Slice 3.7;**
* the flat-list picker decision and the explicit rationale that Common/More hierarchy was considered and deferred, not overlooked;
* team-card UX changes;
* instruction/help behavior;
* failure recovery behavior;
* database migration/verifier result if applicable;
* security/privacy result, including the server-side context-enforcement test result;
* accessibility result;
* browser/mobile-sized UAT result;
* fixture cleanup result;
* tests/builds;
* deferred items;
* final verdict.

If the repository has an established CPO/product decision record for schedule-source compatibility, update it consistently rather than creating conflicting documentation.

Preserve unrelated worktree changes.

---

## 40. Commit

Review the complete diff before committing. Commit only files belonging to this Schedule Connection UX Unification work. Use a focused local commit message.

If a database-verification gate requires separate prepare/complete commits, follow the repository's established migration workflow. Do not manufacture multiple commits where one focused commit is sufficient.

Do not push. Do not deploy.

---

## 41. Final Restrictions

Do not: reopen Slice 3.7; reopen Slice 3.4 ingestion architecture; alter Slice 3.5.5 schedule freshness; implement Slice 3.6; add Mapbox traffic-aware routing; add notifications; add direct platform APIs; add OAuth; add scraping; add browser automation; add parent/adult profiles; add official roles; add SignUpGenius; change venue architecture; change What Fits; change hotel/travel behavior; build a public help center; build an SEO program; imply vendor partnerships; claim documented-compatible sources are VERIFIED; build a Common/More schedule-app hierarchy or in-picker search; expose private subscription URLs; push; deploy.

---

## 42. Final Verdict

Return exactly one appropriate terminal verdict:

`SCHEDULE CONNECTION UX UNIFICATION COMPLETE LOCALLY`
`SCHEDULE CONNECTION UX UNIFICATION READY FOR DATABASE VERIFICATION`
`SCHEDULE CONNECTION UX UNIFICATION READY AFTER LISTED FIXES`
`SCHEDULE CONNECTION UX UNIFICATION BLOCKED BY AUDIT FINDING`
`SCHEDULE CONNECTION UX UNIFICATION NOT READY`

Include: prerequisite/Slice 3.7 status; audit result; files changed; canonical catalog changes; household/team eligibility behavior and server-side enforcement test result; LeagueApps classification/evidence and reschedule-caveat confirmation; UX delivered (confirm flat-list, no hierarchy); database state/verifier results if applicable; privacy/security result; accessibility result; browser/mobile-sized UAT result; fixture cleanup result; tests/builds; deferred non-blockers; local commit hash(es); explicit confirmation that nothing was pushed or deployed.
