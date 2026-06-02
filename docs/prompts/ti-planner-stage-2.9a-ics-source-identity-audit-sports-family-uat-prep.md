# TournamentInsights Planner — Stage 2.9A (Repo-Validated, Docs-Only): ICS Source Identity Audit + Sports Family UAT Prep

You are working in `RI-MVP` at:
`/Users/roddavis/RI_MVP/RI-MVP`.

This version is intentionally stricter than the previous draft and aligned to current production code as-of **2026-06-02**.

## Stage purpose

Stage 2.9A is a **documentation, audit, and UAT-scaffold prep pass only** that must prepare the repo for safe 2.9B platform feed compatibility work.  
No runtime behavior changes are expected in this stage.

## Hard constraints

- Do not change runtime code in this stage.
- Do not change DB schema.
- Do not add OAuth/scraping/credential ingestion.
- Do not change entitlement values. Use only `explorer`, `insider`, `weekend_pro`.
- Do not hard-gate `/weekend-planner`.
- Avoid unbounded reads.
- Do not claim live sync, webhook pushes, or OAuth-based integration in docs.
- Never push.

If you discover a real code defect, document a `Stage 2.9A-FIX follow-up` with:
1) exact symptom, 2) 2.9B impact, 3) minimal fix scope, 4) exact file(s).

## Stage scope and current repo context

- Stage 2.9B-0 source labels + one Team Connect baseline row is already present in docs.
- Stage 2.9B-1A is ongoing (team connect feed behavior capture).
- Stage 2.7+ analytics and entitlement hardening are already in place and must not be regressed.

## Canonical repo paths (do not guess)

**Routes**
- `apps/ti-web/app/api/planner/sources/import-ics/route.ts`
- `apps/ti-web/app/api/planner/sources/[id]/refresh/route.ts`
- `apps/ti-web/app/api/planner/sources/route.ts`
- `apps/ti-web/app/api/planner/sources/[id]/route.ts` (source label edit)
- `apps/ti-web/app/api/planner/events/route.ts`

**Core implementation**
- `apps/ti-web/lib/planner/ics-import.ts`
- `apps/ti-web/lib/planner/__fixtures__/`

**UI surfaces that expose source identity**
- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- `apps/ti-web/app/_components/planner/PlannerCalendar.tsx`

**Docs/UAT references to update**
- `docs/weekend-planner-current-state.md`
- `docs/qa/ti-planner-ics-uat.md`
- `docs/weekend-planner-uat.md`
- `CLAUDE.md`

**Migration/database references**
- `supabase/migrations/20260526_ti_planner_stage2_ics_unique_uid.sql`
- `supabase/migrations/20260526_ti_planner_stage2_sources_unique_url.sql`
- `supabase/migrations/20260527_ti_planner_public_search_surfaces.sql`

For this stage, treat table facts as read-only facts:
- `planner_event_sources`: `source_type`, `source_url`, `source_name`, `team_name`, `sync_status`, `sync_error`, `last_synced_at`.
- `planner_events`: `source_type`, `source_id`, `source_event_uid`, `notes`, `venue_id`, `source-managed metadata`.
- `planner_event_suppressions`: suppression persistence (keep-separate) is already implemented.

## Deliverables (all docs-only)

### A) “What exists today” identity/refresh audit

Update `docs/weekend-planner-current-state.md` (or a linked section) with explicit evidence-backed rows in this format:

- `✅ Implemented today` / `⚠️ Partial` / `❌ Not implemented`  
- Each item must include file references and concrete behavior.

Required items:

1. Source/table model
   - where source rows and event rows are stored
   - index/uniqueness assumptions used for identity
2. Source URL handling
   - accepted protocols
   - host validation, private/local blocks
   - redirect behavior
3. Parser/ingest stack
   - parser/library
4. Identity strategy
   - same source + same UID
   - same source + different UID
   - different source + same UID
   - missing UID fallback
   - recurrence behavior (`RRULE`, `RECURRENCE-ID`, `EXDATE`)
5. Overlay preservation
   - what fields survive refresh (for example notes + venue link)
   - what is intentionally refreshed from feed
6. Remove/cancel handling
   - `STATUS:CANCELLED` / `METHOD:CANCEL`
   - feed drops/missing events
7. Metadata ingestion
   - use of `DTSTAMP`, `LAST-MODIFIED`, `SEQUENCE`, hashes, timezone fields

Use this evidence set from current code:
- Identity matching is per `(source_id, source_event_uid)` with unique index enforcement.
- Missing UID events use deterministic fallback hash generation.
- Recurring VEVENTs are expanded with RRULE windowing.
- Refresh updates source-managed fields and does **not** overwrite manual `notes`.
- `planner_event_suppressions` handles keep-separate behavior; suppressions are persistence-backed.
- Missing/cancel events are not hard-deleted in current refresh path.
- URL validation blocks private/local hosts and enforces `http`/`https` only.

### B) Stage 2.9B compatibility matrix hygiene

In `docs/qa/ti-planner-ics-uat.md`, keep a strict matrix with explicit “Not yet tested” defaults for:

- Platforms: GameChanger, TeamSnap, SportsEngine/MySE, Sports Connect/Blue Sombrero, PlayMetrics, LeagueApps, Spond/Heja  
- Relays: Google, Apple, Outlook, Generic ICS/Webcal

For each row track:
- URL source, feed type, cookie/auth requirement, UID stability, recurrence, cancel/delete, update behavior, overlay preservation, known quirks, recommendation.

### C) Sports Family execution checklist

Update/check `docs/weekend-planner-uat.md` so the Stage 2.9B checklist includes:
- PII-safe naming conventions for test accounts/event fixtures
- no OAuth/credential storage requirement
- consistent baseline → update → cancel/remove → refresh flow
- copy/paste overlay checks after refresh

### D) `CLAUDE.md` and prompt linkage

- Ensure `CLAUDE.md` points to the latest 2.9A/2.9B docs and marks unresolved items clearly as open.
- Do not change any executable UAT commands unless they are already implemented paths.

### E) Final 2.9A completion criteria

- Matrix + checklists exist and remain source-of-truth linked.
- Audit section labels behavior as `Implemented / Partial / Not implemented` with file references.
- No claims beyond pull-based ICS refresh behavior.
- No changes to DB shape, entitlement values, route contracts, or analytics event schema.

## Safety reminders for prompt execution

- Do not add new analytics event names in this stage; Stage 2.7 already defines planner persistence events in:
  - `apps/ti-web/lib/tiAnalyticsEvents.ts`
  - `apps/ti-web/app/api/analytics/route.ts`
- When a referenced file is absent, document it in `Stage 2.9A-FIX follow-up` and continue with available evidence.

