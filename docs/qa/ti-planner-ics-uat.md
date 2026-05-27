# TI Planner — ICS/iCal Import UAT (Stage 2)

Use this checklist to validate Stage 2 calendar import/refresh on a local dev server (or preview).

## Prereqs
- TI dev server running (example): `PORT=3001 npm run dev --workspace ti-web`
- A test user account you can log into
- One public ICS/iCal URL for testing
  - Prefer one that redirects (HTTP 301/302) if you can find one
  - Prefer one with at least 2 future events

## UAT
1. Log in and open `/planner`.
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
10. Manual events regression:
   - Create a manual event.
   - Edit it.
   - Delete it.
   - Confirm all actions still work.

## Notes / known limitations
- Deleted imported events may reappear on refresh (no suppression in Stage 2).
- Refresh does not delete events missing from the feed.
- DNS rebinding is a theoretical SSRF bypass with native `fetch`; we still block obvious private/local hosts and validate redirect hops.
