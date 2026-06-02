# TI Planner — ICS/iCal Import UAT (Stage 2)

Use this checklist to validate Stage 2 calendar import/refresh on a local dev server (or preview).

Production-only DB note: see `docs/weekend-planner-uat.md` for UAT accounts, hosted fixture strategy, and production-safe cleanup.
Current product snapshot: `docs/weekend-planner-current-state.md`.
Stage 2.9A prompt (docs-first): `docs/prompts/ti-planner-stage-2.9a-ics-source-identity-audit-sports-family-uat-prep.md`.

## Prereqs
- TI dev server running (example): `npm run dev --workspace ti-web -- -p 3001`
- A test user account you can log into
- One public ICS/iCal URL for testing
  - Prefer one that redirects (HTTP 301/302) if you can find one
  - Prefer one with at least 2 future events

## UAT
1. Log in and open `/weekend-planner` (canonical). `/planner` should redirect to `/weekend-planner`.
2. Click **Import calendar link**.
3. Empty URL:
   - Submit with empty URL → expect error: “Enter a valid iCal/ICS calendar URL.”
4. Invalid scheme:
   - Try `file://...` or `javascript:...` → expect error: “Calendar links must start with http:// or https://.”
5. Local/private host blocks:
   - `http://localhost/test.ics` → expect “private or local address” error.
   - `http://sub.localhost/test.ics` → expect “private or local address” error.
   - `http://127.0.0.1/test.ics` → expect “private or local address” error.
6. Non-ICS content:
   - Try a normal HTML URL (e.g. a homepage) → expect “does not appear to be an iCal/ICS calendar.”
7. Valid ICS import:
   - Paste a real public ICS URL, optionally enter Source name + Team name, submit.
   - Expect a success summary like “Imported X · Updated 0 · Skipped Y”.
   - Confirm imported events appear in **Your events** and show source labeling (fallback to "Connected calendar").
8. Refresh:
   - In **Synced calendars**, click **Refresh schedule**.
   - Confirm it does not duplicate events; summary should show `+0 new` unless the source changed.
9. Edit preservation:
   - Pick one imported event, add notes and select a Venue using the Venue search field.
   - Refresh the calendar.
   - Confirm `notes` (non-empty) and selected Venue are not overwritten.
10. Venue linking (local-first):
   - Pick an event with an address/location but no linked venue.
   - Click **Find venue**, search for a real venue, and select it.
   - Confirm no raw UUIDs are shown to the user.
   - Refresh the calendar and confirm the selected venue remains linked.
11. Manual events regression:
   - Create a manual event.
   - Edit it.
   - Delete it.
   - Confirm all actions still work.

## Stage 2.4E quick check (optional)
- If duplicate suggestions are present, confirm clicking **Merge (Recommended)** / **Review merge…** opens a confirmation modal and does not merge until **Create merged event** is confirmed.

## Stage 2.5 quick check (optional)
- Switch to **Season** lens and confirm event loading remains bounded.
- If **Load more events** is present:
  - Click it and confirm events append (no duplicates) and duplicate suggestions update for the loaded set.
- Confirm disclosure copy stays honest:
  - While more events exist: “Duplicate suggestions only consider loaded events…”
  - When fully loaded: “All events in this range are loaded…”

## Notes / known limitations
- Deleted imported events may reappear on refresh (no suppression in Stage 2).
- Refresh does not delete events missing from the feed.
- DNS rebinding is a theoretical SSRF bypass with native `fetch`; we still block obvious private/local hosts and validate redirect hops.

---

## Stage 2.9B — Platform Compatibility Matrix (Shell)

Precondition: Stage 2.9B-0 should be validated first so imported source labels are in place before compatibility matrix population.

Purpose: capture real-world ICS feed behavior **without overclaiming support**. Populate during Stage 2.9B as real platform feeds become available.

Important:
- Many “platforms” do not host ICS directly; they may require exporting to a calendar client or generating a subscription link.
- Calendar relays/clients (Google/Apple/Outlook) can re-emit ICS and may change UID/metadata behavior. Track these separately.

## Stage 2.9B-1A — Single Team Connect Feed Baseline UAT

### Team Connect / Team App — TI Owls 15U

