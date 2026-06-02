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

### Source platforms (not yet tested)

| Platform | Sports Family alias | Subscription URL available? | Feed type | Requires login cookies? | UID stability | SEQUENCE present? | LAST-MODIFIED present? | DTSTAMP present? | Cancel semantics observed | Missing/deleted semantics observed | Recurrence behavior observed | Location quality | Notes/description quality | Baseline import result | Update result | Cancel/delete result | Overlay preservation result | Known quirks | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Team Connect / Team App | TI Owls 15U / SC-Casey | yes (private/tokenized) | webcal/ICS | unknown | unknown | unknown | unknown | unknown | pending | pending | pending | present | pending | passed | **passed (in-place)** | pending | pending | source feed publish + refresh delay observed | active UAT — passed for update/move; overlay/cancel paths pending |
| GameChanger |  | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | not yet tested | not yet tested | not yet tested | not yet tested |  | not yet tested |
| TeamSnap |  | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | not yet tested | not yet tested | not yet tested | not yet tested |  | not yet tested |
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

## Stage 2.9B-1B — Team Connect Lifecycle Validation

### Team Connect / Team App — TI Owls 15U (SC-Casey)

- Active scope: one imported source (Team Connect / Team App)
- Result summary:
  - Update/move behavior: **PASS**
  - Local overlay preservation: **PENDING**
  - Linked venue preservation: **PENDING**
  - Cancel/delete behavior: **PENDING**
  - Non-destructive retention of source-linked events: **PENDING (must stay false for PASS)**
  - Source/feed color and label persistence: observed as stable through update checks

Checklist (repo-aligned 2.9B-1B pass gates):

- [x] Source update in `Practice A` scenario observed in source feed and reflected in Weekend Planner without duplicate creation.
- [x] Labels persisted across refresh.
- [x] Refresh behavior captured as in-place update for known supported fields.
- [ ] Overlay: add local note and/or venue, refresh, confirm persistence.
- [ ] Overlay: confirm source color and source label remain stable.
- [ ] Cancel/delete path: perform on Team Event C equivalent and document resulting planner behavior.
- [ ] Ensure source-linked events are not unexpectedly hard-deleted.
- [ ] Update matrix with refresh delay + discovered cancel/deleted behavior.

Update the platform compatibility row in this file when overlay and cancel/delete behavior is captured:

- Team Connect / Team App row update:
  - `Update result`: passed
  - `Cancel/delete result`: pending/observed
  - `Overlay preservation result`: pending
  - `Known quirks`: source-feed publish/refresh delay (non-real-time, re-import not required in known tests)
- Recommendation: Proceed to Stage 2.9B-2 after overlay + cancel/delete confirmation; otherwise escalate follow-up items to 2.9C.
