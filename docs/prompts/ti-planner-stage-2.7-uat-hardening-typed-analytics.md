```md
# TournamentInsights Planner — Stage 2.7: UAT Hardening + Typed Analytics (Repo-Validated)

You are working inside the existing `RI-MVP` monorepo at `/Users/roddavis/RI_MVP/RI-MVP`.

This stage hardens the Weekend Planner for real-world UAT and adds typed analytics for meaningful planner actions.

Stage 2.3–2.6 behavior is implemented and must not regress:
- 2.3 ICS refresh behavior
- 2.4A discovery
- 2.4B suppression persistence + filtering
- 2.4C duplicate candidate detection + Keep separate dismissal persistence
- 2.4D manual merge endpoint + truncation disclosure
- 2.4E merge confirmation UI + conflict resolution
- 2.4F manual-original cleanup flow after merge
- 2.5 bounded planner pagination / loaded-event reliability
- 2.6A timezone-correct manual event entry, date/time pickers, smart end defaults
- 2.6B loaded-event schedule conflict highlighting
- 2.6C schedule-first returning parent UX pass
- 2.6D calendar view + source color coding
- 2.6E Weekend Pro calendar entitlement alignment
- Planner map behavior

Do not add major new product features.
Do not change database schema unless an existing analytics pattern already requires a safe migration.
Do not change entitlement tiers or names. Use exact entitlement strings only: `explorer`, `insider`, `weekend_pro`.
Do not hard-gate `/weekend-planner`.
Do not change duplicate detection logic, merge semantics, Keep separate semantics, or cleanup semantics.
Do not delete imported/source-linked/ICS events.
Do not introduce unbounded event queries.
Do not expose raw IDs, UUIDs, source URLs, `source_event_uid`, private notes, or private addresses in analytics payloads.
Analytics must fail open (never break planner UX).
Do not push. Commit locally only.

---

## Dev commands (ports)

Run in two terminals from repo root:
- TI Web on `3001`: `npm run dev --workspace ti-web -- -p 3001`
- Referee (“RI”) on `3000`: `npm run dev --workspace referee-app -- -p 3000`

---

## Repo-validated key paths (use these; don’t guess)

### Weekend Planner page + wiring
- `apps/ti-web/app/weekend-planner/page.tsx`
- `apps/ti-web/app/weekend-planner/actions.ts`
- `apps/ti-web/app/weekend-planner/WeekendPlannerClient.tsx`
- `apps/ti-web/app/weekend-planner/WeekendPlanActionsClient.tsx`
- `apps/ti-web/app/weekend-planner/SavedTournamentActionsClient.tsx`
- `apps/ti-web/app/weekend-planner/WeekendPlanner.module.css`

### Planner components
- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- `apps/ti-web/app/_components/planner/PlannerCalendar.tsx`
- `apps/ti-web/app/_components/planner/Planner.module.css`

### Planner API routes
- `apps/ti-web/app/api/planner/events/route.ts`
- `apps/ti-web/app/api/planner/events/[id]/route.ts`
- `apps/ti-web/app/api/planner/events/merge/route.ts`
- `apps/ti-web/app/api/planner/sources/route.ts`
- `apps/ti-web/app/api/planner/sources/import-ics/route.ts`
- `apps/ti-web/app/api/planner/timezone/route.ts`
- `apps/ti-web/app/api/planner/search/tournaments/route.ts`
- `apps/ti-web/app/api/planner/search/venues/route.ts`

### Analytics pipeline (typed + server allowlist)
- `apps/ti-web/lib/tiAnalyticsEvents.ts` (typed event union + prop typing)
- `apps/ti-web/lib/tiAnalyticsClient.ts` (client helper; follow existing pattern)
- `apps/ti-web/app/api/analytics/route.ts` (server allowlist/persistence; must fail open)
- Admin clicks dashboard (if it requires a static list): `apps/referee/app/admin/ti/clicks/page.tsx`

### UAT docs to update (must stay in sync)
- `docs/weekend-planner-uat.md`
- `docs/qa/ti-planner-ics-uat.md`
- `CLAUDE.md` (primary automated UAT script; Claude Desktop uses this)

---

## Goals

1) Consolidate UAT documentation into a practical real-world checklist (including `CLAUDE.md`).
2) Add typed analytics for meaningful planner interactions.
3) Verify entitlements across Explorer, Insider, Weekend Pro without changing tiers or gating model.
4) Verify calendar, map, list, ICS, manual events, conflicts, duplicates, merge, cleanup, and pagination still work together.

---

## 1) UAT documentation consolidation

Update:
- `docs/weekend-planner-uat.md`
- `docs/qa/ti-planner-ics-uat.md`
- `CLAUDE.md`

Create/refresh sections (all three docs should share the same structure):
1. Smoke UAT (fast pass)
2. UAT account matrix
3. Planner core UAT
4. Entitlements UAT
5. ICS + calendar feed UAT
6. Manual events + timezone UAT
7. Pagination + loaded scope UAT
8. Duplicate management UAT
9. Conflict highlighting UAT
10. Calendar/List/Map UAT
11. Regression checklist
12. Dangerous / UAT-only (SQL + console)

---

## 2) Typed analytics (planner)

### Existing analytics context (repo-validated)

Typed event names live in `apps/ti-web/lib/tiAnalyticsEvents.ts`.

The server route `apps/ti-web/app/api/analytics/route.ts` enforces allowlists/sets (for example `MAP_EVENTS`, `TRAVEL_EVENTS`, `QUICK_CHECK_EVENTS`).

Planner analytics must follow the same pattern:
- Add planner event names to the typed union in `apps/ti-web/lib/tiAnalyticsEvents.ts`.
- Ensure the server route accepts the new event names (add a `PLANNER_EVENTS` set if needed, or extend an existing set, depending on current conventions).
- If planner events should be persisted for admin review, they must be included in whichever allowlist/set triggers persistence.
- Fail open: analytics failures must never break the planner action.
- Localhost/dev should be ignored/skipped using the existing analytics filtering behavior in `apps/ti-web/app/api/analytics/route.ts`.

### Event naming

Use lowercase snake_case.

Recommended high-signal subset (implement these first):
- `planner_calendar_feed_connect_succeeded`
- `planner_calendar_feed_connect_failed`
- `planner_calendar_feed_limit_reached`
- `planner_view_toggle_clicked`
- `planner_load_more_clicked`
- `planner_manual_event_created`
- `planner_manual_event_updated`
- `planner_manual_event_deleted`
- `planner_duplicate_keep_separate_clicked`
- `planner_duplicate_merge_modal_opened`
- `planner_duplicate_merge_succeeded`
- `planner_duplicate_merge_failed`
- `planner_weekend_pro_gate_viewed`
- `planner_weekend_pro_gate_clicked`
- `planner_map_view_opened`
- `planner_calendar_event_detail_opened`

If additional events are easy and safe, add them, but do not introduce noisy impression spam.

### Payload safety (privacy rules)

Allowed payload fields (examples; use safe enums/buckets only):
- `surface: "weekend_planner"`
- `view: "calendar" | "list" | "map" | "upcoming" | "season" | "this_weekend"`
- `entitlement: "explorer" | "insider" | "weekend_pro" | "unknown"`
- `result: "succeeded" | "failed"`
- `reason_code: <safe_enum>`
- `feed_count_bucket: "0" | "1" | "2_3" | "4_plus"`
- `loaded_event_count_bucket: "0" | "1_10" | "11_50" | "51_100" | "101_plus"`
- `event_source_type: "manual" | "ics" | "unknown"`
- `gate_name: "multi_calendar" | "visual_calendar" | "source_colors" | "conflicts" | "merge_cleanup" | "map"`
- `target: "upgrade" | "connect_calendar" | "load_more" | "merge" | "cleanup" | "map" | "calendar_detail"`

Do not include:
- user IDs/emails
- event IDs, calendar feed IDs, source IDs
- source URLs, `source_event_uid`
- event titles/notes/addresses
- exact private timestamps
- raw error messages or stack traces

Use `reason_code` enums instead of raw exception messages.

### Implementation requirements

- Do not send analytics from server routes unless there is already a safe, existing server-side analytics pattern for that surface.
- Avoid duplicate firing due to rerenders (instrument at click/submit/success/failure boundaries).
- Impression events (`*_viewed`, `*_shown`) must fire at most once per visible session/state when practical.

---

## 3) Admin analytics visibility (if needed)

If the admin clicks dashboard depends on a static event list, add the new planner event names there:
- `apps/referee/app/admin/ti/clicks/page.tsx`

Do not expose private payload details in admin UI beyond existing behavior.

If updating admin UI is risky, defer and document in “Known limitations / next stage”.

---

## 4) UAT hardening bug fixes (allowed scope)

While implementing analytics/docs, fix only small, safe UAT bugs discovered during inspection:
- copy typos
- missing loaded-event disclosure
- broken empty state
- missing safe error messages
- button disabled/loading state bugs
- duplicate analytics firing
- obvious mobile overflow issues
- missing aria-labels on new controls

Not allowed: major redesign, new schema, new sync architecture, changed merge/cleanup semantics, widened/unbounded queries.

---

## 5) Validation

Run:
- `npm run build --workspace ti-web`

(Optional if touched) `npm run build --workspace referee-app`
```

