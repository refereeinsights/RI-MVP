# Weekend Planner — Current State (Post Stage 2.10)

This document is the durable snapshot of what the TI Weekend Planner is today (as of Stage 2.10), what is gated by entitlement, what must not regress, and what is intentionally deferred.

Primary UAT runner: `CLAUDE.md` (Claude Desktop). UAT framework + production-safe cleanup: `docs/weekend-planner-uat.md`. ICS/iCal checklist: `docs/qa/ti-planner-ics-uat.md`.

This is not a roadmap pitch. Keep “Implemented today” separate from “Future direction”.

---

## Current Product Surfaces

### Planner
- Canonical route: `/weekend-planner` (planner app entrypoint).
- Compatibility alias: `/planner` (should redirect to `/weekend-planner`).

Planner UI surfaces (as implemented):
- Schedule views: **Upcoming**, **This Weekend**, **Season**.
- Season display modes: **Calendar** (Weekend Pro) and **List** (fallback and for non-Weekend-Pro).
- Connected calendars: connect (ICS/iCal link) + refresh + status.
- Manual events: create/edit/delete.
- Duplicate management: suggestions, **Keep separate**, manual **merge** with explicit confirmation, optional manual-original cleanup flow.
- Conflict highlighting: schedule overlap indication for loaded events.
- Map behavior: **Map action** for an event location (external maps; mobile uses a map-picker modal). This is not a full in-planner map view unless explicitly added later.

Other TI surfaces related to weekend planning:
- `/weekend/[slug]` (weekend logistics / planning content).
- `/tournaments/[slug]/map` (planning map).
- `/book-travel` (travel booking surface).

---

## Completed Planner Stages Through 2.10

Source prompts live in `docs/prompts/`.

- **Stage 2.3 — ICS refresh behavior**
  - Refresh updates source-managed fields without destructive deletes.
  - Preserves user edits (notably: venue link + non-empty notes).
  - Must not regress.
- **Stage 2.4A — Duplicate/merge discovery**
  - Discovery documentation only (foundation for later stages).
- **Stage 2.4B — Suppression persistence + filtering**
  - Adds suppression records to hide eligible source-linked originals (refresh-proof).
  - Keep separate does not hide events.
- **Stage 2.4C — Duplicate candidate detection + Keep separate**
  - Candidate suggestions are advisory.
  - Keep separate dismisses suggestions only (never hides events).
- **Stage 2.4D — Manual merge endpoint + truncation disclosure**
  - Manual merge endpoint creates a canonical manual event.
  - When event sets are incomplete, UI discloses “loaded events only”.
- **Stage 2.4E — Merge confirmation UI**
  - Merge requires explicit user confirmation.
  - Winner selection for conflicting fields is UI-mediated.
- **Stage 2.4F — Manual-original cleanup after merge**
  - Optional cleanup for just-merged manual originals only (explicit, bounded).
- **Stage 2.5 — Bounded pagination + loaded-event reliability**
  - Planner event queries remain bounded.
  - “Load more” expands the loaded set without unbounded queries.
- **Stage 2.6A — Manual events + timezone correctness**
  - Date/time pickers (no `datetime-local` regression).
  - Avoid calendar-day shifts across save/refresh.
  - Smart end default (+1 hour) until user override.
- **Stage 2.6B — Loaded-event conflict highlighting**
  - Conflicts computed only across loaded events; disclosed honestly.
- **Stage 2.6C — Schedule-first UX**
  - Maintain the schedule-first hierarchy and parent flow.
- **Stage 2.6D — Calendar view + source color coding**
  - Season visual calendar uses loaded events only and does not refetch separately.
  - Source colors are stable for the session; manual is neutral.
- **Stage 2.6E — Weekend Pro entitlement alignment**
  - Multi-feed and premium calendar surfaces are Weekend Pro gated.
  - Insider retains core planner/manual functionality with 1 calendar limit.
- **Stage 2.7 — UAT hardening + typed analytics**
  - Consolidates UAT documentation and adds typed analytics for meaningful planner actions.
  - Analytics must remain privacy-safe and fail open.
- **Stage 2.8 — UAT findings polish + launch readiness**
  - Fixes small UAT trust/clarity issues without changing planner semantics.
  - Adds/updates UAT checklists (notably in `CLAUDE.md`) and reinforces “no dead primary actions”.