- Feed label: `SC-Casey`
- Platform: Team Connect / Team App
- Team: `TI Owls 15U`
- Feed status: Imported
- Baseline import: Passed
- Full season loaded: Yes
- Repeated refresh test: Passed
- Refresh attempts: 3
- Duplicate storm observed: No
- Manual refresh required: Yes
- Re-import required: No so far
- Update test status: **Pass** (in-place update observed after source changes)
- Action taken in source platform: Changed Practice A time/location
- Update delay observed: source-feed publish delay + short manual refresh delay (no hard re-import required so far)
- Updated existing event after refresh: Yes
- Duplicate created after update: No
- Location update reflected: Yes
- Local overlay preserved: Pending / not yet tested
- Cancel/delete test: Pending
- Notes: Update/move behavior is now documented as pass for this feed.

#### Refresh attempt log

| Timestamp | Action | Result | Updated existing event? | Duplicate created? | Location updated? | Notes |
|---|---|---|---|---|---|---|
| TBD | Baseline import | Passed | N/A | No | N/A | Full season loaded |
| TBD | Manual refresh #1 | Passed | Yes | No | Yes | No duplicate storm |
| TBD | Manual refresh #2 | Passed | Yes | No | Yes | No duplicate storm |
| TBD | Manual refresh #3 | Passed | Yes | No | Yes | No duplicate storm |
| TBD | Practice A changed in source platform | Waiting for feed publish | Pending | Pending | Pending | Refresh periodically |

#### Privacy note (feeds)

- Treat real calendar subscription URLs as private secrets (often tokenized).
- Do not commit raw private feed URLs to the repo.
- Public docs/screenshots should redact tokenized URLs.
- Do not expose feed URLs or `source_event_uid` in normal UI or analytics.

### Stage 2.9B-2 — GameChanger Single-Feed Baseline UAT

Status: **partial PASS** on TI Owls 12U (`weekendpro_test@example.com`).

### GameChanger — TI Owls 12U

- Feed alias: GameChanger / webcal ICS
- Team: TI Owls 12U
- Feed status: Imported
- Baseline import: PASS
- Full season loaded: Partial (core season window rendered; one out-of-window event observed)
- Repeated refresh test: PASS
- Refresh attempts: 3
- Duplicate storm observed: No
- Manual refresh required: Yes
- Update test status: PASS (`changed=23`, `imported=0` on all refreshes)
- Cancel/delete test: Pending
- Overlay preservation: PASS
- Notes: Source label currently renders as fallback `Connected calendar` when incoming label is null; privacy checks for source URLs/IDs/UIDs in UI passed.

#### Refresh attempt log

| Timestamp | Action | Result | Updated existing event? | Duplicate created? | Location updated? | Notes |
|---|---|---|---|---|---|---|
| 2026-06-02T20:17:41Z | Baseline import | PASS | Yes | No | Yes | Source ID `d1eb667a`; 23 events; ~1 out of import window |
| 2026-06-02T20:20:12Z | Manual refresh #1 | PASS | Yes | No | Yes | imported=0 changed=23 |
| 2026-06-02T20:20:14Z | Manual refresh #2 | PASS | Yes | No | Yes | imported=0 changed=23 |
| 2026-06-02T20:20:16Z | Manual refresh #3 | PASS | Yes | No | Yes | imported=0 changed=23 |

### Stage 2.9B-3 — TeamSnap Feed Baseline UAT

Status: **partial PASS**, pending F3 and hard-delete follow-up.

### TeamSnap — TI Strikers / TI Wolves (user schedule URL)

- Feed alias: TeamSnap — user_schedule feed
- Team: TI Strikers / TI Wolves (combined user feed)
- Feed status: Imported
- Baseline import: PASS (`Imported 10 · Updated 0 · Skipped 0`)
- Full season loaded: Partial (calendar window coverage observed in current UAT scope)
- Repeated refresh test: PASS
- Refresh attempts: 3
- Duplicate storm observed: No
- Manual refresh required: Yes
- Update test status: Pending (not yet run in this run)
- Cancel/delete test: Pending
- Overlay preservation: PASS
- Source-label persistence after refresh: PASS
- Notes: protocol normalization accepted `http://` URL directly; source labels persisted; F7 regression held (no Duplicate button on TeamSnap/GC events).

#### Refresh attempt log

