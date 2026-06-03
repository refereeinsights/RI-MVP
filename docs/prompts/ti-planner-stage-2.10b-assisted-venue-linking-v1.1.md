# TournamentInsights Weekend Planner — Stage 2.10B: Assisted Venue Linking (v1.1)

## Scope
Implement user-confirmed venue linking for Weekend Planner events only.  
No automatic matching, background sync, bulk linking, schema changes, or behavior changes to ICS refresh, duplicate/merge, or entitlement logic.

## Non-negotiables (must not regress)
- Stage 2.3 ICS refresh behavior
- Stage 2.4A–2.4F duplicate/merge lifecycle
- Stage 2.5 pagination/load-bound rules
- Stage 2.6A timezone/manual-event behavior
- Stage 2.6B conflict highlighting
- Stage 2.6C schedule-first UX
- Stage 2.6D calendar view/source colors
- Stage 2.6E entitlement alignment
- Stage 2.7 typed analytics posture
- Stage 2.8 polish and launch-readiness gates
- Stage 2.9A / 2.9B / 2.9C hardening scope
- Stage 2.10 venue data capture + 2.10A linked name display

## Product principle
- Feed location text is source data and must be preserved.
- Linked TI venue is user-selected Weekend Planner context.
- User-selected venue wins over source location text and must survive refresh.
- No auto-linking and no fuzzy auto-save.

## Hard boundaries
- Do not introduce unbounded venue/event queries.
- Do not expose raw IDs, UUIDs, source URLs, source_event_uid, notes, addresses, event titles, or exact private times in analytics payloads.
- Do not delete/recreate events.
- Do not alter source identity semantics.
- Do not add Owl’s Eye/ travel-time/parking/food intelligence in this stage.

## 1) Repo verification before changes
Before implementing, confirm actual source paths and types:
- venue storage model and key fields
- existing venue search endpoint/helper
- existing event update endpoints
- where linked venue currently renders in event list/detail/edit
- whether Clear venue already exists
- whether linked venue survives refresh today
- existing analytics pattern and event emitter

Use existing helpers/APIs where possible. Do not assume field or route names.

## 2) Assisted linking flow (mandatory behavior)
1. User opens event edit/detail surface and clicks `Find venue` / `Link venue`.
2. Open venue search UI (existing or minimal focused new UI).
3. Prefill query in this priority order when available:
   1. source location text
   2. `address_text`
   3. city/state
   4. current linked venue name
4. User edits query and runs search.
5. Show bounded results with safe fields (name, city, state, address when available).
6. User explicitly selects one venue.
7. Save venue link through existing event update route.
8. Keep source location text visible.
9. Preserve event and existing fields except explicit venue link field.
10. Keep feed labels/source colors intact.
11. Support clearing venue context (clears only venue link).

## 3) Venue search constraints
- Search must be bounded by existing indexed/paginated patterns.
- Debounce user input where patterns already use debounce.
- No expensive broad scan.
- Do not execute unnecessary search on blank state unless existing app already does this safely.
- Show user-safe empty state:
  - `No matching TI venues found. Try a different venue name.`

## 4) UI and display requirements
- Venue result item:
  - name
  - city/state
  - address if present
- Keep feed source location visible and distinct from linked TI venue context.
- If save works, display linked venue name and preserve source location text.
- Ensure mobile modal/panel is usable (no horizontal overflow, clear close/cancel).

## 5) Save/Clear behavior
On save:
- Persist selected venue to the event.
- Do not overwrite source location or unrelated event fields.
- Keep no event deletion or recreate.
- On failure: show safe message and keep user context.

On clear:
- Remove linked venue only.
- Leave source location and source-managed fields unchanged.
- Keep event/list/calendar behavior stable.

## 6) Analytics (if touched)
Only add analytics if they are clearly low-risk and existing analytics plumbing is already present for this stage.
If Stage 2.10B adds events, use typed safe event names:
- `weekend_planner_venue_search_opened`
- `weekend_planner_venue_search_submitted`
- `weekend_planner_venue_link_selected`
- `weekend_planner_venue_link_saved`
- `weekend_planner_venue_link_failed`
- `weekend_planner_venue_link_cleared`

Allowed fields: entitlement, surface, event_source_type, has_source_location, result_count_bucket, reason_code.  
Disallowed: raw IDs, raw venue IDs, source IDs, source URLs, source_event_uid, title, notes, address text, exact private times.

## 7) Docs updates required
Update if this stage proceeds:
- `docs/weekend-planner-current-state.md`
- `docs/weekend-planner-uat.md`
- `docs/qa/ti-planner-ics-uat.md`
- `CLAUDE.md` (Claude checklist + stage status)

Checklist additions:
- prefill behavior from source location
- bounded search
- explicit select/confirm
- source location remains visible
- linked venue survives refresh/reload
- clear removes only venue context
- no raw IDs/events/source identifiers in UI
- no automatic venue matching

## 8) Claude UAT checklist (Stage 2.10B)
1) Open find-link flow from imported event; confirm search UI opens and prefill is used when available.  
2) Search edits + bounded results; no raw IDs shown.  
3) Select venue; confirm linked name renders and source location remains visible.  
4) Reload page and refresh connected source feed; confirm link persists and source location persists.  
5) Clear linked venue; verify only context clears.  
6) Mobile: search UI usable, no overflow.  
7) Regression spot checks: 2.6A, 2.6B, 2.9B labels, duplicate/merge/manual cleanup, entitlement behavior.

## 9) Acceptance criteria
- Find/Link opens and supports user search.
- Search is bounded and editable.
- User confirmation required to save.
- Saved link shown by name.
- Source location stays visible and unchanged.
- Linked venue survives reload and source refresh.
- Clear removes only linked venue context.
- No auto-linking added.
- No unbounded venue queries.
- No raw IDs/URLs/source identifiers newly exposed in UI or analytics.
- no source-linked event deletion.
- Existing entitlement/merge/conflict/calendar/list behavior remains stable.
- Validation run and results recorded (`npm run build --workspace ti-web`, `npx tsc -p apps/ti-web/tsconfig.json --noEmit`) if implementation occurs.

## 10) Suggested commit
`feat(weekend-planner): stage 2.10b assisted venue linking`
Commit locally only; do not push.
