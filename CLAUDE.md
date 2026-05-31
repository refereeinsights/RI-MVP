# RI-MVP UAT Guide for Claude Desktop

You are a UAT tester for two production web apps built on the same Supabase backend.
Use your browser to navigate, interact, and verify the flows described below.
Report any visual regressions, broken flows, or unexpected behavior.

---

## Table of Contents

- Apps
- Test Accounts
- UAT Variables (TI)
- Weekend Planner UAT (TI)
  - Smoke UAT (fast pass)
  - Deep UAT (full pass)
  - Dangerous / UAT-only (SQL + console)
- TI Subscription & Conversion Sprint UAT
- Referee Insights UAT (RI)
- Mobile Testing Checklist

---

## Apps

| App | URL | Purpose |
|-----|-----|---------|
| Tournament Insights (TI) | https://www.tournamentinsights.com | Public tournament + venue discovery, tiered access |
| Referee Insights (RI) | https://www.refereeinsights.com | Referee tournament/school reviews, whistle scores |

---

## Test Accounts

### Referee Insights (RI)
| Role | Email | Password |
|------|-------|----------|
| Admin | rod@rdavis.net | Password! |

Login URL: https://www.refereeinsights.com/account/login
Admin login: https://www.refereeinsights.com/admin/login

### Tournament Insights (TI)
| Role | Email | Password |
|------|-------|----------|
| Explorer (free tier) | explorer_test@example.com | SecurePass123! |
| Insider (paid tier) | insider_test@example.com | SecurePass123! |
| Weekend Pro | weekendpro_test@example.com | SecurePass123! |

Login URL: https://www.tournamentinsights.com/login

### UAT Planner Accounts
| Role | Email | Password |
|------|-------|----------|
| UAT Planner A | uat+planner-a@tournamentinsights.com | Password2026! |
| UAT Planner B | uat+planner-b@tournamentinsights.com | Password2026! |

UAT usage note:
- Use **UAT Planner A** for primary Weekend Planner UAT flows.
- Use **UAT Planner B** for isolation / cross-user checks (confirm Planner B cannot see Planner A data).

### UAT ICS Fixture URLs (TI static hosting)
| Key | URL |
|-----|-----|
| TI_BASE_URL | https://www.tournamentinsights.com |
| UAT_ICS_INITIAL_URL | https://www.tournamentinsights.com/uat-fixtures/planner/test-calendar-initial.ics |
| UAT_ICS_UPDATED_URL | https://www.tournamentinsights.com/uat-fixtures/planner/test-calendar-updated.ics |
| UAT_ICS_CONFLICT_UID_URL | https://www.tournamentinsights.com/uat-fixtures/planner/test-calendar-conflict-uid.ics |
| UAT_ICS_INVALID_URL | https://www.tournamentinsights.com/uat-fixtures/planner/test-calendar-invalid.ics |
| UAT_NOT_A_CALENDAR_URL | https://www.tournamentinsights.com/uat-fixtures/planner/not-a-calendar.txt |

Fixture note:
- `UAT_ICS_CONFLICT_UID_URL` is intended to create a duplicate suggestion against `UAT_ICS_INITIAL_URL` even though the ICS `UID` is different.
- If testing locally before a deploy, you can use `http://localhost:3001/uat-fixtures/planner/test-calendar-conflict-uid.ics` instead (dev server must be running).

### Join Code (TI beta access)
`VALID`

---

## UAT Variables (TI)

Use these keys consistently in the steps below:

- `TI_BASE_URL`
- `UAT_ICS_INITIAL_URL`
- `UAT_ICS_UPDATED_URL`
- `UAT_ICS_CONFLICT_UID_URL`
- `UAT_ICS_INVALID_URL`
- `UAT_NOT_A_CALENDAR_URL`

---

## Weekend Planner UAT

Routes:
- Canonical Weekend Planner app: https://www.tournamentinsights.com/weekend-planner
- Compatibility alias: https://www.tournamentinsights.com/planner (should redirect)

### Weekend Planner Current State (post Stage 2.7)

Canonical snapshot: `docs/weekend-planner-current-state.md`.

Must-not-regress guardrails:
- Do not hard-gate `/weekend-planner`.
- Use exact entitlement strings: `explorer`, `insider`, `weekend_pro`.
- No deletion of source-linked/ICS events; merges hide eligible originals via suppression only.
- No automatic merge; no automatic manual-original cleanup.
- Keep separate dismisses suggestions only (never hides events).
- Duplicate/conflict behavior must disclose loaded-event scope when incomplete.
- Preserve timezone-safe manual event entry (no day-shift regressions).
- Analytics (Stage 2.7): typed, privacy-safe, fail open.

Nav note:
- `/planner` should redirect to `/weekend-planner` during consolidation. If it does not, flag it.
- The primary public header nav may temporarily hide “Weekend Planner” during consolidation/UAT; direct access by URL must still work.

Dev note (repo structure):
- Shared planner UI is implemented in `apps/ti-web/app/_components/planner/PlannerClient.tsx` and rendered by `/weekend-planner`.

### Copy/paste prompt (Weekend Planner UAT)
Use this when running Claude Desktop / Chrome UAT and the nav link is hidden:

1) Go to `https://www.tournamentinsights.com/weekend-planner` (do not rely on header nav).
2) If not logged in, log in as UAT Planner A (see credentials above).
3) Run **Smoke UAT** first. If it passes, continue to the deeper checklists below.
4) Stop immediately if any raw UUID is shown to end users; report where it appeared (redact IDs to first 8 chars).

**Accounts:** UAT Planner A and B (Insider tier — see above)

---

### Smoke UAT (fast pass, ~10–15 minutes)

Login as UAT Planner A.

- [ ] `/planner` redirects to `/weekend-planner` (no loops; no raw IDs shown)
- [ ] `/weekend-planner` loads — planner app is visible for signed-in users
- [ ] Create a manual event — submit; event appears
- [ ] Edit the manual event — save; changes persist on reload
- [ ] Delete the manual event — confirm it is removed
- [ ] Add ICS source — paste `UAT_ICS_INITIAL_URL`, submit; events import successfully
- [ ] Refresh the ICS source — refresh succeeds; no crash
- [ ] Cross-user isolation — log in as UAT Planner B; Planner A data is not visible
- [ ] Privacy guardrail — no raw UUIDs/IDs/source URLs/source_event_uid in normal UI

If Smoke UAT fails, stop and report the first failure precisely (page + action + expected vs actual).

---

### Stage 2.8 UAT (polish + launch readiness)

Use this after Smoke UAT passes. Focus on “trust and clarity” regressions.

- [ ] No dead primary actions:
  - [ ] At calendar-feed limit (Insider), clicking **Connect calendar** shows an actionable upgrade prompt (not a disabled/inert button).
  - [ ] Signed-in but unverified: **Connect calendar** shows verify-email prompt.
- [ ] Add event stays schedule-first:
  - [ ] `Add event` is reachable near the top without multi-screen scrolling.
  - [ ] Clicking `Add event` opens the manual event form and scrolls to it.
- [ ] Upsell scope:
  - [ ] Upgrade prompts do not appear in Upcoming / This Weekend in a way that disrupts the schedule.
  - [ ] Season calendar gate behavior is consistent and parent-friendly.
- [ ] Loaded-scope honesty:
  - [ ] When `Load more events` is present, disclosures explicitly say duplicates/conflicts consider loaded events only.
  - [ ] When fully loaded, disclosures state all events in range are loaded.
- [ ] Privacy regressions:
  - [ ] No raw IDs/UUIDs/source URLs/source_event_uid appear in UI.
- [ ] Analytics sanity (DevTools Network → `analytics`):
  - [ ] Key actions fire events once per click.
  - [ ] Payloads remain privacy-safe (no IDs/URLs/titles/notes/addresses/exact timestamps).

### Weekend Planner (/weekend-planner) — Manual Events

Login as UAT Planner A.

- [ ] `/weekend-planner` loads — planner app is visible for signed-in users
- [ ] Redirect: `/planner` -> `/weekend-planner` (preserve allowlisted params like view/import if used)
- [ ] Schedule view control — confirm “Upcoming” (default), “This Weekend”, and “Season” are visible and tappable
- [ ] Quick add entrypoint — confirm an `Add event` button is reachable near the top (no 3+ screens of scroll)
- [ ] Add Event starts collapsed — confirm the manual create form is not fully expanded by default
- [ ] Create a manual event — click `Add event`, fill title + event type + start date + start time, submit; event appears in the timeline
- [ ] Smart end default — when you set the start date/time, confirm End auto-populates to the same date and +1 hour (until you manually change End)
- [ ] Timezone label — confirm the form shows `Timezone: <IANA>` near the start/end inputs
- [ ] Edit the event — open it, change the title or notes, save; changes persist on reload
- [ ] Delete the event — confirm it is removed from the timeline (note: delete may use a native confirm dialog)
- [ ] Local-first validity — save an event with **no venue + no tournament + no address**; confirm it saves and shows a neutral “No location added yet.”
- [ ] Venue optional — use “Find venue” or the Venue search in edit/create, select a venue; confirm no raw UUIDs are shown
- [ ] Map action — add an Address/location and confirm Map action appears; on mobile, confirm the Map picker offers Apple Maps / Google Maps / Waze

### Weekend Planner (/weekend-planner) — Stage 2.6A Manual timezones + pickers (no day-shift)

Login as UAT Planner A.

- [ ] Venue-based timezone
  - [ ] Select a venue in a different timezone than your device (example: Mesa, AZ).
  - [ ] Confirm the form timezone label updates to the venue timezone (example: `America/Phoenix`).
  - [ ] Create a manual event on `06/04/2026` at `09:30` (local to the shown timezone).
  - [ ] Save, refresh, confirm it still shows `06/04/2026` (no 1-day shift).
- [ ] End default behavior
  - [ ] Change Start time and confirm End updates only while End is still auto.
  - [ ] Manually edit End time; then change Start time and confirm End is not overwritten.
- [ ] Fallback behavior
  - [ ] Clear venue/tournament and create a manual event; confirm timezone label uses browser timezone (or `UTC`) and does not shift dates after save+refresh.
- [ ] Internal API sanity (optional; browser console while signed in)
  - [ ] `await fetch("/api/planner/timezone?venue_id=<VENUE_UUID>", { credentials: "include" }).then(r=>r.json())` returns `{ ok: true, timezone: "America/..." | null }`

### Weekend Planner (/weekend-planner) — Stage 2.5 Season pagination + honest duplicates

Login as UAT Planner A.

