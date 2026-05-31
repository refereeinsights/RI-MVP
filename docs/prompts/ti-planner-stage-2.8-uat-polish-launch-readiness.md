```md
# TournamentInsights Planner — Stage 2.8: UAT Findings Polish + Launch Readiness (Repo-Validated)

You are working inside the existing `RI-MVP` monorepo at `/Users/roddavis/RI_MVP/RI-MVP`.

Stage 2.3–2.7 behavior is implemented and must be preserved:
- Stage 2.3 ICS refresh behavior (incl. preserving user edits where implemented)
- Stage 2.4A discovery
- Stage 2.4B suppression persistence + filtering
- Stage 2.4C duplicates + Keep separate dismissal persistence
- Stage 2.4D merge endpoint + truncation/loaded-scope disclosure
- Stage 2.4E merge confirmation UI + conflict resolution
- Stage 2.4F manual-original cleanup flow after merge
- Stage 2.5 bounded pagination / loaded-event reliability
- Stage 2.6A timezone-correct manual events (pickers + smart end defaults)
- Stage 2.6B loaded-event conflict highlighting
- Stage 2.6C schedule-first UX
- Stage 2.6D Season calendar view + source colors (Weekend Pro gated)
- Stage 2.6E entitlement alignment (exact tier strings)
- Stage 2.7 UAT hardening + typed analytics

This stage is a polish + launch-readiness pass. Fix small UAT findings, tighten trust, improve clarity, and prepare Weekend Planner for limited UAT / private beta.

## Hard constraints (do not violate)
- Do not add major new product features.
- Do not change database schema.
- Do not add new entitlement tiers.
- Use exact entitlement strings only: `explorer`, `insider`, `weekend_pro`.
- Do not hard-gate `/weekend-planner`.
- Do not change duplicate detection logic, merge semantics, Keep separate semantics, cleanup semantics.
- Do not change ICS refresh architecture (bug fixes only).
- Do not change timezone parsing/formatting from Stage 2.6A except safe bug fixes.
- Do not remove pagination behavior from Stage 2.5.
- Do not remove conflict highlighting from Stage 2.6B for entitled users.
- Do not undo schedule-first hierarchy from Stage 2.6C.
- Do not remove calendar/list/map behavior (but do not invent a full in-planner map if it does not exist).
- Do not delete imported/source-linked/ICS events.
- Do not introduce unbounded event queries.
- Analytics: do not expose raw IDs, UUIDs, source URLs, `source_event_uid`, private notes, private addresses, event titles, or exact private event times in analytics payloads.
- Do not push. Commit locally only.

---

## Goal

Polish Weekend Planner based on UAT readiness needs.

Make the planner feel:
- trustworthy
- understandable
- mobile-friendly
- schedule-first
- entitlement-clear
- honest about loaded-event scope

This stage should:
1) Fix small UAT findings and obvious rough edges.
2) Improve copy clarity, empty states, and error states.
3) Tighten loading/disabled states (no “dead” buttons).
4) Improve mobile layout/overflow.
5) Clarify entitlement gates and upgrade moments (non-blocking).
6) Clarify loaded-event disclosures.
7) Verify analytics are firing safely and not over-firing.

---

## Canonical docs (must update when behaviors/copy change)

- `docs/weekend-planner-current-state.md` (canonical snapshot)
- `docs/weekend-planner-uat.md`
- `docs/qa/ti-planner-ics-uat.md`
- `CLAUDE.md` (primary automated UAT runner; keep in sync)
- `docs/notes.md` + `docs/notes-ti.md`

---

## Repo-validated key paths (use these; don’t guess)

Planner UI:
- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- `apps/ti-web/app/_components/planner/PlannerCalendar.tsx`
- `apps/ti-web/app/_components/planner/Planner.module.css`

Planner routes/APIs:
- Entry: `apps/ti-web/app/weekend-planner/page.tsx`
- Events: `apps/ti-web/app/api/planner/events/route.ts`
- Event detail: `apps/ti-web/app/api/planner/events/[id]/route.ts`
- Merge: `apps/ti-web/app/api/planner/events/merge/route.ts`
- Sources: `apps/ti-web/app/api/planner/sources/route.ts`
- Import: `apps/ti-web/app/api/planner/sources/import-ics/route.ts`
- Refresh: `apps/ti-web/app/api/planner/sources/[id]/refresh/route.ts`
- Search: `apps/ti-web/app/api/planner/search/**`
- Timezone: `apps/ti-web/app/api/planner/timezone/route.ts`

Analytics:
- Typed events: `apps/ti-web/lib/tiAnalyticsEvents.ts`
- Ingestion + allowlists: `apps/ti-web/app/api/analytics/route.ts`
- Admin review: `apps/referee/app/admin/ti/clicks/page.tsx`

Auth:
- Canonical signout: `/logout` → `apps/ti-web/app/logout/route.ts`
- Alias signout: `/account/logout` → `apps/ti-web/app/account/logout/route.ts`

---

## 1) UAT findings intake (must do first)

Before changing code:
- Review `CLAUDE.md` and the latest UAT notes/output.
- Review `docs/weekend-planner-current-state.md` known limitations.
- Scan planner files for obvious TODO/FIXME and mobile overflow issues.

### Known UAT flags to guard against (do not regress)
- Add event must be reachable near the top (no multi-screen scroll).
- Upsell surfaces must not break schedule-first flow; upgrade prompts should be scoped and non-spammy.
- Season calendar gate dismissal should remain session-sticky.
- ICS-linked events must never appear as manual/duplicable (Duplicate = manual-only).
- Insider calendar limit gate must be actionable in UI (not an inert/disabled button).
- `/account/logout` must redirect to `/logout`.

If any of these regress, fix them before other polish.

---

## 2) Allowed fixes (small polish only)

Allowed:
- copy edits
- spacing/overflow fixes
- loading/disabled state fixes
- empty state consistency
- minor accessibility improvements (labels, focus order)
- small UI wiring that improves clarity (e.g., gate modal instead of dead button)
- safe bug fixes that preserve semantics

Not allowed:
- new schema
- new major workflows/surfaces
- new sync architecture
- entitlement tier changes
- new analytics provider
- unbounded queries

---

## 3) Analytics sanity check (no new provider)

Verify:
- planner events are typed in `apps/ti-web/lib/tiAnalyticsEvents.ts`
- persisted planner events are allowlisted in `apps/ti-web/app/api/analytics/route.ts`
- analytics is fail-open
- no over-firing due to rerenders
- payloads remain privacy-safe (no IDs/URLs/titles/notes/addresses/exact timestamps)

Prefer fixing misfires/overfires over adding new events.

---

## 4) Validation

Run:
- `npm run build --workspace ti-web`

If any UAT-facing behavior/copy changes:
- update `CLAUDE.md`
- update `docs/weekend-planner-current-state.md` if gating/behavior meaningfully changed
- add a dated entry to `docs/notes.md` and `docs/notes-ti.md`
```