| Timestamp | Action | Result | Updated existing event? | Duplicate created? | Location updated? | Notes |
|---|---|---|---|---|---|---|
| 2026-06-02T13:37:43Z | Manual refresh #1 | PASS | Yes | No | Yes | last synced advanced; labels persisted |
| 2026-06-02T13:37:54Z | Manual refresh #2 | PASS | Yes | No | Yes | no duplicate storm |
| 2026-06-02T13:37:59Z | Manual refresh #3 | PASS | Yes | No | Yes | no duplicate storm |
 
---

### Source platforms (not yet tested)

| Platform | Sports Family alias | Subscription URL available? | Feed type | Requires login cookies? | UID stability | SEQUENCE present? | LAST-MODIFIED present? | DTSTAMP present? | Cancel semantics observed | Missing/deleted semantics observed | Recurrence behavior observed | Location quality | Notes/description quality | Baseline import result | Update result | Cancel/delete result | Overlay preservation result | Known quirks | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Team Connect / Team App | TI Owls 15U / SC-Casey | yes (private/tokenized) | webcal/ICS | unknown | unknown | unknown | unknown | unknown | pending | pending | pending | present | pending | passed | **passed (in-place)** | pending | pending | source feed publish + refresh delay observed | active UAT — passed for update/move; overlay/cancel paths pending |
| GameChanger | TI Owls 12U | available (webcal/https tokenized) | webcal/ICS | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | mixed (real + placeholder locations) | fixture notes + description text | passed | in-place update (`changed=23`, `imported=0`) | pending | passed | source_name fallback appears as `Connected calendar` | proceed to 2.9C for cancel/delete/UID details |
| TeamSnap | TI Strikers / TI Wolves | available (webcal/tokenized URL) | webcal/ICS | unknown | unknown | unknown | unknown | unknown | pending | pending | pending | good | source notes as description text | passed | in-place update (not yet validated) | pending | passed | F7 resolved on source events; time default 00:00 for some items is an observed format edge | proceed to 2.9C for cancel/delete + F3 limit follow-up |
| SportsEngine / MySE |  | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | not yet tested | not yet tested | not yet tested | not yet tested |  | not yet tested |
| Sports Connect / Blue Sombrero |  | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | not yet tested | not yet tested | not yet tested | not yet tested |  | not yet tested |
| PlayMetrics |  | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | not yet tested | not yet tested | not yet tested | not yet tested |  | not yet tested |
| LeagueApps |  | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | not yet tested | not yet tested | not yet tested | not yet tested |  | not yet tested |
| Spond or Heja |  | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | not yet tested | not yet tested | not yet tested | not yet tested |  | not yet tested |

### Calendar relays/clients (not yet tested)

| Relay/client | Sports Family alias | Subscription URL available? | Feed type | Requires login cookies? | UID stability | SEQUENCE present? | LAST-MODIFIED present? | DTSTAMP present? | Cancel semantics observed | Missing/deleted semantics observed | Recurrence behavior observed | Location quality | Notes/description quality | Baseline import result | Update result | Cancel/delete result | Overlay preservation result | Known quirks | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Google Calendar |  | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | not yet tested | not yet tested | not yet tested | not yet tested |  | not yet tested |
| Apple Calendar |  | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | not yet tested | not yet tested | not yet tested | not yet tested |  | not yet tested |
| Outlook |  | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | not yet tested | not yet tested | not yet tested | not yet tested |  | not yet tested |
| Generic ICS/webcal |  | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | not yet tested | not yet tested | not yet tested | not yet tested |  | not yet tested |

## Stage 2.9C — Source Identity Hardening Follow-Ups (post-real-feed)

### Cross-feed checks required

Run these checks against at least one already-validated source (TeamConnect/GameChanger/TeamSnap) and optional SportsEngine/MySE if access allows:

- [ ] F3 at-limit gate UX: Insider at limit should show upgrade path before modal import.
- [ ] F3 API enforcement: bypass attempt should return `calendar_feed_limit_reached` (403).
- [ ] Source name + color stability after refresh.
- [ ] Cancel/delete (or source removal) behavior is non-destructive / documented by platform.
- [ ] Missing-source behavior is recorded (stale event suppression/retention policy).
- [ ] Overlay + linked venue retention after cancel/delete/re-refresh scenarios.
- [ ] SportsEngine/MySE availability and baseline entry (if feed is available; otherwise mark Not Available and defer).
- [ ] Privacy: no raw IDs/URLs/UIDs in list, calendar, detail.