- [ ] Switch to **Season** lens and select a wide range (6mo or 12mo).
- [ ] If a **Load more events** button appears:
  - [ ] Confirm the disclosure says duplicates only consider loaded events.
  - [ ] Click **Load more events**:
    - [ ] events append (no duplicates)
    - [ ] sort order remains stable
    - [ ] duplicate suggestions refresh based on the loaded set
- [ ] When no more events remain:
  - [ ] disclosure changes to “All events in this range are loaded…”

### Weekend Planner (/weekend-planner) — Stage 2.2 Season Reliability

Login as UAT Planner A.

- [ ] Switch to **Season** lens — confirm a longer upcoming list appears (not limited to this weekend)
- [ ] Season range presets — confirm:
  - [ ] Next 30 days
  - [ ] Next 6 months (default)
  - [ ] Next 12 months
- [ ] Filters — confirm these filters exist and work:
  - [ ] All
  - [ ] Games
  - [ ] Practices
  - [ ] Travel
  - [ ] Other
- [ ] Weekend algorithm — in **This Weekend**, confirm events shown are for next upcoming Fri–Sun (or current Fri–Sun if today is Fri/Sat/Sun) in the event’s timezone
- [ ] Duplicate (manual) — create a manual Practice, duplicate it, change date/time, confirm:
  - duplicate is a new manual event (not “Synced from calendar”)
  - original remains unchanged
  - duplicate flow opens edit UI and requires setting a new start time (starts_at field should be blank until set)
- [ ] Duplicate restrictions — confirm Duplicate is not offered for “Synced from calendar” events (manual-only for now)
  - [ ] If an event shows “Synced from calendar”, it must NOT show a Duplicate button.
- [ ] Long list sanity — confirm ordering by start time ascending, stable grouping, and reasonable performance with dozens of events (no jank / no missing rows)

### Weekend Planner (/weekend-planner) — Stage 2.7 Analytics (privacy-safe + fail-open)

Goal: confirm planner analytics events fire for meaningful actions, payloads are privacy-safe, and failures never break UX.

Notes:
- In production, planner events are persisted via `/api/analytics` allowlists.
- In local dev, analytics may be skipped (localhost filtering) unless explicitly enabled.

Client-side verification (DevTools → Network):
- [ ] Open DevTools → Network and filter for `analytics`.
- [ ] Perform each action below and confirm a `/api/analytics` request is sent with the expected `event` name.
- [ ] Confirm `properties` do NOT include: raw event IDs, calendar feed IDs, source IDs, source URLs, `source_event_uid`, event titles, notes, addresses, or exact private timestamps.
- [ ] Confirm planner still works if analytics fails (simulate by going offline briefly or blocking the request).

Expected events (subset; not all need to be present if the UX doesn’t expose the trigger):
- [ ] Connect calendar succeeds → `planner_calendar_feed_connect_succeeded`
- [ ] Connect calendar fails (use `UAT_ICS_INVALID_URL`) → `planner_calendar_feed_connect_failed`
- [ ] Calendar feed limit gate hit (Insider 2nd feed) → `planner_calendar_feed_limit_reached`
- [ ] Refresh schedule click → `planner_calendar_feed_refresh_clicked`
- [ ] Refresh schedule succeeds → `planner_calendar_feed_refresh_succeeded`
- [ ] Refresh schedule fails (if possible) → `planner_calendar_feed_refresh_failed`
- [ ] Switch tabs Upcoming / This Weekend / Season → `planner_view_toggle_clicked`
- [ ] Load more events click (Season) → `planner_load_more_clicked`
- [ ] Create manual event → `planner_manual_event_created`
- [ ] Update manual event → `planner_manual_event_updated`
- [ ] Delete manual event → `planner_manual_event_deleted`
- [ ] Keep separate click → `planner_duplicate_keep_separate_clicked`
- [ ] Merge modal opened → `planner_duplicate_merge_modal_opened`
- [ ] Merge succeeds → `planner_duplicate_merge_succeeded`
- [ ] Merge fails (if possible) → `planner_duplicate_merge_failed`
- [ ] Weekend Pro gate viewed (Season Calendar locked card or multi-calendar gate) → `planner_weekend_pro_gate_viewed`
- [ ] Weekend Pro gate clicked (Upgrade link) → `planner_weekend_pro_gate_clicked`
- [ ] Map action click → `planner_map_view_opened`
- [ ] Calendar event clicked (Season Calendar) → `planner_calendar_event_detail_opened`

Admin verification (optional, production only):
- [ ] Log in to RI admin (`https://www.refereeinsights.com/admin/login`).
- [ ] Open TI click dashboard at `https://www.refereeinsights.com/admin/ti/clicks`.
- [ ] Confirm the planner event keys are selectable and show counts over time (expect some delay; do not require real-time).
- [ ] Empty states — confirm:
  - if no events this weekend but future events exist: “No events this weekend” (or similar, not an error)
  - season empty state copy encourages building season schedule / importing calendar link

Weekend Pro upsell note:
- [ ] `/weekend-planner` upsell copy must not promise features that don’t exist yet; flag any claims that feel misleading for current Stage 2/2.1.

### Weekend Planner (/weekend-planner) — Stage 2.6C Schedule-first returning parent UX

Login as UAT Planner A.

- [ ] First screen is schedule-first:
  - [ ] Header is compact and shows `Add event` + `Connect calendar`
  - [ ] Upcoming schedule is reachable without scrolling past a fully expanded Add Event form
