# TI Planner — ICS/iCal Import UAT (Stage 2)

Use this checklist to validate Stage 2 calendar import/refresh on a local dev server (or preview).

Production-only DB note: see `docs/weekend-planner-uat.md` for UAT accounts, hosted fixture strategy, and production-safe cleanup.

## Prereqs
- TI dev server running (example): `PORT=3001 npm run dev --workspace ti-web`
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
   - Confirm imported events appear in **Your events** and show “Synced from calendar”.
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