- **Stage 2.10 — Venue metadata hydration (linked-venue display)**
  - Planner events now enrich optional `linkedVenue` metadata from `venues_public` in `GET /api/planner/events`, `PATCH /api/planner/events/[id]`, `POST /api/planner/events`, and `/weekend-planner` server-side render.
  - List cards and calendar detail render linked venue name/address/city/state (`Venue Name · Address · City, State`) when available, with fallback to existing address text.
  - Venue-linked events now reuse linked location text for map and duplicate-merge previews.

---

## Canonical Planner Entitlement Gates

Use exact tier strings: `explorer`, `insider`, `weekend_pro`.

Notes:
- `/weekend-planner` is not hard-gated.
- Explorer messaging must be sign-in / verify-email oriented (not paid framing).

### Explorer
Explorer includes:
- signed-out users
- signed-in but unverified users

Explorer can:
- view public TI surfaces (tournaments/venues/travel surfaces as implemented)
- see the planner value proposition

Explorer cannot:
- connect calendars
- create durable planner events

### Insider
Insider can:
- use basic planner list/manual-event functionality
- create/edit/delete manual events
- use Upcoming / This Weekend / Season (List)
- connect up to **1** calendar feed (if verified)
- refresh/manage the allowed calendar feed

Insider is gated from:
- connecting more than 1 calendar feed
- premium Season Calendar experience (if gated)

### Weekend Pro
Weekend Pro can:
- connect multiple calendar feeds
- use Season visual calendar
- use source color coding and other premium planner intelligence as implemented

Guardrails:
- Existing over-limit feeds must not be deleted.
- Imported/source-linked/ICS events must not be deleted.

---

## Calendar and ICS Source Model

### Implemented today
- Calendar feeds are private, user-owned sources.
- ICS events are source-linked planner events (not public tournament sources).
- Refresh updates source-managed fields; does not destructively delete missing feed events.
- Refresh preserves user edits (notably: venue link + non-empty notes).
- Suppressions are refresh-proof where implemented (hiding eligible merged originals without deleting them).
- Merge does not delete source-linked originals.
- Keep separate dismisses suggestions only and does not hide events.

### Future direction (not necessarily implemented)
- Better compatibility testing across real-world ICS sources (TeamSnap/SportsEngine/GameChanger/Google/Apple/Outlook/etc.).
- More robust handling of moved/canceled/removed events based on iCal semantics.
- Explicit modeling of “removed from feed” without hard deletion.

---

## Duplicate Management Rules (Non-Negotiable)

- Duplicate detection is advisory only.
- Merge is manual only and requires explicit confirmation.
- No automatic merge.
- No source event deletion.
- Keep separate dismisses suggestions only (never hides events).
- Suppressions hide eligible merged source-linked/ICS originals only.
- Manual originals are not automatically hidden.
- Manual cleanup is optional and explicit (bounded to just-merged IDs).
- Duplicate/conflict detection is loaded-event scoped unless bounded full-coverage is explicitly implemented.
- UI must disclose loaded-event scope when incomplete.

---

## Loaded-Event Scope and Pagination Rules

- Planner event queries must remain bounded.
- Pagination/load more expands the loaded set deterministically.
- While more events exist, duplicates/conflicts must be described as “loaded events only”.
- Calendar/List reflect loaded events only.
- Do not imply full-season coverage when events remain unloaded.

---

## Manual Events and Timezone Rules

- Use date/time pickers; do not regress to `datetime-local`.
- Do not reintroduce `new Date(datetimeLocal).toISOString()` patterns.
- Store `starts_at`/`ends_at` as UTC instants; interpret input in the chosen event timezone.
- Smart end defaults to start + 1 hour until user override.
- Avoid calendar-day shifts on save + refresh.

---

## Calendar, List, and Map Behavior

- List is the durable fallback.
- Season Calendar is gated by entitlement (Weekend Pro) where implemented.
- Calendar uses loaded events only; it must not refetch planner events independently.
- Source color coding must not expose raw source IDs/URLs.
- Timezone override is session-only where implemented.
- Empty state is helpful and does not hide toggles.
- Failure fallback should keep planner usable.
- Map behavior is an event-level action to open external maps (and a mobile map-picker), not a full planner map view unless explicitly added.