- [ ] Default schedule view is `Upcoming` (next 30 days)
- [ ] Switching views works:
  - [ ] `This Weekend` shows Fri–Sun range label
  - [ ] `Season` shows range + type filters and supports `Load more events` when available
- [ ] Connected calendars summary:
  - [ ] A compact “Connected calendars” summary is visible
  - [ ] `Manage calendars` expands details and per-source refresh actions
- [ ] Weekend Pro upsell:
  - [ ] Upsell does not block schedule scanning
  - [ ] `Dismiss` hides the upsell for the current session
- [ ] Regressions:
  - [ ] Duplicate suggestions and conflict highlighting still work
  - [ ] Timezone-correct manual create/edit still works (no day-shift)
  - [ ] No raw UUIDs/source URLs/`source_event_uid` appear in new UI
  - [ ] No unbounded event queries are introduced

### Weekend Planner (/weekend-planner) — Stage 2.6D Season calendar view (Schedule‑X)

Login as UAT Planner A.

- [ ] Positioning + polish:
  - [ ] **Your schedule** (Season) is reachable without scrolling past Weekend Pro / Add manual event / Connected calendars.
  - [ ] Loaded-scope disclosure appears **once** in Season view and is positioned **under** the `Calendar | List` toggle.
  - [ ] Calendar opens to the first month that contains loaded events (does not default to an empty earlier month when events exist later).
  - [ ] Schedule‑X header does not show a confusing date-picker control in month view.
  - [ ] When overlaps exist, the `Schedule overlaps` notice appears **below** the `Calendar | List` toggle and the copy matches the active mode (Calendar prompts switching to List for details).
- [ ] Season toggle:
  - [ ] In `Season`, a `Calendar | List` toggle is visible and keyboard-tabbable.
  - [ ] `This Weekend` and `Upcoming` are unaffected by the calendar toggle.
- [ ] Empty-safe default:
  - [ ] If there are **0** loaded Season events, Season defaults to **List** (not an empty calendar grid).
  - [ ] Switching to Calendar while empty shows: `No events to display. Connect a calendar or add events to get started.`
- [ ] Loaded-events only honesty:
  - [ ] If `Load more events` is available, calendar copy clearly indicates calendar reflects loaded events only.
  - [ ] Loading more updates the calendar without a page reload.
- [ ] Source colors:
  - [ ] Manual events render as neutral gray.
  - [ ] ICS events are color-coded consistently by source during the session.
  - [ ] Colors remain stable regardless of load order.
- [ ] Timezone override:
  - [ ] Calendar defaults to browser timezone on mount (UTC fallback if missing/invalid).
  - [ ] Default timezone control is compact (badge + `Change`) and does not look like a heavy form field until opened.
  - [ ] Changing timezone shifts displayed times without reloading.
  - [ ] Timezone choice is session-only (not persisted after refresh).
- [ ] Event details:
  - [ ] Clicking a calendar event opens a safe detail panel (title, time, location if present, notes if present, source label).
  - [ ] No raw IDs, UUIDs, raw source_id, source URLs, or source_event_uid appear in the detail UI.
- [ ] Calendar failure fallback:
  - [ ] If calendar fails to load, UI shows: `Calendar view could not load. Use List view for now.` and planner remains usable.
- [ ] Global Calendar | List toggle (2026-05-31):
  - [ ] On page load (Upcoming view, before clicking anything), confirm `List` and `Calendar` buttons are visible for paid accounts.
  - [ ] Switch to **This Weekend** — confirm `List` and `Calendar` buttons remain visible.
  - [ ] Switch to **Season** — confirm `List` and `Calendar` buttons remain visible (same toggle, not re-created).
  - [ ] Select **Calendar** in Upcoming — confirm calendar renders with events.
  - [ ] Switch to **Season** without touching the toggle — confirm Calendar view is still active (toggle persists across view switch).
  - [ ] Switch to **List** — confirm list view renders and toggle shows List as active.
  - [ ] For non-paid (Insider) accounts: confirm no Calendar | List buttons appear, and the Weekend Pro upgrade card is shown only in Season view (not Upcoming or Weekend).
- [ ] Month nav label correctness (bug fix 2026-05-31):
  - [ ] Open Season calendar — note which month is shown in the nav bar (e.g. "June 2026").
  - [ ] Click `›` (next month) — confirm the nav bar label advances by exactly one month (e.g. "July 2026"), not zero months.
  - [ ] Click `‹` (prev month) — confirm the nav bar label retreats by exactly one month back to the original.
  - [ ] Events visible in the original month must still be visible after navigating away and returning.
  - [ ] Months that start mid-week (e.g. July — starts Wednesday) must show the correct month label, not the label of the prior month.

### Weekend Planner (/weekend-planner) — Stage 2.6E SAFE v1.x Entitlement alignment (Weekend Pro calendar gates)

Login as UAT Planner A.

- [ ] Insider limits (non-paid):
  - [ ] Can connect **1** calendar successfully.
  - [ ] Attempting to connect a second calendar shows an upgrade prompt (modal or inline) with a clear CTA to `/premium`.
  - [ ] Bypassing UI still fails server-side with `calendar_feed_limit_reached` (403).
  - [ ] Season view remains usable in **List**.
  - [ ] Season visual calendar is locked with a Weekend Pro card (no broken/empty calendar).
