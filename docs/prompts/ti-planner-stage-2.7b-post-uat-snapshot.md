```md
# TournamentInsights Planner — Stage 2.7B: Post-UAT Completion Snapshot + Gate Documentation (Repo-Validated)

You are working inside the existing `RI-MVP` monorepo at `/Users/roddavis/RI_MVP/RI-MVP`.

Stage 2.7 (UAT hardening + typed analytics) has been implemented. This stage is **documentation-only**:
- Document the current implemented state, entitlement gates, completed capabilities, known limitations, and recommended next steps.
- Keep a clear separation between **Implemented today** vs **Future direction**.

Do not change runtime product behavior (code). Documentation reference fixes only.
Do not change database schema.
Do not change entitlement logic.
Do not change analytics logic.
Do not change duplicate detection logic.
Do not change merge semantics.
Do not change Keep separate semantics.
Do not change manual cleanup semantics.
Do not change ICS refresh behavior.
Do not change calendar/list/map behavior.
Do not change timezone parsing/formatting.
Do not delete imported/source-linked/ICS events.
Do not introduce unbounded event queries.
Do not push. Commit locally only.

---

## Goal

Create a durable post-2.7 documentation snapshot that captures:

1) What Weekend Planner functionality is currently implemented.
2) What is gated by entitlement.
3) What remains accessible to Explorer, Insider, and Weekend Pro.
4) Which capabilities are intentionally deferred.
5) Which behaviors must not regress.
6) Recommended next stages.
7) UAT status: what was proven vs what still needs real-world testing.

This snapshot should become a canonical reference for future Codex/Claude/GPT prompts.

---

## Repo-validated reference paths (use these; don’t guess)

### Core UAT + docs
- `CLAUDE.md` (primary automated UAT runner; may be gitignored locally)
- `docs/weekend-planner-uat.md`
- `docs/qa/ti-planner-ics-uat.md`
- `docs/admin-reference.md`
- `docs/notes.md`
- `docs/notes-ti.md`
- Stage 2.7 prompt: `docs/prompts/ti-planner-stage-2.7-uat-hardening-typed-analytics.md`

### Planner implementation (for factual verification only; do not change in this stage)
- Planner entry: `apps/ti-web/app/weekend-planner/page.tsx`
- Shared planner UI: `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- Season calendar: `apps/ti-web/app/_components/planner/PlannerCalendar.tsx`
- Planner APIs: `apps/ti-web/app/api/planner/**`

### Analytics implementation (for factual verification only; do not change in this stage)
- Typed event names: `apps/ti-web/lib/tiAnalyticsEvents.ts`
- Analytics ingestion + allowlists: `apps/ti-web/app/api/analytics/route.ts`
- Admin review surface: `apps/referee/app/admin/ti/clicks/page.tsx`

---

## Documentation deliverables (create/update)

Inspect existing docs first and update the most appropriate files.

Must update:
- `docs/weekend-planner-uat.md`
- `docs/qa/ti-planner-ics-uat.md`
- `docs/admin-reference.md` (add/refresh the post-2.7 summary)
- `docs/notes.md` and `docs/notes-ti.md` (log the documentation snapshot)

If a durable “current state” doc does not exist, create:
- `docs/weekend-planner-current-state.md`

Prefer a single well-organized “current state” doc over many fragmented docs.

---

## 1) Completed stage inventory

Add a section:

## Completed Planner Stages Through 2.7

Include at least:
- Stage 2.3 — ICS refresh behavior and user edit preservation
- Stage 2.4A — duplicate discovery
- Stage 2.4B — suppression persistence and filtering
- Stage 2.4C — duplicate candidate detection and Keep separate dismissal persistence
- Stage 2.4D — manual merge endpoint and truncation disclosure
- Stage 2.4E — merge confirmation UI and conflict resolution
- Stage 2.4F — manual-original cleanup flow after merge
- Stage 2.5 — bounded planner pagination and loaded-event reliability
- Stage 2.6A — timezone-correct manual event entry, pickers, smart end defaults
- Stage 2.6B — loaded-event schedule conflict highlighting
- Stage 2.6C — schedule-first returning parent UX
- Stage 2.6D — calendar view + source color coding
- Stage 2.6E — Weekend Pro calendar entitlement alignment
- Stage 2.7 — UAT hardening + typed analytics

For each stage, document:
- What is implemented
- What must not regress
- Known limitations
- Entitlement/gating notes (only if it is truly gated)

Use factual language based on the codebase.

---

## 2) Current product surfaces (do not over-claim)

Add a section:

## Current Product Surfaces

Document the surfaces/routes that exist today, such as:
- `/weekend-planner` (canonical planner entry)
- `/planner` (compatibility alias; should redirect)
- `/weekend/[slug]`
- `/tournaments/[slug]/map`
- `/book-travel`

For planner UI surfaces, document what exists in the current implementation:
- schedule views: Upcoming / This Weekend / Season
- Season display modes: Calendar / List (if present)
- connected calendars management (connect + refresh)
- manual event create/edit/delete
- duplicate suggestions + Keep separate
- merge confirmation + optional cleanup
- conflict highlighting
- map behavior (be specific: “map action / mobile map picker / external maps”, unless a true planner map view exists)

