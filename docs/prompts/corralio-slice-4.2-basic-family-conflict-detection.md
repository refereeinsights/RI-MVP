# Corralio Slice 4.2 — Basic Family Conflict Detection

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

Corralio Slices through 4.1B are complete locally. The baseline includes household ownership and RLS, children and teams, connected schedules, assignment and lifecycle controls, SQL-side exclusion of disconnected-source events, the family-oriented `This Weekend` page, signed-out onboarding, and the responsive product shell.

Slice 4.2 is the first slice where Corralio begins to understand the family weekend rather than only display it.

## Goal

Detect and clearly present basic temporal conflicts across the active family plan:

> **Where does our family have overlapping commitments?**

Do not solve, prioritize, or infer travel feasibility for a conflict. The product progression is **Aggregate → Understand**. Travel time, leave-by, routing, recommendations, and resolution belong to later slices.

Implement locally, update notes, test affected code, and commit locally. Do not push, deploy, invoke production cron, fetch feeds, or automatically apply SQL. Automated tests must remain offline.

## 0. Repository prerequisite gate

Before editing, verify repository evidence that Slice 4.1B is complete:

- `f6fc4e0d` — Slice 4.1B implementation;
- `d5efbef6` — Slice 4.1B UAT completion;
- repository notes contain `SLICE 4.1B COMPLETE LOCALLY`.

If the baseline is missing or conflicting, stop and report the discrepancy. Do not implement against prompt assumptions alone.

## 1. Audit first

Inspect the active event query, event start/end fields, all-day representation, timezone handling, manual/imported behavior, disconnected-source filtering, active family projection, stable identity, weekend grouping/order, 200-row limit, recurrence expansion, existing overlap utilities, fixtures, and event-card structure.

Reuse proven product-neutral logic if it fits. Do not introduce a generalized scheduling engine. If the model cannot support reliable start/end overlap detection, stop and report the exact gap.

Repository evidence currently shows this pipeline:

```text
server broad candidate window → client exact browser-local Fri–Sun selection → rendered This Weekend
```

Conflict derivation must use the same exact event set the user sees. Do not calculate conflicts over the entire broad server candidate result. Prefer one shared pure pipeline:

```text
candidate events → exact browser-local weekend events → unique conflict pairs
```

Exact weekend selection must happen before conflict derivation so filtering and conflict semantics cannot drift.

## 2. Basic conflict definition

A conflict is a time overlap between two distinct active family events:

```text
eventA.start < eventB.end
AND
eventB.start < eventA.end
```

Touching boundaries are not conflicts. `09:00–10:00` and `10:00–11:00` do not conflict. Partial overlap, containment, and identical positive-duration intervals do conflict.

Do not add travel-time feasibility. Different venues with a short non-overlapping gap are not a conflict in this slice.

## 3. Active-event and exact-weekend scope

Only events in the existing active family plan and exact displayed `This Weekend` window participate:

- active manual events are eligible;
- imported events from non-disconnected sources are eligible;
- disconnected-source events are excluded by the existing active-plan query;
- archived family labels must not make inactive context reappear;
- events outside the exact browser-local Friday-through-exclusive-Monday window are excluded.

Reuse the Slice 4.1B active-plan query. Do not rebuild lifecycle filtering.

## 4. Stable family context

Detect and present:

- different-child overlaps;
- same-child overlaps;
- assigned/unassigned overlaps using the existing source fallback;
- team assignments through their active owning child.

Same-child status must use the stable resolved owning child ID. For team events, resolve the owning child through the active team projection. Never compare names, presentation labels, team names, or color tokens. If needed, extend private event presentation data with a non-rendered resolved child identifier. Never render database IDs or infer family context from event text.

## 5. Canonical pairwise representation

Use deterministic pairwise conflict records for V1. Every record must contain two distinct stable event IDs. Order those IDs into a canonical key such as `minId:maxId`, so a self-pair and reverse duplicate cannot exist.