- [ ] Weekend Pro:
  - [ ] Can connect multiple calendars.
  - [ ] Season visual calendar renders and works as before.
- [ ] Unverified user messaging (Explorer):
  - [ ] Attempting to connect a calendar prompts verify-email messaging (not paid framing).
  - [ ] Server responds with `email_verification_required` (403) for calendar import attempts.

### Weekend Planner (/weekend-planner) — Stage 2 ICS Import

Login as UAT Planner A.

- [ ] Add ICS source — paste `UAT_ICS_INITIAL_URL` (see above), submit; events import successfully, count shown
- [ ] Duplicate fixture (different UID): add a second ICS source using `UAT_ICS_CONFLICT_UID_URL`
  - [ ] Confirm a “Possible duplicate from another calendar” suggestion appears for the overlapping event (ALT UID should still match by title/time/location)
- [ ] Import window — events older than 30 days or more than ~18 months out should be excluded
- [ ] All-day events — verify any DATE-only events in the fixture appear with a date (not "Invalid date")
- [ ] Refresh — trigger a refresh of the ICS source; existing events update without error
- [ ] Notes not overwritten — add a manual note to an ICS-imported event, refresh the source; note must still be present after refresh
- [ ] Update fixture behavior — import `UAT_ICS_UPDATED_URL` as a second source (or swap source URL if UI supports it), refresh; new/changed events reflect the updated fixture
- [ ] Invalid ICS — add `UAT_ICS_INVALID_URL`; expect a clear error message, no crash
- [ ] Non-calendar URL — add `UAT_NOT_A_CALENDAR_URL` (.txt file); expect a clear error message, no crash
- [ ] Zero-event refresh — if the fixture returns no in-window events, refresh should succeed (not show an error)
- [ ] Source health — confirm “Connected calendars” shows last synced + status + safe error copy (no raw URLs/IDs)
- [ ] Refresh summary — after refresh, confirm the UI shows a user-safe summary including new/updated counts and a “changes detected” count when applicable
- [ ] Stale warning — if last synced is >24h (or >7d), confirm a stale warning appears; after a successful refresh it should clear (if you simulate staleness via SQL)
- [ ] Platform help — Import modal includes “Where do I find my calendar link?” guidance (TeamSnap/SportsEngine/GameChanger/GotSport/Stack Sports + disclaimer; no “official integration” claims)

### Weekend Planner (/weekend-planner) — Stage 2.4B Suppression (merge foundation)

⚠️ Dangerous / UAT-only (SQL + direct DB write). Do not do this on real user data.

- [ ] Seed a suppression for a single ICS event (UAT-only; do not do this on real user data):
  - Find the event’s `source_id` + `source_event_uid` for your UAT user.
  - Insert into `planner_event_suppressions` with `reason='merged_duplicate'`.
- [ ] Reload `/weekend-planner` — the suppressed ICS event should be hidden from “Your events”.
- [ ] Refresh the source calendar — suppressed event must remain hidden (refresh may recreate the row; read-time filtering should still hide it).
- [ ] `kept_separate` does NOT hide events (reserved for a later stage).

### Weekend Planner (/weekend-planner) — Stage 2.4C Duplicate Suggestions + Keep Separate

- [ ] Overlap stand-in: import both hosted fixtures as separate sources:
  - `test-calendar-initial.ics`
  - `test-calendar-updated.ics`
- [ ] Confirm “Possible duplicate” suggestions appear only within the selected lens/range (Weekend vs Season).
- [ ] High confidence shows a disabled “Merge (Recommended)” placeholder; low confidence shows disabled “Merge…”.
- [ ] Click “Keep separate” on a suggestion; it disappears.
- [ ] Reload `/weekend-planner` and confirm the same suggestion does not reappear.
- [ ] Confirm neither event is hidden by Keep separate (both remain visible).

### Weekend Planner (/weekend-planner) — Stage 2.4D Truncation disclosure + Manual merge endpoint (UI merge still disabled)

- [ ] Truncation disclosure (range-scale guardrail):
  - [ ] If your Season range contains >200 visible events, confirm a disclosure appears:
    - `Showing first 200 events in this range. Duplicate suggestions only consider loaded events.`
  - [ ] If you can’t reach 200 naturally, use UAT-only SQL to seed additional manual events for your UAT user, then reload Season view.
- [ ] Manual merge endpoint (server-only; do not expect UI merge yet):
  - ⚠️ Dangerous / UAT-only (direct API call with raw IDs). Do not run on real user data.
  - [ ] In the browser console (signed in), call the merge endpoint with two event IDs you own:
    - `await fetch("/api/planner/events/merge", { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ primary_event_id: "<EVENT_ID>", merge_event_ids: ["<EVENT_ID_2>"] }) }).then(r => r.json())`
  - [ ] Confirm response `{ ok: true, event, suppressed, warnings }`.
  - [ ] Confirm the returned `event.source_type` is `manual` and `event.source_id` / `event.source_event_uid` are null.
  - [ ] Confirm eligible ICS originals are hidden after merge (suppressed with `reason='merged_duplicate'` by source identity).
- [ ] If the merge included manual originals, confirm a warning is returned and the manual originals remain visible in this stage.

### Weekend Planner (/weekend-planner) — Stage 2.4E Merge confirmation UI (no one-click merge)