### Stage 2.9C Run Log (template)

- Run date: ___________
- Environment: ___________
- Planner account: ___________
- Sources exercised: ___________
- UAT runner: ___________
- Last artifact link / notes:
  - ___________________________________________________________

| Check | Result | Evidence |
|---|---|---|
| F3 UI gate works | PASS / PARTIAL / FAIL | |
| F3 server enforcement works | PASS / PARTIAL / FAIL | |
| Source label stability (GC/TeamSnap/SportsEngine) | PASS / PARTIAL / PENDING | |
| Source color stability | PASS / PARTIAL / PENDING | |
| Cancel/delete source event | PASS / PARTIAL / FAIL | |
| Missing feed event handling | PASS / PARTIAL / PENDING | |
| Hard-delete observed unexpectedly | PASS / PARTIAL / FAIL | |
| Identity persistence after repeated refresh | PASS / PARTIAL / FAIL | |
| Overlay and linked venue retained | PASS / PARTIAL / PENDING | |
| Loaded disclosure still honest | PASS / PARTIAL / PENDING | |
| Privacy check | PASS / PARTIAL / FAIL | |

### 2.9C Compatibility Matrix updates

- Update the matrix rows in this file for affected rows:
  - Team Connect / Team App
  - GameChanger
  - TeamSnap
  - SportsEngine / MySE (if tested)
- Populate:
  - `Cancel semantics observed`
  - `Missing/deleted semantics observed`
  - `Overlay preservation result`
  - `Recommendation`

## Stage 2.9B-1B — Team Connect Lifecycle Validation

### Run log (fill in for each execution)

- Run date: ___________
- Environment: ___________
- Tester: ___________
- Planner account: ___________
- Feed link used: TI Owls 15U / SC-Casey
- Notes:
  - ___________________________________________________________

| Check | Result | Notes / evidence |
|---|---|---|
| Update/move for Practice A reflects in place | PASS / PARTIAL / PENDING | |
| No duplicate created on update/move | PASS / PARTIAL / PENDING | |
| Local note survives refresh | PASS / PARTIAL / PENDING | |
| Local venue assignment survives refresh | PASS / PARTIAL / PENDING | |
| Source color + label stable | PASS / PARTIAL / PENDING | |
| Cancel/delete behavior observed | PASS / PARTIAL / PENDING | |
| Source-linked hard-delete avoided | PASS / PARTIAL / PENDING | |
| Refresh delay recorded | PASS / PENDING | |

### Team Connect / Team App — TI Owls 15U (SC-Casey)

- Active scope: one imported source (Team Connect / Team App), Weekend Pro UAT account (`weekendpro_test@example.com`)
- Result summary:
  - Update/move behavior: **PASS**
  - Local overlay preservation: **PASS**
  - Linked venue preservation: **PASS**
  - Cancel/delete behavior: **PENDING**
  - Non-destructive retention of source-linked events: **PENDING (must stay false for PASS)**
  - Source/feed color and label persistence: fallback label `Connected calendar` remained stable through refresh; color not explicitly asserted

Checklist (repo-aligned 2.9B-1B pass gates):

- [x] Source update in `Practice A` scenario observed in source feed and reflected in Weekend Planner without duplicate creation.
- [x] Labels persisted across refresh.
- [x] Refresh behavior captured as in-place update for known supported fields.
- [x] Overlay: add local note and/or venue, refresh, confirm persistence.
- [ ] Overlay: confirm source color and source label remain stable.
- [ ] Cancel/delete path: perform on Team Event C equivalent and document resulting planner behavior.
- [ ] Ensure source-linked events are not unexpectedly hard-deleted.
- [ ] Update matrix with refresh delay + discovered cancel/deleted behavior.

Update the platform compatibility row in this file when overlay and cancel/delete behavior is captured:

- Team Connect / Team App row update:
  - `Update result`: passed
  - `Cancel/delete result`: pending/observed
  - `Overlay preservation result`: passed
  - `Known quirks`: source-feed publish/refresh delay (non-real-time, re-import not required in known tests); label import now preserves existing `source_name` when no replacement label is provided
  - Recommendation: Proceed to Stage 2.9B-2 after overlay + cancel/delete confirmation; otherwise escalate follow-up items to 2.9C.