For `A overlaps B`, `B overlaps C`, and `A` not overlapping `C`, render two pairwise conflicts. Do not claim all three share one overlap window.

The summary count has exactly one meaning: the number of unique conflict pairs. Document this choice. Do not add graph analysis or severity scoring.

An optional factual distinction between `Schedule conflict` and `Same child conflict` is allowed. Do not calculate high/medium/low severity, importance, likelihood, parent assignment, or sport/tournament priority.

## 6. Conservative time semantics

Compare parsed timestamps on one absolute timeline, never localized display strings. Reuse canonical event timestamps and timezone presentation; do not add a second timezone model.

Events with a missing, invalid, zero-duration, or negative-duration end are excluded. Do not invent a duration.

Audit whether the canonical model reliably distinguishes all-day events from timed midnight-boundary events. If it does, document and test that convention. If it does not, do not infer all-day status from midnight timestamps alone. Use only behavior justified by canonical persisted timestamps, and stop if that would create misleading conflict claims.

Test timezone equivalence and an overnight overlap that crosses browser-local day groups.

## 7. The 200-row completeness boundary

The active candidate query is currently bounded at 200 rows. A definitive conflict count must not be shown when the candidate result reaches that cap because completeness is unknown.

- fewer than 200 candidates: derive and present conflicts normally;
- exactly 200 candidates: preserve the ordinary weekend event display, disable conflict badges/counts, and show only calm factual copy that Corralio could not verify every overlap;
- do not silently claim complete coverage;
- do not redesign pagination, increase the bound, or create a new query architecture without reporting the need first.

Pass only the minimum boolean completeness signal across the server/client boundary.

## 8. Implementation boundary

Prefer deterministic in-memory derivation from the already-authorized bounded candidate set after exact weekend selection. Do not scan history, persist conflicts, create conflict tables/columns, add jobs/cron, or add analytics.

The expected result requires no migration. If schema work is genuinely required for correctness, stop and report it before expanding scope.

## 9. This Weekend presentation

Without redesigning the page, make it possible to see within a few seconds:

- that conflicts exist;
- which event pair is involved;
- child/team or source-fallback context;
- the factual overlap time.

Use concise language such as `Schedule conflict` or `Potential conflict`. Never say `You can't make both`, `Impossible`, `Leave early`, or recommend an event.

When complete conflict results exist, show a compact summary near the top. `2 conflicts this weekend` means exactly two unique pairs. With no conflicts, a large success state is unnecessary. At the 200-row boundary, suppress definitive conflict claims and use the bounded neutral state from Section 7.

Conflict-involved cards need restrained treatment that does not rely on color alone. Preserve child/team labels, time, location, directions, light/dark readability, and scanning density. A badge/icon/text treatment is sufficient.

## 10. Signed-out preview

Update the synthetic signed-out preview only if cheap and truthful. Use synthetic data, describe only temporal overlap, and do not imply travel feasibility. Otherwise defer it and note that the product has earned—but the landing page does not yet make—the conflict claim.

## 11. Lifecycle, privacy, and security

Verify that disconnected events never create conflicts; unassigned active events can; reassignment changes labels/context but not identity; disconnect removes an event immediately; and child/team removal follows existing fallback behavior without stale conflict context.

Conflict data is household-private. Do not expose child names publicly, source URLs, raw locations in analytics, public conflict details, or private details through TI. Existing household RLS and authorization remain authoritative. Return only already-authorized information required by the page.

## 12. Explicitly out of scope

Do not add travel-time conflicts, can-we-make-both logic, leave-by, routing, traffic, parent/driver assignment, recommendations, AI planning, resolution actions, priority, venue matching, Mapbox work, hotel/travel context, notifications, push, collaboration, analytics, or persistent conflict history.

This slice answers only:

> **Which active family events overlap in time?**

## 13. Required tests

Add focused tests for:

- partial overlap, containment, identical intervals, touching boundaries, and separation;
- missing/invalid/zero/negative ends;
- distinct stable IDs, canonical ordering, deterministic pair ordering, and duplicate suppression;
- different-child, same-child, team-derived-child, assigned/unassigned, and source fallback;
- exact browser-local weekend selection before conflicts;
- timezone-equivalent instants and overnight cross-day overlap;
- disconnected-source query exclusion, active imported events, manual events, and archived/unavailable context;
- the 200-row completeness signal and suppression of definitive UI claims;
- stable event identity;
- `This Weekend`, assignment, lifecycle, connection/replacement, refresh/recovery, source-URL privacy, and signed-out landing regressions.

## 14. Authorized disposable UAT fixture

This prompt authorizes creating and cleaning up one wholly disposable synthetic Corralio household/membership fixture for Slice 4.2 browser UAT. It does not authorize mutating retained households, children, teams, sources, or events.

Insert fixture rows only through a controlled database boundary. Record exact IDs first. Use inert `.invalid` source URLs and never fetch them.

Minimum fixture:

- 2–3 synthetic children;
- 4+ active events across Saturday and Sunday;
- one mandatory different-child overlap;
- one mandatory same-child overlap;
- one assigned/unassigned overlap;
- one unrelated non-conflicting event;
- one disconnected-source event that would overlap if active.

Before browser UAT, use database evidence to prove the disconnected source/event exists but is excluded from the active event projection. After UAT, delete only the recorded disposable household through the approved service-role cleanup boundary. Independently confirm zero fixture household, membership, child, team, source, and event rows, while preserving the smoke authentication identity.

Do not fetch real or `.invalid` feeds.

## 15. Browser UAT

Verify at approximately 375×812 and 1280×900 in light and dark modes:

- the pair-count summary is understandable;
- involved events and factual overlap times are obvious;
- same-child, different-child, and assigned/unassigned cases are understandable;
- the disconnected control creates no conflict;
- pair warnings are not duplicated;
- cards remain scannable without horizontal overflow;
- no source URL, browser/Next.js error, or failed response appears.

Evaluate as a sports parent: **Can I tell within a few seconds where the family has overlapping commitments?** Do not claim the product solves them.

## 16. Automated verification

Run focused conflict tests, affected weekend/product-data tests, lifecycle and assignment regressions, connection/replacement and refresh/recovery regressions, TypeScript, lint, production build, and `git diff --check`.

All automated tests remain offline. Do not fetch any feed, external page unnecessarily, or invoke production cron.

## 17. Notes

Update:

```text
apps/corralio/notes.md
docs/notes.md
```

Record the conflict definition, boundary semantics, active/exact-weekend scope, pair representation/count meaning, stable child identity, invalid/all-day policy, timezone behavior, 200-row behavior, implementation layer, UI, signed-out preview decision, fixture/UAT/cleanup, checks actually run, and explicit travel/resolution deferrals. Do not record real child names, private event data, or source URLs.

## 18. Commit and final report

Inspect the complete diff, preserve unrelated worktree changes, stage only Slice 4.2 files, and commit locally without pushing. Suggested commit:

```text
feat(corralio): detect family schedule conflicts
```

Report prerequisites; audit findings; exact conflict/time model; implementation; family context; UI; lifecycle/privacy behavior; UAT fixture, viewports, cleanup; checks actually run; deferred work; and exactly one verdict:

- `SLICE 4.2 COMPLETE LOCALLY`
- `SLICE 4.2 READY AFTER LISTED FIXES`
- `SLICE 4.2 NOT READY`

## Final restrictions

- Verify prerequisites first.
- Select the exact displayed weekend before deriving conflicts.
- Detect only real positive-duration temporal overlap.
- Touching boundaries are not conflicts.
- Use stable child and event IDs; never labels/colors as identity.
- Use only active family-plan events; disconnected events never participate.
- Do not make complete claims at the 200-row cap.
- Do not infer travel feasibility, resolve, or prioritize conflicts.
- Do not add persistent conflict data.
- Keep conflict data household-private.
- Do not fetch feeds, invoke production cron, push, or deploy.
- Stop after Slice 4.2.