- [ ] Find a “Possible duplicate from another calendar” suggestion under an event card.
- [ ] Click `Merge (Recommended)` (high confidence) or `Review merge…` (low confidence).
- [ ] Confirm a modal opens titled `Review duplicate merge`.
- [ ] Modal must NOT show raw IDs, source URLs, or `source_event_uid`.
- [ ] If conflicts exist (title/time/location/notes), confirm winner selectors appear and default to Primary.
- [ ] Click `Cancel`:
  - [ ] modal closes
  - [ ] no merge occurs
  - [ ] no events are hidden
- [ ] Re-open the modal:
  - [ ] previous winner selections are cleared/reset
- [ ] Click `Create merged event`:
  - [ ] merge occurs only after confirmation
  - [ ] planner refreshes and the new manual canonical event appears
  - [ ] eligible imported originals are hidden (suppressed via `merged_duplicate`; not deleted)
  - [ ] any API warnings are displayed safely (manual originals may remain visible)
- [ ] Keep separate still works and does not hide events.
- [ ] If truncation disclosure is visible (showing first N events), confirm it remains visible and the modal includes the loaded-only reminder.

### Weekend Planner (/weekend-planner) — Stage 2.4F Manual-original cleanup after merge (optional)

- [ ] Create a merge scenario where at least one of the two merged events is manual (manual ↔ ICS or manual ↔ manual, if supported by the duplicate suggestion surface).
- [ ] Complete the merge via the confirmation modal.
- [ ] Confirm merge succeeds and a new canonical manual event appears after refresh.
- [ ] Confirm imported/ICS originals are not deleted (eligible ones remain governed only by suppression behavior).
- [ ] Confirm manual originals remain visible after merge.
- [ ] Confirm a cleanup prompt appears:
  - `Manual duplicate events were not hidden. You can review them now or keep them for later.`
- [ ] Click `Keep them for now`:
  - prompt dismisses
  - no events are deleted/hidden
- [ ] Trigger the prompt again (repeat merge) and click `Review manual duplicates`:
  - a cleanup review panel/modal opens
  - only the just-merged manual event IDs appear as cleanup candidates (no broad search)
  - no raw IDs/UUIDs/URLs/UIDs are shown
- [ ] Delete a manual duplicate from the cleanup UI:
  - requires explicit custom confirmation copy (not `window.confirm()`)
  - uses existing delete behavior
  - planner refreshes and the deleted manual duplicate is gone
- [ ] Confirm cleanup UI cannot delete imported/ICS events.

### Weekend Planner (/weekend-planner) — Stage 2.6B Loaded schedule conflict highlighting (loaded events only)

- [ ] Create or load two events that overlap in time (same day) in the currently visible range.
- [ ] Confirm both overlapping event cards show:
  - [ ] a subtle warning treatment (light red background/border is OK)
  - [ ] a text label/badge: `Schedule conflict` (must not be color-only)
- [ ] Cross-timezone overlap check:
  - [ ] Create one manual event with a venue in a different timezone than your browser (so the event timezone differs).
  - [ ] Create another event that overlaps it in real time (same instant) and confirm the conflict is still detected in the loaded range.
- [ ] Back-to-back check (end == start):
  - [ ] Create two events where one ends exactly when the next starts.
  - [ ] Confirm they are NOT flagged as a conflict.
- [ ] Non-overlap check:
  - [ ] Create two events on the same day that do not overlap.
  - [ ] Confirm they are NOT flagged as a conflict.
- [ ] Missing end-time fallback:
  - [ ] Create an event without an end time (if UI allows) and another overlapping event.
  - [ ] Confirm conflict highlighting still works and no end time is silently persisted.
- [ ] Loaded-scope honesty:
  - [ ] In Season view, if `Load more events` is available, confirm the disclosure says duplicate suggestions and schedule conflicts only consider loaded events.
  - [ ] Click `Load more events` and confirm conflict highlighting recomputes.
- [ ] Regression checks:
  - [ ] Duplicate suggestions still work.
  - [ ] Keep separate still dismisses suggestions only and does not hide events.
  - [ ] Merge confirmation still requires explicit confirmation.
  - [ ] Manual cleanup after merge still works (if applicable).
  - [ ] Stage 2.6A manual timezone + date/time pickers still work (no day-shift regressions).

### Weekend Planner (/weekend-planner) — Isolation (two accounts)

- [ ] Login as UAT Planner A, import `UAT_ICS_INITIAL_URL`; login as UAT Planner B — Planner B sees no events from Planner A's source
- [ ] Each account's events, sources, and notes are fully isolated

### Saved + Lodging route (/weekend-planner)

Login as UAT Planner A.

- [ ] `/weekend-planner` loads — page renders and CTAs are usable on mobile
- [ ] Save a tournament — find any tournament via `/tournaments`, click "Save to planner", verify it appears in the saved section on `/weekend-planner`
- [ ] Confirm this page does not require calendar import; it’s a separate flow from the planner app experience above

### What to Flag
- Planner page inaccessible for Insider-tier UAT accounts
- Add event CTA buried below the fold (schedule-first regression)
- ICS import silently drops events without feedback
- Notes or venue overwritten after ICS refresh
- All-day events show "Invalid date" or wrong date
- Events from outside the import window (>30d past or >18mo future) appear
- One account's data visible to the other
- Any 500 error or blank screen during planner interactions

---

## TI SEO UAT

### June 2026 Tournament Landing Page