---

## Analytics Implemented in Stage 2.7

### Implemented today
- Typed planner event names are defined in `apps/ti-web/lib/tiAnalyticsEvents.ts`.
- Planner events are allowlisted for persistence in `apps/ti-web/app/api/analytics/route.ts` and stored in `public.ti_map_events`.
- Admin review surface includes planner event keys in `apps/referee/app/admin/ti/clicks/page.tsx`.

### Privacy rules (non-negotiable)
Analytics payloads must not include:
- user IDs/emails
- planner event IDs, calendar feed IDs, source IDs
- source URLs or `source_event_uid`
- event titles, notes, addresses
- exact private timestamps

Analytics must fail open (never block planner UX).

---

## UAT Status After Stage 2.7

UAT docs are consolidated across:
- `CLAUDE.md` (Smoke UAT + Deep UAT checklists)
- `docs/weekend-planner-uat.md` (production-safe framework + cleanup)
- `docs/qa/ti-planner-ics-uat.md` (ICS/iCal checklist)

Recommended UAT account matrix:
- Explorer signed-out
- Explorer signed-in unverified
- Insider: 0 feeds
- Insider: 1 feed
- Insider: over-limit state (if possible)
- Weekend Pro: 0 feeds
- Weekend Pro: 2–3 feeds
- Weekend Pro: manual + ICS duplicates
- Weekend Pro: conflicts
- Weekend Pro: cross-timezone scenarios

---

## Launch Readiness Assessment

Status: **Ready for limited UAT**.

Blockers to broader launch should be documented based on real-world ICS feed compatibility and any remaining UAT findings.

---

## Recommended Next Stages

### Stage 2.8 — UAT Findings Polish + Launch Readiness
Scope:
- small fixes from UAT
- copy clarity, empty states, loading states
- mobile spacing/overflow fixes
- entitlement gate clarity
- loaded-event disclosure clarity

Non-goals:
- schema changes
- major sync architecture changes

### Stage 2.9A — ICS Source Identity Audit + Sports Family UAT Prep (docs-only)
Scope:
- audit and document current ICS import/refresh identity + overlay preservation behavior
- add Sports Family benchmark checklist and a platform compatibility matrix shell
- do not require real platform feeds yet

Prompt archive:
- `docs/prompts/ti-planner-stage-2.9a-ics-source-identity-audit-sports-family-uat-prep.md`

### Stage 2.9B — Real platform feed UAT (TeamSnap/GameChanger/etc.)
Scope:
- import real public/subscription ICS feeds
- fill in the compatibility matrix with observed behavior (UID stability, cancellation semantics, recurrence quirks, etc.)
- capture update/move/cancel behavior and overlay preservation results

### Stage 2.9C — Source identity hardening (code changes, based on 2.9B findings)
Scope:
- targeted refresh identity improvements only after real-platform results are captured
- must preserve suppressions, overlays, merge semantics, and “no hard delete” rules

Non-goals for 2.9A–2.9C:
- OAuth/scraping/private credential storage

### Stage 2.10 — Venue metadata hydration + display parity (implemented)
- Scope:
  - server-side event payload enrichment for `linkedVenue` from `venues_public`;
  - list/calendar UI uses linked venue metadata when present, with fallback to existing `address_text/city/state`;
  - linked venue persists during edit and duplicate merge preview rendering.
- Prompt:
  - Noted as a Stage 2.10 implementation in this repository.

---

## Future Prompt Guardrails

- Do not hard-gate `/weekend-planner`.
- Use exact entitlement strings `explorer`, `insider`, `weekend_pro`.
- Explorer messaging is sign-in/verify oriented, not paid framing.
- Do not delete source-linked/ICS events.
- No automatic merge; no automatic cleanup.
- Keep separate never hides events.
- Disclose loaded-event scope when incomplete.
- No unbounded planner event queries.
- No raw IDs/source URLs/source_event_uid in UI or analytics.
- Preserve Stage 2.6A timezone-safe manual event entry.
- Preserve user edits through refresh.
- Do not claim unbuilt features exist.