For each surface, document:
- Who can see it
- Whether it’s public, signed-in gated, verified-email gated, or Weekend Pro gated
- Privacy rules (no raw IDs/URLs/UIDs)

---

## 3) Canonical entitlement gates (match implementation)

Add a section:

## Canonical Planner Entitlement Gates

Use exact tier strings only: `explorer`, `insider`, `weekend_pro`.

Document gates as implemented (not aspirational). If the planner does not explicitly compute “insider vs explorer” tier client-side, document the behavior-based gates (signed-out vs signed-in/unverified vs signed-in/verified + Weekend Pro).

Rules:
- `/weekend-planner` is not hard-gated.
- Explorer messaging is sign-in / verify-email oriented (not paid framing).
- Existing over-limit feeds must not be deleted.
- Imported/source-linked/ICS events must not be deleted.
- Upgrade copy should be parent-friendly and benefit-oriented.
- Weekend Pro users should not see irrelevant upgrade copy.

---

## 4) Calendar / ICS source model

Add a section:

## Calendar and ICS Source Model

Clearly separate:
- **Implemented today**
- **Partially implemented / verify**
- **Future direction**

Document current behavior such as:
- feeds are user-owned private sources
- source-linked events are imported planner events (not public tournament sources)
- refresh preserves user edits where implemented
- suppressions remain refresh-proof where implemented
- merge does not delete source events; eligible originals are hidden via suppression
- Keep separate dismisses suggestions only (does not hide events)

Do not claim future items are deployed unless verified in code.

---

## 5) Duplicate lifecycle guardrails

Add a section:

## Duplicate Management Rules

Non-negotiable:
- duplicates are advisory only
- merge is manual only (explicit confirmation)
- no automatic merge
- no source event deletion
- Keep separate dismisses suggestions only
- suppressions hide eligible merged source-linked/ICS originals only
- manual originals are not automatically hidden
- manual cleanup is optional and explicit
- duplicate detection is loaded-event scoped unless a bounded server endpoint exists

Include the exact current loaded-scope disclosure copy from the UI if available.

---

## 6) Loaded-event scope + pagination guardrails

Add a section:

## Loaded-Event Scope and Pagination Rules

Document:
- event queries remain bounded
- Load more/pagination behavior
- duplicates/conflicts consider loaded events only when more events exist
- calendar/list/map reflect loaded events only (unless documented otherwise)
- UI must not imply full-season coverage when events remain unloaded

---

## 7) Manual events + timezone guardrails

Add a section:

## Manual Events and Timezone Rules

Document:
- date/time pickers (no `datetime-local` regression)
- avoid `new Date(datetime-local).toISOString()` patterns
- UTC instant storage + explicit timezone behavior
- smart end defaults (+1 hour) until user override
- prevent calendar-day shifts on save+refresh

---

## 8) Calendar/list/map behavior (as implemented)

Add a section:

## Calendar, List, and Map Behavior

Document:
- list as durable fallback
- Season Calendar availability by entitlement (if gated)
- calendar uses loaded events only; no second fetch
- source color coding rules
- timezone override behavior
- empty states and failure fallback
- mobile behavior
- no drag/drop rescheduling, no recurring event UI
- privacy constraints in detail panels

---

## 9) Analytics implemented in Stage 2.7 (document reality)

Add a section:

## Analytics Implemented in Stage 2.7

List the analytics events actually implemented (from `apps/ti-web/lib/tiAnalyticsEvents.ts`) and:
- where each fires
- safe payload fields
- explicit privacy exclusions
- persistence behavior (only allowlisted events are stored by `/api/analytics`)

If some events were deferred, include:

## Analytics Deferred

---

## 10) UAT status + launch readiness

Add sections:

## UAT Status After Stage 2.7
## Launch Readiness Assessment

Use one status:
- Not ready for public launch
- Ready for limited UAT
- Ready for private beta
- Ready for soft launch
- Ready for public launch

Be conservative and honest based on UAT evidence and known limitations.

---

## 11) Recommended next stages

Add a section:

## Recommended Next Stages

Example structure:
- Stage 2.8 — UAT findings polish + launch readiness (small fixes only)
- Stage 2.9 — real ICS feed compatibility + source identity hardening
- Stage 3.0 — multi-child/player profiles + color coding (only after ICS stability)
- Stage 3.1 — venue-aware/travel-time conflict intelligence (only after identity + assignment stability)

---

## 12) Future prompt guardrails

Add a section:

## Future Prompt Guardrails

Include:
- do not hard-gate `/weekend-planner`
- use exact entitlement strings `explorer`, `insider`, `weekend_pro`
- no deletion of source-linked/ICS events
- no automatic merge/cleanup
- Keep separate never hides events
- disclose loaded-event scope when incomplete
- no unbounded planner queries
- no raw IDs/source URLs/source_event_uid in UI or analytics
- preserve Stage 2.6A timezone-safe manual event entry
- preserve user edits through refresh
- do not claim unbuilt features exist

---

## Validation (docs stage)

If you only changed docs:
- You may skip builds, but state explicitly what was skipped.

If you touched any TS/TSX code (should not in this stage):
- Run `npm run build --workspace ti-web`.
```