Route:
- https://www.tournamentinsights.com/youth-sports-tournaments/june-2026

Checks:
- [ ] Page loads and shows H1 `June 2026 Youth Sports Tournaments`.
- [ ] Summary stat bar shows:
  - [ ] a tournament count (dynamic is OK)
  - [ ] dates `June 1–30, 2026`
  - [ ] map + sport filters
- [ ] Default date chip is `All June`.
- [ ] Date chips update results (Early/Mid/Late) without breaking the page.
- [ ] Canonical points to `/youth-sports-tournaments/june-2026` (view page source / inspect `<link rel="canonical">`).
- [ ] Filtered variants are not indexable:
  - Apply a sport/state/date chip filter and confirm robots meta is `noindex` (inspect `<meta name="robots">`), while canonical remains the base June URL.
- [ ] “Explore the map” CTA scrolls/jumps to the map section.
- [ ] Tournament cards:
  - [ ] “View tournament” is available
  - [ ] Hotels / Rentals CTAs work where location exists
  - [ ] Official site link exists but is not the dominant CTA

---

## Key Flows to Test

### Tournament Insights — Public / Logged Out
- [ ] Home page loads at `/` — hero renders (current copy may vary; do not fail solely on exact hero wording)
- [ ] `/tournaments` — search form renders, tournament cards appear with a working detail CTA (label may be “View details” or “Tournament Details”)
- [ ] Tournament detail page — open any tournament, verify venue info, dates, sport shown
- [ ] Tournament detail page — Tournament Series links visible if event has multiple years (slug pattern `base-YYYY`)
- [ ] `/weekend-planner` — page loads, links to "Search travel" and "Browse tournaments" visible
- [ ] `/join?code=VALID` — shows join form with code pre-filled
- [ ] `/join` (no code) — shows "Missing event code" state
- [ ] `/venues/reviews` — redirects to `/login?returnTo=/venues/reviews` when logged out; after login, `returnTo` param honored

### Tournament Insights — Explorer (free tier)
- Login as Explorer
- [ ] `/venues/reviews` — redirects to `/account?notice=` with "Insider required" message; notice is readable on mobile
- [ ] `/weekend-planner` — page loads, Insider access badge/upsell visible
- [ ] Wrong password on login — error message displayed clearly
- [ ] Account tier sanity: Explorer account should not display an Insider/paid plan badge; if it does, flag as test-account config issue (not gating logic)

### Tournament Insights — Insider (paid tier)
- Login as Insider
- [ ] `/venues/reviews` — accessible, shows "Venue Reviews" heading and Step 1 form
- [ ] `/weekend-planner` — "Insider access" shown, saved tournaments section visible
- [ ] Tournament detail page — Owl's Eye venue badge visible where applicable
- [ ] Venue Index score (0–100) shown on venue cards

### Tournament Insights — Weekend Pro
- Login as Weekend Pro
- [ ] `/weekend-planner` — loads successfully; verify what Weekend Pro-specific content or access differs from Insider
- [ ] `/venues/reviews` — note whether accessible or gated; document actual behavior
- [ ] Saved tournaments section — verify presence and functionality
- [ ] Flag any UI elements that appear broken or reference undefined tier benefits
- [ ] Logout behavior: `/account/logout` should redirect to `/logout` and successfully sign out (then redirect to `/` unless a `returnTo` is provided).

### Tournament Insights — Venues → Internal Planning Map
- Login as Insider (or Weekend Pro).
- Venue Directory:
  - [ ] Open `/venues`.
  - [ ] Find a venue card that shows “Coming up at this venue” (has upcoming tournaments).
  - [ ] Confirm the primary CTA is **Plan trip** (not “Map”).
  - [ ] Click **Plan trip** → should open TI internal planning map in the SAME TAB:
    - URL should look like `/tournaments/[slug]/map?venue=...&source=venue_directory`
    - The venue should be preselected (matches the venue you clicked from).
  - [ ] Confirm the secondary CTA is **View venue** (renamed from Details).
  - [ ] Confirm external **Get directions** exists as a secondary action (opens external maps; do not fail on provider choice).
- Venue Details:
  - [ ] From the venue card, click **View venue**.
  - [ ] If the page supports selecting a tournament context via `?tournament=...`, choose one so a tournament slug exists.
  - [ ] Confirm a primary CTA **Plan around this venue** appears.
  - [ ] Click **Plan around this venue** → opens `/tournaments/[slug]/map?venue=...&source=venue_details` in the SAME TAB.
  - [ ] Click the map preview itself → should also open the internal planning map (not Google/Apple directly).
  - [ ] Confirm **Get directions** remains available as a secondary action and works.
  - [ ] If no tournament context is present, confirm the map preview does NOT act as an external maps link; directions should require the explicit “Get directions” action.

### TI Subscription & Conversion Sprint UAT (v1.4)

Logged-out:
- [ ] From homepage, click “Upgrade to Weekend Pro” → lands on `/premium` (no auth loop)
- [ ] `/premium` renders as marketing/pricing page when logged out (no broken redirect-to-login loop)
- [ ] Logged-out users do not see private planner data on `/weekend-planner` or `/planner` (if reachable)
- [ ] `/venues` shows “See pricing →” and it routes to `/premium`
- [ ] `/venues/[venueId]` locked section is safe (no private user-only data exposed)

Logged-in non-Weekend-Pro (Insider):
- [ ] `/premium` primary green CTA starts the existing $39.50/year checkout flow
- [ ] `/premium` shows “Start 30-day Founders Preview” and it starts the existing $4.99 checkout flow (no new product)
- [ ] `/venues/[venueId]` “Premium planning details” locked section shows:
  - [ ] Upgrade to Weekend Pro → `/premium`
  - [ ] Start 30-day Founders Preview → $4.99 checkout
  - [ ] Founding deadline copy line
- [ ] Planner upsell (canonical planner surface) shows updated benefit copy + founding price line, and upgrade CTA routes to `/premium`

Logged-in Weekend Pro:
- [ ] No purchase CTAs (“Upgrade”, “Start preview”, “Start 30-day Founders Preview”) on:
  - [ ] homepage
  - [ ] `/premium`
  - [ ] `/weekend-planner` / planner surfaces
  - [ ] `/venues`
  - [ ] `/venues/[venueId]` locked section
- [ ] `/premium` can show a status message (e.g. “You’re on Weekend Pro”) if implemented

Validation:
- [ ] Run `npm run build --workspace ti-web` and confirm it passes

### Tournament Insights — Weekend Planner (/planner)
- [ ] Open `/planner` and confirm it redirects to `/weekend-planner` cleanly (no raw UUIDs visible anywhere).

### Referee Insights — Public / Logged Out
- [ ] Home page at `/` — "Referee Insights" title, "Insight before you accept" hero, "Public Beta" badge, footer disclaimer
- [ ] `/tournaments` — search form with placeholder "Search tournaments", tournament cards with "View details"
- [ ] `/schools/review` — page loads, "School" content visible
- [ ] `/assignors` — "Sign in to view contact details" visible, NO mailto/tel links, NO Reveal buttons
- [ ] `/feedback` — submit form works (fill message + email, click "Send feedback", see "Thanks — we read every submission")
- [ ] `/account/reset-password` — "Reset your password" heading visible

### Referee Insights — Admin
- Login as admin at `/admin/login`
- [ ] Admin dashboard loads — "Admin Dashboard" heading, "Verification" tab link visible
- [ ] Reviews tab — "Tournament referee reviews" heading
- [ ] School reviews tab — click and confirm the School reviews view loads
- [ ] School reviews tab — "School referee reviews" heading
- [ ] Venue Link Quality page at `/admin/venues/link-quality` — table of suspicious links loads

---

## Mobile Testing Checklist

Test at **375px** (iPhone SE), **390px** (iPhone 14/15 Pro), and **768px** (iPad portrait).

### Layout
- [ ] Nav collapses properly at all three breakpoints, no overflow
- [ ] Tournament cards stack vertically, no horizontal scroll
- [ ] Venue cards show Owl's Eye badge without clipping
- [ ] Footer visible and not cut off
- [ ] Tier-gating redirect notices (e.g. "Insider required") fully readable, not truncated

### Forms & Inputs
- [ ] Login form — usable with mobile keyboard; autofill works; wrong password shows clear error
- [ ] Search form — usable with mobile keyboard; results load correctly
- [ ] Feedback form (RI) — submits successfully on mobile Safari; success message shown
- [ ] `/join?code=VALID` — form usable when opened from a shared link (simulate mobile entry point)
- [ ] Dropdown/select elements use appropriate input type (native iOS picker or accessible custom UI)

### Touch & Interaction
- [ ] All touch targets meet minimum 44×44px (buttons, nav links, card CTAs)
- [ ] No tap targets overlap or are obscured by other elements
- [ ] Auth redirect after login (`returnTo`) works correctly on mobile browsers

---

## Key Features to Verify

### Owl's Eye Badge
Appears on venue cards and tournament detail pages for enriched venues.
Look for a badge/icon indicating coffee/food/hotel amenities nearby.
Should be visible on most tournament detail pages — if completely absent everywhere, flag it.
On mobile, confirm badge does not clip or overlap card text.

### Whistle Scores
AI-weighted referee scores shown on tournament pages.
Should appear on tournaments that have referee reviews.

### TI Tier Gating
- Logged-out users redirected to login with `returnTo` param preserved; confirm redirect honored post-login
- Explorer cannot access `/venues/reviews` — redirected with notice
- Insider can access `/venues/reviews` and sees venue review form
- Weekend Pro — document actual gating behavior (currently unspecified)

### Tournament Series
Slug pattern `base-YYYY` ties multi-year events together.
On tournament detail, related years of the same series should be linked.
Test by finding any tournament with a year in its slug and confirming sibling-year links appear.

---

## TI Weekend Planner (/planner) notes

- Event delete may use a native browser confirmation dialog (`window.confirm()`); this can interrupt automation flows. Note it if encountered.

## What to Flag
- Any page returning a 500 error or blank white screen
- Broken images or missing assets
- Forms that submit but show no success/error feedback
- Auth flows that don't redirect correctly after login, including `returnTo` not honored
- Mobile layouts with horizontal scroll or overlapping elements at any of the three test breakpoints
- Touch targets smaller than 44×44px
- Owl's Eye badge missing on all tournament detail pages (not just some)
- Owl's Eye badge clipping on mobile card layouts
- Tier gating not working (Explorer accessing Insider content)
- Weekend Pro tier behavior that appears undefined or broken
- Tournament Series links absent on detail pages for multi-year events
