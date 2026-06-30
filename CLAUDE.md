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
- TI Lodging Provider Integration UAT (HotelPlanner v2)
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
| UAT Planner (Unverified fixture) | TBD (create one) | TBD |

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

## Pre-Push Vercel Readiness (TI-web)

Run this before handing changes to Claude or pushing for deployment:

- Lint and build:
  - `npm run lint --workspace ti-web`
  - `npm run build --workspace ti-web`
- Validate changeset only:
  - `git status --short` (ensure only intended files are staged/uncommitted)
  - confirm no new errors in changed files
- Minimal planner regression smoke (local/staging):
  - open `/weekend-planner` and confirm:
    - one connected source can be renamed (PATCH flow),
    - one source can be disconnected (new DELETE flow),
    - existing imported events remain visible after disconnect.
- Quick 2.9C policy check:
  - open `docs/qa/ti-planner-ics-uat.md` and verify no unchecked “must-fix before deploy” items are introduced by the change.

Gate outcomes:
- **PASS**: lint/build pass + no blocking changes to unrelated flows.
- **REVIEW**: existing repo-wide warnings only.
- **BLOCK**: any new build/lint errors in touched files or new 2.9C blocker.

---

## Weekend Planner UAT

Routes:
- Canonical Weekend Planner app: https://www.tournamentinsights.com/weekend-planner
- Compatibility alias: https://www.tournamentinsights.com/planner (should redirect)

### Weekend Planner Current State (post Stage 2.10)

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

### Weekend Planner Handoff (2026-06-19)
- Last hardening commit: `90bc4acb` (`Fix planner calendar nav date shape and ICS notes sanitization`).
- Current expectation:
  - Explorer: read-only planner behavior with explicit `Upgrade to Insider to unlock planner actions.` copy.
  - Insider: full planner actions, capped at 2 connected calendars.
  - Weekend Pro: full planner actions + calendar mode + unlimited calendars.
- What was fixed since last pass:
  - `plannerEntitlement` is passed from server tier into client entitlements.
  - Planner action-entry gating now centralized for manual-event entrypoints and ICS editing.
  - ICS notes are sanitized in list cards, calendar modal, and API fetch responses.
  - Schedule-X date controls now normalize date-shape correctly for month/week navigation.
- Priority revalidation before continuing:
  - [ ] Stage 3.5-1C UAT Re-test (tests A/B/C): explorer gating, ICS edit modal privacy, month/week navigation runtime stability.
  - [ ] Planner API entitlement enforcement smoke checks on `children`, `teams`, `events`, and `sources` mutation routes.
  - [ ] `planner_entitlement` analytics payload values for action tracking.

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

### Stage 3.5-1 UAT (Weekend Pro guest family schedule sharing)

Use this after Smoke UAT passes. Run it with:
- **UAT Planner A** as the owner
- a signed-out browser or incognito window as the guest

Scope:
- private guest family schedule link
- Weekend Pro-only creation
- no notes in guest view
- bounded family schedule rendering
- revoke / regenerate / paused-sharing behavior

- [ ] Owner-side share panel:
  - [ ] Logged-in Weekend Pro owner sees a contained `Share family sports schedule` panel on `/weekend-planner`.
  - [ ] Panel copy explains that private notes, account details, calendar source details, and editing controls are hidden.
  - [ ] Guest-token URLs are not auto-opened or auto-prefetched from the owner UI.
- [ ] Weekend Pro-only creation:
  - [ ] Weekend Pro owner can create a guest link.
  - [ ] The UI can reveal/copy the active guest link.
  - [ ] Regenerate replaces the old link with a new one.
  - [ ] Revoke disables the active link immediately.
- [ ] Signed-out guest open:
  - [ ] Guest link opens while signed out.
  - [ ] Guest route is read-only and does not show planner edit / delete / refresh / connect / duplicate / merge / sharing controls.
  - [ ] Child/team labels and colors render safely when available.
  - [ ] Linked venue and `Directions` actions work.
- [ ] Family scope correctness:
  - [ ] Guest view includes guest-safe assigned and unassigned planner events that would normally appear in the owner’s consolidated planner schedule within the bounded window.
  - [ ] Guest view does not incorrectly collapse to child/team-assigned events only.
  - [ ] Guest view does not expose unbounded historical events.
- [ ] Privacy guardrails:
  - [ ] No guest-visible notes are shown.
  - [ ] No raw UUIDs, source URLs, `source_event_uid`, source IDs, feed metadata, or debug data appear in normal guest UI.
  - [ ] Guest route metadata is generic + noindex.
  - [ ] `/weekend-planner/shared/` is disallowed in `robots.txt`.
- [ ] Failure behavior:
  - [ ] Invalid random token returns HTTP 404.
  - [ ] Revoked token returns the same generic HTTP 404 behavior.
  - [ ] After regeneration, old token returns HTTP 404 and new token works.
- [ ] Owner loses Weekend Pro:
  - [ ] If the owner is downgraded from Weekend Pro, the existing guest link no longer renders and returns generic HTTP 404.
  - [ ] Existing share row is treated as paused, not silently deleted.
  - [ ] If implemented, non-Pro owner can still revoke as a privacy control.
- [ ] Empty-state behavior:
  - [ ] If the bounded guest window has no events, the guest sees a clear read-only no-events message instead of a blank page.

---

### Stage 3.5-1B UAT (Weekend Pro private family iCal subscription feed)

Use this after Stage 3.5-1 passes. Run it with:
- **UAT Planner A** as the owner
- Apple Calendar / Google Calendar / Outlook only if practical

Scope:
- private family iCal subscription feed
- Weekend Pro-only creation
- read-only calendar export
- no notes or raw source metadata
- regenerate / revoke / paused-feed behavior

- [ ] Owner-side subscription panel:
  - [ ] Logged-in Weekend Pro owner sees a contained `Subscribe in your calendar` panel on `/weekend-planner`.
  - [ ] Panel copy explains that this is a read-only subscription feed and edits still happen in Weekend Planner.
  - [ ] Panel warns that calendar apps control refresh timing.
  - [ ] Revoke / regenerate UI clearly warns that external calendar apps may retain previously fetched events until they refresh or the subscription is removed.
  - [ ] Feed-token URLs are not auto-opened or auto-prefetched from the owner UI.
- [ ] Weekend Pro-only management:
  - [ ] Weekend Pro owner can create a calendar URL.
  - [ ] The UI can reveal/copy the active calendar URL.
  - [ ] Regenerate replaces the old calendar URL with a new one.
  - [ ] Revoke disables the active calendar URL immediately for future refreshes.
- [ ] Feed route behavior:
  - [ ] Feed URL returns `HTTP 200` with `Content-Type: text/calendar`.
  - [ ] Response uses a valid `VCALENDAR` payload with no HTML wrapper.
  - [ ] `Content-Disposition` uses an inline `.ics` filename.
  - [ ] Unknown / revoked / inactive / non-Pro feed states all return the same empty valid calendar and no schedule data.
  - [ ] Only malformed token paths return `HTTP 404`.
- [ ] Calendar content correctness:
  - [ ] Feed includes guest-safe assigned and unassigned family planner events within the bounded window.
  - [ ] Feed does not expose unbounded historical events.
  - [ ] Suppressed events do not appear.
  - [ ] Event titles, times, and safe locations look reasonable in the raw `.ics` output or subscribed calendar client.
  - [ ] Stable event UIDs prevent obvious duplicate re-import behavior after regeneration.
- [ ] Privacy guardrails:
  - [ ] No notes, imported notes, source URLs, source IDs, `source_event_uid`, raw UUIDs, billing data, or debug metadata appear in the calendar output.
  - [ ] Calendar route is not included in sitemap output.
  - [ ] `/weekend-planner/calendar/` is disallowed in `robots.txt`.
- [ ] Owner loses Weekend Pro:
  - [ ] If the owner is downgraded from Weekend Pro, the existing feed no longer returns schedule data and instead returns the same empty valid calendar behavior.
  - [ ] Existing feed row is treated as paused, not silently deleted.
  - [ ] If implemented, non-Pro owner can still revoke as a privacy control.
- [ ] Empty-state behavior:
  - [ ] If the bounded feed window has no events, the route still returns a valid empty calendar instead of an error.

### Stage 3.5-1C UAT (Planner entitlement behavior)

- [ ] Entitlement matrix acceptance:
  - [ ] Explorer users are in read-only mode for planner mutations and see Explorer-specific copy (`Upgrade to Insider…`), not Insider cap copy.
  - [ ] Insider users can create/edit/delete manual events and can connect up to 2 calendars; they remain blocked at 2.
  - [ ] Weekend Pro users can still access calendar mode (list/season toggle) and connect beyond 2.
- [ ] Explorer write/refresh guards:
  - [ ] `Create`, `Edit`, `Delete`, `Refresh`, `Disconnect`, `Duplicate`, `Keep separate`, `Source assignment`, and `calendar import` actions all show gated messaging and do not perform changes.
  - [ ] Explorer cannot modify child/team profile manager actions (`Add`, `Edit`, `Archive`, `Restore`).
- [ ] Calendar limits:
  - [ ] Insider can connect second calendar without blocking.
  - [ ] Insider cannot add third active calendar without upgrading to Weekend Pro.
  - [ ] The copy at two-calendar cap references "2 connected calendars".
- [ ] API enforcement:
  - [ ] Planner child/team/events/sources duplicate and merge endpoints reject explorer and unverified sessions with entitlement errors.
  - [ ] Team create/update/restore enforces active team cap across the account at 2 for Insider.
- [ ] Profile and family behavior:
  - [ ] Archived teams/children remain available in read-only mode but do not allow state changes.
  - [ ] Team restore/archive attempts follow cap or permission constraints consistently.
- [ ] Analytics sanity:
  - [ ] Explorer/Insider/Weekend Pro values appear correctly in planner action tracking payloads and are not downgraded to hardcoded "insider".

### Stage 3.5-1C UAT (Planner entitlement hardening follow-up)

- [ ] Manual-event add-entrypoint control:
  - [ ] Logged-in explorer cannot open the manual-event form via **Header Add event**, **Schedule → Add manual event card button**, or any other add-event CTA.
  - [ ] Explorer receives the `Upgrade to Insider to unlock planner actions.` blocking message when attempting manual-event entry.
- [ ] ICS notes privacy filtering:
  - [ ] Imported ICS notes in list cards never include raw URLs.
  - [ ] Imported ICS notes in calendar detail modal never include raw URLs or UUID-like tokens.
- [ ] Calendar month navigation:
  - [ ] In month mode, “Previous month” and “Next month” consistently jump exactly one month at a time from current month view.
  - [ ] Week mode behavior for previous/next week remains unchanged.

### Stage 3.5-1C UAT Re-test (2026-06-18 local, tab 1758705939)

- [x] Test A — Explorer add-event entrypoints blocked:
  - Header tab-bar `Add event` + section card `Add event` show no modal for explorer session.
  - Copy reads exact `Upgrade to Insider to unlock planner actions.`
  - No `POST /api/planner/events` observed.
- [ ] Test B — ICS notes privacy in edit modal:
  - Open a TeamSnap-sourced event in List view and enter Edit.
  - Event `Notes` field should suppress `Link:`, raw URL strings, and UUID-like tokens.
  - Confirm the event payload still saves and displays safely in Card/List views.
- [ ] Test C — Calendar month/week navigation:
  - Start in Month view with label `June 2026`; click ‹ then ›.
  - Confirm label progression becomes `May 2026` then `June 2026`.
  - In Week view, confirm at least one 7-day label shift per click (`Jun 15 – Jun 21, 2026` -> `Jun 22 – Jun 28, 2026`).
  - Confirm no runtime errors are logged for `to.subtract` or `toZonedDateTime`.

Retest prompt (Claude/Desktop):
1. Navigate directly to `http://localhost:3001/weekend-planner` while logged in as a Weekend Pro fixture.
2. Open List view, locate a known imported TeamSnap event, open Edit, and validate Notes are sanitized.
3. Return to Calendar view, capture month label, click month ‹ and ›, then switch to Week view and click week ‹ and ›.
4. Log any failures with:
   - viewport size
   - action taken
   - exact label/state before/after each click
   - first thrown runtime error (if any) with full stack.

### TI Lodging Provider Integration UAT (HotelPlanner v2)

Use this after the lodging implementation is in place and before any staging/public push.

Implementation docs:
- `docs/prompts/ti-lodging-provider-integration-v2.md`
- `docs/prompts/ti-lodging-provider-integration-v2-spec.md`
- `docs/prompts/ti-lodging-provider-integration-v2-engineering.md`
- `docs/prompts/ti-lodging-provider-qa-checklist-v2.md`

Copy/paste prompt:
1. Open `http://localhost:3001/tournaments/[slug]/map` on a tournament with venue lat/lon and dates.
2. Confirm lodging panel mounts in venue detail context and only after map/location context is available.
3. Test both successful and fallback paths:
   - Normal success: hotel cards show name, distance, rating/review count, thumbnail, and from-price.
   - Missing coordinates or low inventory: Booking.com + VRBO fallback CTAs are still visible.
4. Click one lodging card, verify availability loads, room options render, and HotelPlanner handoff form submits (not TI API for payment).
5. Click a room-rate CTA in the room list:
   - a new tab opens through `/go/hotels/checkout`,
   - TI returns an auto-submitting HTML form,
   - final handoff posts to HotelPlanner white-label checkout `/Accept/CheckOut.htm`,
   - no TI-hosted payment screen appears.
6. Validate “Need 5+ rooms?” CTA opens group-request flow and requires required fields.
7. Check Network for `/api/lodging/search`, `/api/lodging/availability`, `/go/hotels/checkout`, `/api/lodging/group-request`, `/api/analytics`.

Optional targeted UAT for handoff compatibility:
1) Open `http://localhost:3001/go/hotels?provider=hotelplanner&venueId=ecd43a1e-d24a-4f0d-807b-2084ac24131e&checkin=2026-07-01&checkout=2026-07-03&source=tournament_detail&lat=47.69741&lng=-117.23642&kw=Plantes%20Ferry&jobcode=TI-DEV-TEST&custom1=ven%3Aecd43a1e-d24a-4f0d-807b-2084ac24131e`
2) Verify final redirected URL includes:
   - `destination=47.69741%2C-117.23642`
   - `latitude=47.69741`
   - `longitude=-117.23642`
   - `CheckIn=07%2F01%2F2026`
   - `CheckOut=07%2F03%2F2026`
   - `source=tournamentinsights`
   - `sc=tournamentinsights`
   - `kw=Plantes+Ferry`
   - `jobCode=TI-DEV-TEST`
   - `Custom1=...`
   - Tracking params should not be dropped for lowercase variants (`custom1`, `jobcode`) passed in from URL query.

### Step 3 TI Lodging Map UI UAT (local)

Run after Step 3 implementation is deployed to local server.

1) Open a tournament map page on local:
   - `http://localhost:3001/tournaments/<slug>/map`
   - choose a venue with coordinates and a linked tournament date context if available.
2) In venue detail panel, confirm hotel section now uses HotelPlanner search API:
   - cards are populated from live search results (not old static placeholders),
   - each card shows name + distance + rating/review count + from-price.
3) Verify marker behavior:
   - desktop map shows at most 10 hotel markers (list may show more cards),
   - mobile map shows at most 6 markers,
   - hotels without latitude/longitude appear in list but are not pinned.
4) Verify selected marker and filters:
   - clicking a hotel marker highlights that marker and selected hotel card,
   - rating filter updates visible card list and pinned markers.
5) Verify date controls:
   - check-in/check-out populate from search result when available,
   - date inputs allow overrides and clicking Update dates re-fires availability on the selected hotel,
   - invalid ranges block availability and show a clear error.
6) Verify fallback paths:
   - no hotel / `showBookingFallback` / `showVrboFallback` shows fallback panel with HotelPlanner + VRBO CTAs,
   - `no_venue_coordinates` or `no_dates` includes handoff fallback CTA,
   - `/api/lodging/search` `429` does not block venue switching/map interaction.
7) Click one hotel card or marker:
   - availability request fires once for selected card/marker,
   - room/rate options render when available,
   - `hotel_room_view` appears only when options render,
   - stale/rapid clicks do not render stale room results.
   - clicking a room-rate CTA opens a new tab via `/go/hotels/checkout` and continues to HotelPlanner checkout
8) Verify no-date behavior:
   - if check-in/check-out is not set, availability is blocked with a validation message,
   - once valid dates are set, availability can be requested (manual date overrides supported).
9) Check events in Network/analytics:
   - confirm single batched `hotel_pin_impression` event per map render batch with `count`,
   - confirm `hotel_pin_click`, `hotel_card_click`, `hotel_availability_requested/succeeded/failed`, and `hotel_room_view` payloads include venue/tournament context.

10) Validate room-level handoff correctness:
   - hotel room handoff action opens `/go/hotels/checkout` in a new tab,
   - the TI relay returns an auto-submitting HTML form POST,
   - final destination is HotelPlanner white-label checkout `/Accept/CheckOut.htm`,
   - no TI payment route is used for booking in this step,
   - after room options are loaded, changing date inputs without clicking `Update dates` does not change the room checkout payload for those already-loaded options.

### Stage 3.5 HotelPlanner Provider-Only UAT (Step 2)

Latest Step 2 API run (local `localhost:3001`) result:
- `POST /api/lodging/group-request` split parsing fix is in place (`split` accepted as number and converted with int bounds).
- Route accepts `mm/dd/yyyy` and also normalizes ISO `YYYY-MM-DD` inputs to `mm/dd/yyyy`.
- Property-level provider errors still return `502` with `code:"422"` for unknown HotelPlanner property IDs (expected API rejection path).

### Stage 3.5 HotelPlanner Provider-Only UAT (Step 1 - Search Endpoint)

- [ ] Environment + compile checks
  - `cd /Users/roddavis/RI_MVP/RI-MVP && npx tsc -p apps/ti-web/tsconfig.json --noEmit`
  - `cd /Users/roddavis/RI_MVP/RI-MVP && node --import tsx apps/ti-web/lib/lodging/hotelPlannerProvider.test.ts`
  - Confirm required env vars are set for local server (no `NEXT_PUBLIC_` variants):
    - `TI_LODGING_PROVIDER=hotelplanner`
    - `HOTELPLANNER_API_KEY`
    - `HOTELPLANNER_SECRET_KEY`
    - `HOTELPLANNER_ACCOUNT_ID`
    - `HOTELPLANNER_SITE_ID`
    - `HOTELPLANNER_BASE_URL` (optional default)
    - `HOTELPLANNER_WHITE_LABEL_BASE_URL`
- [ ] `/api/lodging/search` behavioral checks via local API calls
  - `venueId` invalid format => 400 `Invalid venueId`.
  - `venueId` missing in DB => 400 `Venue not found`.
  - Missing explicit dates + missing/invalid tournamentId fallback => 200 with `fallback.reason = no_dates` and empty `hotels`.
  - Missing venue coords + no city/state => 200 with `fallback.reason = no_venue_coordinates` and empty `hotels`.
  - Valid request => `sessionId`, `provider`, `fallback` present and `hotels` array (may be empty with low_inventory).
  - Low inventory (`< 3`) returns fallback flags and keeps HTTP 200 when provider call succeeds.
  - Trigger rate-limit conditions by 6+ rapid requests from same IP/UA => 429.
- [ ] Session lifecycle sanity
  - Confirm `lodging_search_session` rows are created and move from `started` to `succeeded` on success.
  - Confirm failures write `failed` with `error_code` and optional `response_snapshot`.
  - Confirm early-fallback paths (no_dates/no_venue_coordinates) do not persist `started` rows.
- [ ] Data shape verification
  - Confirm `sc`/`source`, `keyword/kw`, `jobCode`, and `Custom1-8` survive request-to-provider passthrough on provider query construction.
  - Confirm `customerIPAddress` and `customerUserAgent` are populated in provider calls.

- [ ] Set required environment variables for local/CI/dev:
  - `TI_LODGING_PROVIDER=hotelplanner`
  - `HOTELPLANNER_API_KEY=...`
  - `HOTELPLANNER_SECRET_KEY=...`
  - `HOTELPLANNER_ACCOUNT_ID=...`
  - `HOTELPLANNER_SITE_ID=...`
  - `HOTELPLANNER_BASE_URL=https://api.hotelplanner.com/hpapi/v2.3/`
  - `HOTELPLANNER_WHITE_LABEL_BASE_URL=...`

- [ ] Run pre-implementation code verification:
  - `cd /Users/roddavis/RI_MVP/RI-MVP && npx tsc -p apps/ti-web/tsconfig.json --noEmit`
  - `cd /Users/roddavis/RI-MVP/RI-MVP && node --import tsx apps/ti-web/lib/lodging/hotelPlannerProvider.test.ts`
- [ ] Confirm unit signals:
  - `buildHotelPlannerAuthorizationToken` returns token with two dot-separated base64url segments.
  - `buildHotelPlannerQuery` includes `method`, `epoch`, `customerIPAddress`, `customerUserAgent`, and optional tracking params.
  - `createHotelPlannerProvider.searchHotels` submits POST to `https://api.hotelplanner.com/hpapi/v2.3/` and includes required auth headers.

### Vercel env vars (server runtime only)

- Add in Vercel Project Settings → Environment Variables:
  - `TI_LODGING_PROVIDER=hotelplanner`
  - `HOTELPLANNER_API_KEY`
  - `HOTELPLANNER_SECRET_KEY`
  - `HOTELPLANNER_ACCOUNT_ID`
  - `HOTELPLANNER_SITE_ID`
  - `HOTELPLANNER_BASE_URL` (optional default: `https://api.hotelplanner.com/hpapi/v2.3/`)
  - `HOTELPLANNER_WHITE_LABEL_BASE_URL`
- These should be server-only env vars (no `NEXT_PUBLIC_*` variants).

### Stage 3 TI Lodging Provider Integration UAT Checklist

- [ ] Step 2 route checks:
  - [ ] `POST /api/lodging/availability` 400s on invalid `propertyId`, malformed dates/range, and invalid numeric values.
  - [ ] `POST /api/lodging/availability` returns `{ sessionId, provider, propertyId, currency, roomOptions }` with `roomOptions` containing raw data for each option.
  - [ ] `/api/lodging/availability` writes/updates `lodging_search_session` rows (`endpoint='/api/lodging/availability'`, status transitions, latency, `result_count`).
  - [ ] `POST /api/lodging/group-request` enforces `rooms >= 5` and requires name/email/check-in/out + room details.
  - [ ] `/api/lodging/group-request` returns `{ sessionId, provider, propertyId, success, requestId? }` with `requestId` omitted when absent.
  - [ ] `/api/lodging/group-request` writes/updates `lodging_search_session` rows (`endpoint='/api/lodging/group-request'`, result_count `1` success / `0` fail).
- [ ] Re-run command examples:
  - `cd /Users/roddavis/RI_MVP/RI-MVP && curl -s -X POST http://localhost:3001/api/lodging/availability -H 'content-type: application/json' -d '{"propertyId":"ecd43a1e-d24a-4f0d-807b-2084ac24131e","checkin":"2026-07-01","checkout":"2026-07-03"}'`
  - `cd /Users/roddavis/RI_MVP/RI-MVP && curl -s -X POST http://localhost:3001/api/lodging/group-request -H 'content-type: application/json' -d '{"propertyId":"ecd43a1e-d24a-4f0d-807b-2084ac24131e","checkin":"2026-07-01","checkout":"2026-07-03","rooms":5,"split":2,"firstName":"QA","lastName":"Tester","email":"qa@example.com","roomTypeCode":"A"}'`
- [ ] Search input integrity:
  - [ ] `checkIn` / `checkOut` are sent as `mm/dd/yyyy` with `tournament_start_date` and `tournament_end_date` as source of truth.
  - [ ] Missing/invalid tournament dates are surfaced as safe fallback instead of broken search errors.
- [ ] Destination mapping:
  - [ ] Venue lat/lon is preferred and address fallback works if lat/lon is missing.
- [ ] Redirect handoff integrity (`/go/hotels` fallback path):
  - [ ] When lat/lng are available, verify redirect includes `destination=<lat,long>` plus `latitude` and `longitude`, and does not require `city`.
  - [ ] `sc`, `source`, `CheckIn`, `CheckOut`, `kw`, `jobCode`, `Custom1-8` (when provided) are present in redirect URL to hotelplanner white-label domain.
  - [ ] Redirect URL remains functional and destination-aware (no generic landing page fallback) for real venue IDs.
- [ ] API behavior:
  - [ ] `/api/lodging/search` returns `{ provider, hotels, fallback }` and `sessionId`.
  - [ ] `/api/lodging/availability` triggers only on hotel selection/click.
  - [ ] `/api/lodging/checkout-handoff` returns checkout payload and performs only hosted handoff.
- [ ] Event tracking:
  - [ ] Required events appear in analytics payloads with session/hotel context.
- [ ] Group requests:
  - [ ] Group request requires 5+ rooms and submits fields: `split`, `rating`, `roomTypeCode`, `comments`, `targetRate`, `minRate`, `itinerary`.
  - [ ] `groupTypeCode` defaults to `143` for first-party flow unless intentionally overridden.
- [ ] Guardrails:
  - [ ] No HotelPlanner credentials visible in client bundles or requests.
  - [ ] No `reserve` or payment collection endpoint is invoked by TI UI/routes.
  - [ ] Existing Booking.com and VRBO CTAs remain unchanged as explicit alternatives.
- [ ] Security:
  - [ ] `/api/lodging/report-sync` returns unauthorized for non-admin/non-cron callers.
  - [ ] `/api/lodging/checkout-handoff` does not expose session secrets.

---

### Stage 3.0 UAT (responsive layout foundation)

Use this after Smoke UAT passes. Verify both desktop/tablet and a narrow mobile viewport (375px wide if possible).

- [ ] Desktop/tablet remains schedule-first:
  - [ ] `Your schedule` remains the primary first section.
  - [ ] Connected calendars remain visible and usable without burying the schedule.
  - [ ] Calendar/List toggle still works where entitled.
- [ ] Mobile becomes card/scroll-first:
  - [ ] No horizontal overflow at 375px.
  - [ ] Schedule actions, event actions, and connected-calendar actions remain tappable.
  - [ ] Dense calendar grid is not the primary forced mobile path.
- [ ] Summary + section navigation:
  - [ ] Summary chips render without overlap.
  - [ ] Mobile section buttons (`Schedule`, `Add Event`, `Calendars`) scroll to the expected section.
- [ ] Add Event behavior:
  - [ ] `Add event` remains collapsed by default on load.
  - [ ] Expanding `Add event` still reveals the existing manual form and submission flow.
- [ ] Event card clarity:
  - [ ] Feed/source labels remain visible on imported events.
  - [ ] Source/feed colors remain visible where already supported.
  - [ ] Conflict badges remain visible and not color-only.
  - [ ] Venue/map/directions actions remain usable on mobile.
- [ ] Loaded-event honesty:
  - [ ] Loaded-event disclosure remains visible in list views.
  - [ ] When truncated, wording still says duplicates/conflicts only consider loaded events.
  - [ ] When fully loaded, wording still says all events in range are loaded.
- [ ] Connected calendars:
  - [ ] Calendar cards remain readable on mobile.
  - [ ] Rename / Refresh schedule / Disconnect actions remain usable on mobile without layout breakage.
- [ ] Duplicate / merge / cleanup flows:
  - [ ] Duplicate suggestion cards remain readable on mobile.
  - [ ] Review merge / Keep separate / dismiss paths remain usable.
  - [ ] Existing manual cleanup and suppression behavior is unchanged.
- [ ] Entitlements / privacy:
  - [ ] `/weekend-planner` is still not hard-gated.
  - [ ] Explorer / Insider / Weekend Pro messaging remains intact.
  - [ ] No raw IDs, source URLs, or `source_event_uid` values appear in UI.

---

### Stage 3.1A UAT (linked venue navigation)

Use this after Smoke UAT passes. Verify linked-venue behavior on at least one event that already has a persisted linked TI venue and one event without a linked venue.

- [ ] Linked venue navigation:
  - [ ] For an event with a linked venue, the `Linked venue:` row is visible.
  - [ ] The linked venue name/line is clickable.
  - [ ] Clicking it opens the main TI venue detail page, not the maps-only route.
- [ ] Conditional rendering:
  - [ ] Events without a linked venue do not show a broken or invented venue link.
  - [ ] Non-linked events otherwise preserve current behavior.
- [ ] Source location clarity:
  - [ ] Source location text remains visible when present.
  - [ ] Linked venue text does not replace or hide distinct source location text unexpectedly.
- [ ] Fast utility actions:
  - [ ] Existing `Map` action still works.
  - [ ] Venue navigation does not replace map/directions actions.
  - [ ] Mobile layout remains stable when the linked venue row is clickable.
- [ ] Safety / regressions:
  - [ ] No raw IDs, source URLs, or `source_event_uid` values appear in normal UI.
  - [ ] Duplicate / merge / cleanup behavior is unchanged.
  - [ ] Entitlement behavior is unchanged.

---

### Stage 3.1 UAT (venue-aware event card integration)

Use this after Smoke UAT passes. Verify at least one event with both a linked TI venue and a distinct source location, if available.

- [ ] Venue display clarity:
  - [ ] Venue context is easier to scan than a plain raw metadata stack.
  - [ ] `Linked venue` is clearly distinguished from `Source location`.
  - [ ] Linked venue remains the primary planner venue reference when present.
- [ ] Source location preservation:
  - [ ] Distinct source location text remains visible when present.
  - [ ] Source location is not silently erased just because a linked venue exists.
  - [ ] The UI does not imply the system auto-verified that linked venue and source location are the same.
- [ ] Linked venue destination:
  - [ ] Linked venue remains clickable when present.
  - [ ] The destination remains the main TI venue detail page.
- [ ] Venue-related actions:
  - [ ] Existing `Map` action still works.
  - [ ] Venue actions remain compact and usable.
  - [ ] Mobile layout remains stable with venue context + actions visible.
- [ ] Safety / regressions:
  - [ ] No raw venue IDs, planner event IDs, source URLs, or `source_event_uid` values appear in normal UI.
  - [ ] Duplicate / merge / manual cleanup behavior is unchanged.
  - [ ] Feed refresh and source-linked event behavior are unchanged.
  - [ ] Entitlement behavior is unchanged.
  - [ ] No new auto-matching or broadened venue-search behavior is visible.

---

### Stage 3.2 UAT (mobile next-event action hierarchy)

Use this after Smoke UAT passes. Test on a narrow/mobile viewport if possible and verify at least one future loaded event.

- [ ] Mobile next-event hierarchy:
  - [ ] A compact `Next up` treatment appears on the first upcoming loaded event card rather than as a duplicated second event module.
  - [ ] The next upcoming loaded event is easier to identify on mobile.
  - [ ] The full schedule remains visible below the prioritized next-event treatment.
  - [ ] The treatment stays schedule-first and does not become a sticky/modal-first command shell.
- [ ] Timezone-safe ordering:
  - [ ] The promoted next event reflects the earliest future loaded event using existing timezone-safe planner ordering.
  - [ ] All-day events do not cause crashes or ambiguous broken promotion behavior.
  - [ ] Loaded-event boundaries remain respected; no unbounded event expansion is implied.
- [ ] Venue-aware actions:
  - [ ] Linked venue remains distinguishable from source location.
  - [ ] Existing linked venue navigation still works when present.
  - [ ] Existing `Map` / directions behavior still works.
  - [ ] Action rows wrap cleanly and remain usable at mobile widths.
- [ ] Mobile readability:
  - [ ] No horizontal overflow is introduced at narrow widths.
  - [ ] Conflict badges remain readable.
  - [ ] Source/feed labels remain readable.
  - [ ] Venue context remains readable and tappable where applicable.
- [ ] Safety / regressions:
  - [ ] Desktop layout does not regress.
  - [ ] Duplicate / merge / manual cleanup behavior is unchanged.
  - [ ] Feed refresh and source-linked event behavior are unchanged.
  - [ ] Entitlement behavior is unchanged.
  - [ ] No raw venue IDs, planner event IDs, source URLs, `source_event_uid`, or database UUIDs appear in normal UI.
  - [ ] No new auto-matching, venue-search expansion, route-planning, or travel-time behavior is visible.

---

### Stage 3.3 UAT (PWA shell / home-screen polish)

Use this after Smoke UAT passes. Verify the manifest directly first, then check the Weekend Planner route in browser and standalone-like contexts where feasible.

- [ ] Manifest and icons:
  - [ ] `GET /manifest.webmanifest` returns `200` with valid JSON.
  - [ ] Manifest `name` is `TournamentInsights`.
  - [ ] Manifest `short_name` is `TI Planner`.
  - [ ] Manifest `start_url` points to `/weekend-planner`.
  - [ ] Manifest `display` is `standalone`.
  - [ ] Manifest theme/background colors are configured.
  - [ ] Manifest icon entries exist for planner install surfaces.
  - [ ] Icon treatment is the TI mark in white on TI dark green background.
- [ ] Platform metadata:
  - [ ] Apple mobile-web-app metadata is present where expected.
  - [ ] `viewport-fit=cover` is present so safe-area insets can work on notched devices.
  - [ ] Android add-to-home-screen via browser menu has appropriate manifest data.
- [ ] Standalone / shell polish:
  - [ ] Mobile home-screen launch opens `/weekend-planner` cleanly.
  - [ ] Standalone mode has no top safe-area overlap.
  - [ ] Standalone mode has no bottom safe-area collision with footer or actions.
  - [ ] Sticky headers and bottom actions do not collide with safe areas.
  - [ ] No horizontal overflow is introduced.
  - [ ] Shared TI header logo stays constrained within the viewport and does not create horizontal scrolling at narrow widths.
- [ ] Planner regressions:
  - [ ] Stage 3.2 next-event treatment still works.
  - [ ] Linked venue actions still work.
  - [ ] Map / directions behavior still works.
  - [ ] Conflict badges and source labels remain readable.
  - [ ] Duplicate / merge / manual cleanup behavior is unchanged.
  - [ ] Feed refresh and source-linked event behavior are unchanged.
  - [ ] Entitlement behavior is unchanged.

### Stage 3.3C-1 UAT (child/team profiles foundation)

Use this after Smoke UAT passes. Keep scope strictly on child/team profile creation and management. This stage does not assign events or calendars yet.

- [ ] Child profile management:
  - [ ] A signed-in user can create a child profile.
  - [ ] A signed-in user can edit a child profile.
  - [ ] A signed-in user can archive a child profile.
  - [ ] Restoring an archived child profile works if restore is exposed.
- [ ] Team profile management:
  - [ ] A signed-in user can create a team under a child.
  - [ ] A signed-in user can edit a team.
  - [ ] A signed-in user can archive a team.
  - [ ] Restoring an archived team works if restore is exposed.
- [ ] Optional rollout:
  - [ ] Weekend Planner remains usable with zero child/team profiles.
  - [ ] Child/team setup is reachable but not forced.
- [ ] No assignment drift:
  - [ ] No child/team assignment UI appears on planner events yet.
  - [ ] No child/team assignment UI appears on connected calendars yet.
  - [ ] Existing free-text `team_name` behavior is unchanged.
- [ ] No regressions:
  - [ ] Duplicate / merge behavior is unchanged.
  - [ ] Linked venue behavior is unchanged.
  - [ ] Map / directions behavior is unchanged.
  - [ ] ICS source refresh/disconnect behavior is unchanged.
  - [ ] Entitlement behavior is unchanged.
  - [ ] No raw IDs or internal schema details leak into normal UI.
- [ ] Auth and privacy:
  - [ ] Signed-out launch preserves return-to behavior back to `/weekend-planner` after login.
  - [ ] `/weekend-planner` remains accessible under existing auth behavior.
  - [ ] No raw IDs, source URLs, `source_event_uid`, or database UUIDs appear in normal UI.
- [ ] Guidance and follow-up:
  - [ ] If a home-screen hint exists, it is non-blocking, dismissible, and does not imply native app, push, or offline support.
  - [ ] Note whether a maskable icon variant already exists, was added, or should remain a follow-up.

---

### Stage 3.3C-2 UAT (child/team assignment)

Use this after Smoke UAT passes. Keep scope on source assignment, manual-event assignment, and family-context display. Imported events should inherit family context from their assigned source only.

- [ ] Source assignment:
  - [ ] A connected calendar can be left `Unassigned`.
  - [ ] A connected calendar can be assigned to a child only.
  - [ ] A connected calendar can be assigned to a child + team.
  - [ ] Changing the child clears any invalid team selection.
  - [ ] Refreshing an assigned source keeps the assignment intact.
  - [ ] Disconnecting an assigned source still preserves imported events and does not break planner rendering.
- [ ] Manual event assignment:
  - [ ] A manual event can be created unassigned.
  - [ ] A manual event can be created with child/team assignment if the create form exposes assignment.
  - [ ] A manual event can be edited to add, change, or clear child/team assignment.
  - [ ] Invalid child/team combinations are not possible through the visible UI.
- [ ] Imported event behavior:
  - [ ] Imported events do not expose per-event assignment controls.
  - [ ] Imported events display family context only when their source is assigned.
  - [ ] Changing a source assignment updates imported-event family context after reload/refresh.
  - [ ] Imported event titles/descriptions are unchanged; family context is shown as separate UI, not injected into event text.
- [ ] Planner card display:
  - [ ] Assigned events show compact family context such as `Assigned: Child` or `Assigned: Child · Team`.
  - [ ] Family context does not replace source labels on imported events.
  - [ ] Family context does not replace linked venue or source location rows.
  - [ ] Conflict badges remain visually distinct from family assignment.
  - [ ] Source/feed color identity remains visually distinct from family assignment.
- [ ] Archived profile safety:
  - [ ] Existing assignments still render readable child/team names if an assigned child or team is later archived.
  - [ ] Assignment selectors do not enter a broken or blank state after archive/restore changes.
  - [ ] Child/team manager updates are reflected in planner assignment selectors without requiring a full logout/login cycle.
- [ ] Mobile safety (375px if possible):
  - [ ] Source assignment controls wrap without horizontal overflow.
  - [ ] Manual-event assignment controls wrap without horizontal overflow.
  - [ ] Assigned-family labels on event cards wrap cleanly and do not hide action buttons.
- [ ] No regressions:
  - [ ] Duplicate / merge behavior is unchanged.
  - [ ] Linked venue behavior is unchanged.
  - [ ] Map / directions behavior is unchanged.
  - [ ] Entitlement behavior is unchanged.
  - [ ] No planner filters were added in this stage.
  - [ ] No raw IDs, source URLs, `source_event_uid`, or UUIDs appear in normal UI.

---

### Stage 3.3C-4A UAT (family color + assignment badge polish)

Use this after Stage `3.3C-3` is stable. Keep scope on display polish only: child-color rendering, assignment badges, calendar ownership readability, and legend clarity.

- [ ] List card assignment badge:
  - [ ] Assigned list events show a compact family badge in the upper-right area of the card.
  - [ ] The badge uses child color and remains readable for child-only and child+team labels.
  - [ ] The badge does not overlap title, source labels, conflict badges, venue rows, or action buttons.
  - [ ] Unassigned events do not show a misleading family badge.
- [ ] Calendar ownership display:
  - [ ] Assigned calendar events are easier to scan by child than before.
  - [ ] Child color is visible on assigned calendar events.
  - [ ] Ownership display does not make small calendar events unreadable.
  - [ ] Imported events still reflect source-derived assignment only.
- [ ] Family legend:
  - [ ] A compact family-color legend is visible in or near calendar view.
  - [ ] Legend entries match rendered child colors.
  - [ ] Unassigned events remain visually understandable.
- [ ] Signal separation:
  - [ ] Child color clearly means family ownership.
  - [ ] Source identity remains visible as text/label and is not confused with child color.
  - [ ] Conflict warnings remain visually distinct from both source identity and child color.
- [ ] Mobile safety (`375px` if possible):
  - [ ] Assignment badges wrap cleanly with no horizontal overflow.
  - [ ] Event cards do not become excessively tall.
  - [ ] Calendar controls and legend remain usable.
- [ ] No regressions:
  - [ ] Family filter still works.
  - [ ] Import-time assignment still works.
  - [ ] Source reassignment still works.
  - [ ] Duplicate / merge behavior is unchanged.
  - [ ] Venue / map behavior is unchanged.
  - [ ] Entitlement behavior is unchanged.

---

### Stage 3.3C-4B UAT (child color selection + badge consistency)

Use this after Stage `3.3C-4A` is stable. Keep scope on child-owned color selection, consistent badge placement, and safe reuse of those colors across planner surfaces.

- [ ] Child color selection:
  - [ ] Edit child flow exposes a curated color picker.
  - [ ] Saving a child without changing the color preserves the existing color.
  - [ ] Saving a newly selected color persists after reload.
  - [ ] Invalid/blank states fall back safely without breaking the child profile.
- [ ] Ownership color reuse:
  - [ ] Selected child colors appear on assigned list-card badges.
  - [ ] Selected child colors appear on assigned calendar events.
  - [ ] Selected child colors appear in the family legend.
  - [ ] Unassigned events remain neutral/default.
- [ ] Badge consistency:
  - [ ] Short labels like `Avery` stay in the upper-right badge location.
  - [ ] Longer labels like `Casey · Owls TC` stay in the same badge location.
  - [ ] Long labels wrap or compact cleanly without reverting to a full-width assignment row.
  - [ ] Badges do not overlap title, conflict badge, source labels, venue rows, or action buttons.
- [ ] Signal separation:
  - [ ] Child color still means family ownership only.
  - [ ] Source identity remains visible as text/label and is not confused with child color.
  - [ ] Conflict warnings remain visually distinct from ownership color.
- [ ] Mobile safety (`375px` if possible):
  - [ ] Child color picker remains tappable and readable.
  - [ ] Long family badges wrap cleanly with no horizontal overflow.
  - [ ] Cards do not become significantly taller from layout regressions.
- [ ] No regressions:
  - [ ] Family filter still works.
  - [ ] Import-time assignment still works.
  - [ ] Source reassignment still works.
  - [ ] Duplicate / merge behavior is unchanged.
  - [ ] Venue / map behavior is unchanged.
  - [ ] Entitlement behavior is unchanged.

---

### Stage 3.3C-4C UAT (single-week calendar view)

Use this after Stage `3.3C-4B` is stable. Keep scope on the new `Week` calendar mode and on preserving existing month/agenda behavior.

- [ ] Mode switching:
  - [ ] Default planner behavior is unchanged before selecting `Week`.
  - [ ] `Week` mode is available in the calendar controls.
  - [ ] Switching from `Month` → `Week` works without a reload.
  - [ ] Switching back to `Month` and `Agenda` still works.
- [ ] Week rendering:
  - [ ] `Week` shows a true single-week calendar, not a month slice.
  - [ ] Previous / next week navigation works.
  - [ ] The visible label reflects the active week range.
  - [ ] Event detail open/close still works from week view.
- [ ] Filters and ownership:
  - [ ] `All schedules` works in week view.
  - [ ] Child filter works in week view.
  - [ ] Child/team filter works in week view.
  - [ ] Imported events still reflect source-derived assignment only.
  - [ ] Child colors remain visible and correct in week view.
- [ ] Signal separation:
  - [ ] Source labels remain visible/readable in week view.
  - [ ] Conflict indicators remain visible/readable in week view.
  - [ ] Child ownership color is not confused with source identity or conflicts.
- [ ] Timezone:
  - [ ] Changing timezone updates week view correctly.
  - [ ] Switching modes does not reset or corrupt the active timezone.
- [ ] Mobile safety (`375px` if possible):
  - [ ] No horizontal page overflow is introduced.
  - [ ] If the week grid scrolls horizontally, overflow stays contained inside the calendar frame only.
  - [ ] Week controls remain reachable and readable.
  - [ ] Event text remains usable enough to open details.
- [ ] No regressions:
  - [ ] Import-time assignment still works.
  - [ ] Source reassignment still works.
  - [ ] Duplicate / merge behavior is unchanged.
  - [ ] Venue / map behavior is unchanged.
  - [ ] Entitlement behavior is unchanged.

---

### Stage 3.3C-4D UAT (week-view time-window polish)

Use this after Stage `3.3C-4C` is stable. Keep scope on the week view’s default visible time window, internal scrolling, and hour-density polish.

- [ ] Default visible time:
  - [ ] Entering `Week` mode opens around `8:00 AM`, not midnight.
  - [ ] Morning events near `8:00 AM` are visible without manual scrolling.
  - [ ] Earlier times are still reachable if the user scrolls upward.
- [ ] Internal week scrolling:
  - [ ] Scrolling downward inside week view reveals later hours.
  - [ ] Scroll is contained to the calendar frame rather than the page.
  - [ ] Week view still reaches evening events reliably.
  - [ ] Event detail open/close still works after scrolling.
- [ ] Hour-density/readability:
  - [ ] More of the daytime schedule is visible than before.
  - [ ] Hour rows are smaller, but event labels remain readable/tappable.
  - [ ] Overlapping events remain understandable.
- [ ] Mobile safety (`375px` if possible):
  - [ ] No horizontal page overflow is introduced.
  - [ ] Vertical scrolling remains usable on touch devices.
  - [ ] The calendar frame remains the only intended scroll region for later hours.
- [ ] No regressions:
  - [ ] Family filters still work in week view.
  - [ ] Child colors still render correctly in week view.
  - [ ] Source labels remain visible/readable.
  - [ ] Conflict indicators remain visible/readable.
  - [ ] Timezone changes still affect week view correctly.

---

### Stage 3.3C-5 UAT (conservative venue matching + venue/map click paths)

Use this after Stage `3.3C-4D` is stable. Keep scope on conservative imported-event venue matching, new-tab venue navigation, unmatched-address map fallback, and month-view click affordance.

- [ ] Month-view click affordance:
  - [ ] Month-view calendar event chips show pointer affordance on hover.
  - [ ] Clicking a month-view event still opens the event detail modal.
- [ ] Conservative auto-matching:
  - [ ] Imported events with exact/strongly normalized address matches link to the correct TI venue.
  - [ ] Name-only matches only auto-link when city/state context uniquely supports the venue.
  - [ ] Trailing sub-venue markers such as `#6`, `Field 3`, or `Court 1` do not block a unique TI venue match when the base venue/address clearly resolves.
  - [ ] If multiple similarly plausible candidates exist, no auto-link occurs.
  - [ ] No external geocoding or third-party matching flow appears in the product.
- [ ] Refresh preservation:
  - [ ] Any event with an existing non-null `venue_id` keeps that venue on refresh.
  - [ ] Existing linked venues are not silently replaced during refresh.
- [ ] Linked venue click paths:
  - [ ] Linked venue name opens the TI venue page in a new tab.
  - [ ] Linked venue new-tab links use safe browser behavior and do not hijack the event-card click action.
  - [ ] A separate `Map` / `Directions` action remains available for matched venues.
- [ ] Linked venue display cleanup:
  - [ ] When a TI venue is linked, the main planner card shows `Linked venue` and does not also repeat `Source location`.
  - [ ] Raw source location remains available in the edit surface for verification/manual correction.
- [ ] Unmatched source-location fallback:
  - [ ] A meaningful source address/location opens maps when clicked.
  - [ ] Ambiguous labels such as `Field 1`, `Gym B`, or `Court 3` do not become map links.
  - [ ] If both a field label and a real location are present, both remain visible.
- [ ] Manual venue controls:
  - [ ] Existing `Find venue`, `Change venue`, and clear/unset venue flows still work on auto-matched events.
  - [ ] Manual venue editing remains available after refresh.
- [ ] Signal preservation:
  - [ ] Existing Stage `3.1` linked-venue/source-location display hierarchy remains intact.
  - [ ] Source identity, child colors, and conflict indicators remain readable and distinct.
  - [ ] Child-prefixed imported source labels such as `Casey ...` use the same upper-right ownership badge placement/pattern as `Avery ...` rather than dropping into the inline chip row.
  - [ ] When ICS location text includes a trailing field marker (`#6`, `Field 3`, `Court 1`), the planner surfaces it as a top-level field label near the event time instead of leaving it buried in raw location text.
- [ ] Mobile safety (`375px` if possible):
  - [ ] Venue links and source-location fallback links remain tappable.
  - [ ] Directions/map actions remain reachable.
  - [ ] No accidental tap collisions are introduced inside planner cards or the event detail modal.

---

### Stage 3.3C-6 UAT (compact Season date-range filter)

Use this after Stage `3.3C-5` is stable. Keep scope on the compact `Dates` control, its Season-range behavior, quick actions, and consistency between list and calendar filtering.

- [ ] Control visibility:
  - [ ] All three planner views show a compact `Dates` control near the family filter row.
  - [ ] Opening `Dates` from `Upcoming` or `This Weekend` is allowed and does not feel hidden behind the `Season` lens.
- [ ] Date range entry:
  - [ ] Opening `Dates` reveals labeled `Start date` and `End date` fields.
  - [ ] Opening `Dates` outside `Season` explains that applying a custom range switches the planner to `Season`.
  - [ ] Setting only `Start date` filters to events on/after that date.
  - [ ] Setting only `End date` filters to events on/before that date.
  - [ ] Setting both dates filters to the inclusive bounded range.
  - [ ] Invalid ranges (start after end) are blocked or clearly corrected.
  - [ ] Applying any custom range switches the planner into `Season`.
- [ ] Quick actions:
  - [ ] `This weekend` narrows `Season` to the current weekend date window.
  - [ ] `Next 30 days` narrows `Season` to the next 30-day window.
  - [ ] `Clear` removes any custom date override.
  - [ ] `This season` returns to the normal `seasonRange` preset behavior.
- [ ] Consistency:
  - [ ] Child/team family filtering still works with a custom date range.
  - [ ] List view and calendar view show the same in-range events.
  - [ ] Empty-state copy is understandable when no Season events match the selected date range.
  - [ ] In month view, the selected-day summary card centers its text cleanly and does not append raw `Source location` text into that compact surface.
- [ ] Mobile safety (`375px` if possible):
  - [ ] The filter row remains usable without horizontal page overflow.
  - [ ] The date popover stays readable/tappable on narrow screens.
- [ ] No regressions:
  - [ ] `seasonRange` and `seasonFilter` still work when no custom date range is active.
  - [ ] Upcoming / This Weekend behavior remains unchanged.
  - [ ] Assignment, venue, duplicate, and timezone behavior remain unchanged.

---

### Stage 3.3C-7 UAT (parent-friendly ICS normalization + TeamSnap One cleanup)

Use this after Stage `3.3C-6` is stable. Keep scope on noisy ICS cleanup, structured TeamSnap One note extraction, safer venue matching, and cleaner parent-facing imported-event cards.

- [ ] TeamSnap One description cleanup:
  - [ ] TeamSnap One-style imported descriptions no longer render as one giant raw blob in the main planner card.
  - [ ] Raw `Location:` text does not remain duplicated in notes when venue/source location already displays elsewhere.
  - [ ] Raw `Duration:` text is not shown redundantly when start/end time already covers it.
  - [ ] Raw long TeamSnap deep links do not appear in the collapsed planner card.
- [ ] Useful notes preservation:
  - [ ] `Arrival:` information is preserved as a concise parent-facing note such as `Arrive 40 minutes early`.
  - [ ] `Uniform:` information is preserved as a concise parent-facing note such as `Uniform: Black advanced kits`.
  - [ ] If both `Arrival` and `Uniform` exist, both remain visible without reintroducing the raw machine-generated blob.
- [ ] Location + field extraction:
  - [ ] Trailing field markers such as `#3`, `Field 3`, or `Court 1` are extracted into `field_label`.
  - [ ] Extracted field labels appear inline near the event time row.
  - [ ] Imported location cleanup still leaves the correct base venue/location available for directions and venue matching.
- [ ] Conservative venue matching safety:
  - [ ] Cleaned TeamSnap/ICS location text still links to the correct TI venue when the venue uniquely resolves.
  - [ ] Weak one-token address candidates do not cause unrelated events to auto-link to the wrong TI venue.
  - [ ] Existing non-null `venue_id` values are not overwritten during refresh/import.
- [ ] Parent-facing event card cleanup:
  - [ ] If a linked venue exists, the main card shows `Linked venue` and does not also show redundant raw source location.
  - [ ] If no linked venue exists, the card still shows a usable source location and `Directions`.
  - [ ] Notes remain readable on mobile and do not overflow with long unbroken import text.
- [ ] Manual controls and debugging:
  - [ ] Existing `Find venue` / `Change venue` flows still work after TeamSnap note cleanup.
  - [ ] Edit/detail surfaces still retain enough source information to understand what was imported and why.

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

#### Stage 2.8 Fixture note — Unverified email account (required)

The “unverified email → Connect calendar shows verify-email prompt” item cannot be tested unless at least one UAT account has `email_confirmed_at = NULL` in Supabase Auth.

Preferred approach (stable):
- Create and keep a dedicated account permanently unverified (example: `uat+unverified@tournamentinsights.com`) and record its credentials above.

Alternative approach (temporary / for one-off verification):
- In Supabase dashboard (SQL editor), set an existing UAT user to unverified:
  - `UPDATE auth.users SET email_confirmed_at = NULL WHERE email = 'uat+planner-b@tournamentinsights.com';`
  - Revert by setting it back to a timestamp after testing.

If no unverified fixture exists, Stage 2.8 sign-off must treat this as an **open item**.

### Stage 2.10 UAT (Venue / Location Data Capture)

#### 1) Source location capture per platform

- GameChanger: address coverage mixed in this run
  - Primary schedule: 7/21 events have address data
  - Fixture schedule: 14/14 events have address data
  - Venue name can be embedded in text; fields may be mixed across title/notes
- TeamSnap: address coverage is complete (100%) across tested events
  - Clean address field rendering observed
- SportsEngine / MySE: 0% address in UAT fixture payload (insufficient data for validation)
- Team Connect / Team App: pending UAT capture under Stage 2.10 scope

#### 2) Refresh and location-update verification

- Refresh stability: PASS
  - 3 refreshes confirmed; source address text was preserved where present.
- Source-side venue edit → refresh propagation: **PENDING**
  - Not yet observed end-to-end with a real venue edit from feed platform.

#### 3) Linked venue behavior

- Linked venue persistence: PASS
  - Venue links survive refresh and remain visible in UI on Spokane Polo Fields scenario.
- Source `address_text` remains preserved in DB after linking a venue.
- Source location visibility in card + linked venue is now expected to render together when they differ.
- Clear venue action: covered in Stage 2.10B UAT below.

#### 4) Privacy and API surface checks

- `/api/planner/sources` checks: `hasRawUrl: false`, `hasSourceEventUid: false`
- UI checks: no raw IDs/UUIDs/source URLs/user-visible token strings in list/calendar/detail.

#### 5) Canonical linking policy

- Canonical rule: source location is retained as feed data, while linked venue is the planner display priority.
- Refresh must never overwrite a user-linked venue assignment.

#### Stage 2.10 run artifact and notes

- Date: 2026-06-02
- Outcome: **PASS** for hydrated venue rendering checks and non-destructive linked-venue persistence
- Active feeds tested:
  - GameChanger — TI Owls 12U (2 feeds: primary + fixture)
  - TeamSnap — TI Strikers & Wolves (combined user feed)
  - SportsEngine / MySE — TI Red Robbins (fixture scope only; disconnected after test)
- Uncaptured in 2.10 scope: Team Connect / Team App
- No code changes were made in this stage; docs and prompt updates only.
- Next: Stage 2.10B venue SEO hardening (venue sitemap coverage, venue JSON-LD, canonical venue redirects, static sitemap additions; no auto-matching added).

#### Stage 2.10B venue SEO UAT

Run this after Stage 2.10B code is deployed locally or in preview.

- [ ] Canonical venue slug loads normally:
  - [ ] Open one canonical venue URL at `/venues/<seo-slug>`
  - [ ] Confirm page loads with no redirect loop
- [ ] UUID / legacy venue variants permanently normalize:
  - [ ] Open the same venue by `/venues/<uuid>` if available
  - [ ] Open a known legacy address-style venue URL if available
  - [ ] Confirm final browser URL is the canonical slug URL
- [ ] Venue sitemap coverage:
  - [ ] `GET /sitemap.xml` includes one or more `/sitemaps/venues-N.xml` entries
  - [ ] `GET /sitemaps/venues-1.xml` returns only slug-based venue detail URLs
  - [ ] Confirm venue map pages and `/venues/reviews` are absent
- [ ] Venue structured data:
  - [ ] Open a canonical venue page and inspect JSON-LD
  - [ ] Confirm `LocalBusiness` is present
  - [ ] Confirm schema `url` matches the canonical slug URL
  - [ ] Confirm address fields render when venue address data exists
- [ ] Static sitemap additions:
  - [ ] Confirm `/book-travel`, `/heatmap`, `/pricing`, and `/youth-sports-tournaments/june-2026` appear in the static sitemap
  - [ ] Confirm `/weekend-planner`, `/account`, `/admin`, and `/venues/reviews` do not appear

#### Stage 2.10B assisted venue-linking UAT

Run this on `/weekend-planner` with an event that has source location text but no linked TI venue.

- [ ] Click **Find venue** and confirm the query is prefilled from source location / city-state when available.
- [ ] Edit the query and confirm venue search can match by name, address, city, or state.
- [ ] Search for a known exact venue name (current regression example: `Spokane Polo Fields`) and confirm that venue appears in results.
- [ ] Enter a true no-match query and confirm the UI shows `No matching TI venues found. Try a different search term.`
- [ ] Confirm venue result rows show:
  - [ ] venue name
  - [ ] city/state
  - [ ] address when available
- [ ] Select a venue and save the event.
- [ ] Confirm the event shows:
  - [ ] `Linked venue: ...`
  - [ ] `Source location: ...` when source location exists and differs
- [ ] Reload the page and confirm the linked venue persists.
- [ ] Refresh the connected calendar and confirm the linked venue still persists.
- [ ] Click **Clear** in the venue selector and confirm only linked venue context is removed.
- [ ] Confirm no raw UUIDs, feed URLs, or `source_event_uid` are shown in the normal venue-linking UI.

#### Post-2.10B public SEO cleanup UAT

Run this after the public SEO cleanup pass is deployed locally or in preview.

Copy/paste prompt for Claude Desktop / browser UAT:

1) Use Brave on the TI app URL under test.
2) Stay tightly scoped to this SEO cleanup pass only.
3) Important test assumptions:
   - `/weekend-planner` and `/weekend/[slug]` are NOT being SEO-enabled in this pass.
   - Expected posture for those routes is defensive:
     - `noindex,follow`
     - excluded from sitemap
   - Metro sitemap verification must follow the app’s actual canonical route family, not an assumed `/tournaments/metro/*` pattern, unless the implementation under test explicitly changed that.
4) Verify:
   - `/heatmap` metadata + canonical behavior
   - `/tournaments` query-variant canonical / noindex behavior
   - tournament detail breadcrumb JSON-LD + clean hub links
   - sitemap cleanup (`/pricing` removed, metro coverage correct for the implemented route family, no noindexed routes included)
   - `/weekend-planner` and `/weekend/[slug]` noindex behavior
5) Report PASS / FAIL for each section with exact URL, expected behavior, and actual behavior.

Checklist:

- [ ] Heatmap SEO:
  - [ ] Open `/heatmap` and confirm the page title is correct and does not double-append the site name
  - [ ] Confirm the page has a canonical URL of `/heatmap`
  - [ ] Confirm a compact text-link section is visible below the map with crawlable links to:
    - [ ] `/tournaments`
    - [ ] `/venues`
    - [ ] sport hubs such as `/tournaments/soccer`
  - [ ] Open `/heatmap?sport=soccer`
  - [ ] Confirm the query variant does not behave like a separate SEO page and still resolves canonical to `/heatmap`

- [ ] Tournament directory canonical / noindex behavior:
  - [ ] Open `/tournaments`
  - [ ] Confirm canonical URL is `/tournaments`
  - [ ] Confirm base `/tournaments` remains indexable
  - [ ] Open one filtered variant such as `/tournaments?state=CA` or `/tournaments?sports=soccer`
  - [ ] Confirm the filtered variant still canonicalizes to `/tournaments`
  - [ ] Confirm the filtered variant is `noindex,follow`

- [ ] Tournament detail breadcrumbs and clean hub links:
  - [ ] Open one tournament detail page at `/tournaments/<slug>`
  - [ ] Inspect JSON-LD and confirm a `BreadcrumbList` is present
  - [ ] Confirm breadcrumb path includes:
    - [ ] Home
    - [ ] Tournaments
    - [ ] sport hub when supported
    - [ ] sport/state hub when supported
    - [ ] tournament detail page
  - [ ] Confirm visible crawlable links are present for:
    - [ ] sport hub
    - [ ] sport/state hub
    - [ ] venue detail pages when venues exist
  - [ ] Accept the app’s real clean hub URL format if it is valid and indexable
  - [ ] Do not fail this section merely because the route pattern differs from an older assumption

- [ ] Sitemap cleanup:
  - [ ] Open `/sitemap.xml`
  - [ ] Confirm sitemap coverage still includes the expected child sitemaps
  - [ ] Open `/sitemaps/static.xml`
  - [ ] Confirm `/pricing` does not appear if it still redirects to `/#pricing`
  - [ ] Confirm `/weekend-planner`, `/weekend/<slug>`, `/account`, `/admin`, and `/venues/reviews` do not appear
  - [ ] Confirm no clearly noindexed route was added to sitemap coverage
  - [ ] For metro coverage:
    - [ ] verify the actual implemented canonical metro route pattern present in sitemap output
    - [ ] do not assume `/tournaments/metro/dc-metro` unless that exact route family is what the app now uses
    - [ ] current canonical example for DC Metro should be Virginia-anchored (for example `/soccer/virginia/dc-metro`) when the market is indexable

- [ ] Weekend utility route indexation:
  - [ ] Open `/weekend-planner`
  - [ ] Confirm the page is `noindex,follow`
  - [ ] Confirm the page still functions normally
  - [ ] Only test `/weekend/<slug>` if you have a real valid shared-plan slug from the app under test
  - [ ] If no valid slug is available, report `UNVERIFIED — no valid fixture/shared slug available`
  - [ ] Do not mark `/weekend/<slug>` FAIL solely because a guessed slug 404s

Latest production result (2026-06-03):
- PASS:
  - `/heatmap` title + canonical behavior
  - `/tournaments` base vs filtered canonical/noindex behavior
  - tournament detail `BreadcrumbList` + clean hub links
  - sitemap cleanup (`/pricing` absent, no noindexed utility routes included)
  - `/weekend-planner` defensive `noindex,follow`
  - Virginia-anchored `dc-metro` live in canonical metro sitemap/page output
- UNVERIFIED:
  - `/weekend/[slug]` because no valid shared-plan fixture slug was available during production verification
  - [ ] Confirm these routes still function normally and were not converted into SEO landing pages

---

### Stage 2.9B UAT (real ICS platform feeds — Sports Family benchmark)

Use this only once real platform team schedules and subscription links exist.

Recommended sequence:
- Run Stage 2.9B-0 first so every imported feed has a clear label before full platform compatibility testing.

Docs:
- Sports Family checklist + production-safe framework: `docs/weekend-planner-uat.md`
- Platform compatibility matrix (fill in): `docs/qa/ti-planner-ics-uat.md`

Account requirement:
- If connecting more than 1 calendar feed (example: 12 schedules), use a **verified `weekend_pro`** UAT account.
  - `insider` is limited to 1 connected calendar feed (server-enforced).

### Stage 2.9B-0 UAT (feed labels / kid-team-sport prep)

Run this before broader Stage 2.9B platform imports so each calendar source is identifiable at a glance.

Goal: make imported events understandable **before** importing many Sports Family feeds by labeling each connected calendar.

Checklist:
- [x] Label editing:
  - [x] Open `/weekend-planner` → Connected calendars → **Manage calendars**
  - [x] Click **Edit label** on a connected calendar
  - [x] Enter a one-line label (example: `Casey Sports · Volleyball · TI Owls 15U · Team Connect`)
  - [x] Save, refresh the page, confirm the label persists
- [x] Fallback:
  - [x] Clear the label and confirm UI shows `Connected calendar` for that source
- [x] List display:
  - [x] Imported events show the source label (or fallback) on the event card
  - [x] Manual events do not inherit the calendar source label (manual type remains visible)
  - [x] Event title remains visible; conflicts/duplicates still render
  - [x] Labels remain single-line only (no line-break based rendering)
- [x] Calendar detail:
  - [ ] Season → Calendar view event detail shows the source label (or fallback) **(Insider account cannot access calendar view)**
  - [x] Keep to existing schema (single `planner_event_sources.source_name` field only; no schema changes)
- [x] Privacy:
  - [x] No raw source IDs, feed URLs, UUIDs, or `source_event_uid` appear in normal UI
- [x] Entitlements:
  - [x] Insider 1-feed limit still enforced
  - [ ] Weekend Pro can connect multiple feeds **(not yet validated in this pass; requires verified weekend_pro)**

Latest 2.9B-0 UAT run result (2026-06-02): PASS with two low-sev gaps to track:
- Save button has no loading/disabled state while persisting label edits.
- Source color marker visibility on cards/rows not verified in this pass (status unclear from current implementation and may be deferred).

### Stage 2.9A UAT (docs-only)

- [x] Prompt prepared: `docs/prompts/ti-planner-stage-2.9a-ics-source-identity-audit-sports-family-uat-prep.md`.
- [x] Documentation handoff completed in `docs/weekend-planner-current-state.md`, `docs/weekend-planner-uat.md`, and `docs/qa/ti-planner-ics-uat.md`.
- [x] No runtime code changes in this stage.
- [ ] 2.9B real-platform UAT remains open for external feed coverage.

### Stage 2.9B-1A UAT (Team Connect feed update log)

Active feed: Team Connect / Team App — `TI Owls 15U` (label: `SC-Casey`).

Docs:
- `docs/qa/ti-planner-ics-uat.md` → “Stage 2.9B-1A — Single Team Connect Feed Baseline UAT”

Validate:
- [x] Full season imported (events visible in Season).
- [x] Refresh schedule 3x; confirm no “duplicate storm”.
- [x] Update/move scenario in source feed:
  - [x] Refresh and confirm existing event updates in place.
  - [x] Confirm whether a duplicate is created (No).
  - [x] Confirm location update reflects.
- [ ] Pending: add a local overlay (note or venue link), refresh, confirm overlay preserved.
- [ ] Pending: cancel/delete a source event, refresh, document behavior.

### Stage 2.9B-1B UAT (Team Connect update/overlay/cancel)

Active feed: Team Connect / Team App — `TI Owls 15U` (label: `SC-Casey`).

Docs:
- `docs/qa/ti-planner-ics-uat.md` → “Stage 2.9B-1B — Team Connect Lifecycle Validation”

Validate:
- [x] Update/move behavior remains PASS with no duplicate for Practice A scenario.
- [x] Overlay persistence check: local note + linked venue survive refresh (PASS, verified in 2.9B-1B run).
- [x] Confirmed: 2.10A venue label rendering survives refresh when venue linked (`F-2.10-A` from 2026-06-02).
- [ ] Pending: cancel/delete Team Event C equivalent in source, refresh, document behavior.
- [ ] Pending: confirm no source-linked/ICS event hard-deletes during cancel/delete/refresh.
- [ ] Pending: record refresh-delay behavior (no claim of real-time sync).
- [x] Source label persistence: fixed in import path by preserving existing `planner_event_sources.source_name` when import request label is empty.

Latest 2.9B-1B artifact (2026-06-02):
- Update/move: PASS (in-place), no duplicates, calendar/list remained consistent.
- Duplicate behavior on update: PASS (14 → 14; 0 imported).
- Overlay/venue override persistence: PASS.
- Overlay check details: Practice A preserved overlay note + linked Spokane Polo Fields venue through refresh.
- Cancel/delete/hard-delete: still PENDING.

### Stage 2.9B-2 UAT (GameChanger single-feed baseline)

Status: partial PASS from first feed run (TI Owls 12U); source-name fallback + cancel/delete remain open items for 2.9C.

Active feed targets:
- TI Owls 12U
- TI Owls 15U
- TI Robins 12U
- TI Robins 14U

Docs:
- `docs/qa/ti-planner-ics-uat.md` → “Stage 2.9B-2 — GameChanger Single-Feed Baseline UAT”
- New prompt (repo): `docs/prompts/ti-planner-stage-2.9b-2-gamechanger-single-feed-uat.md`

Validate:
- [x] Baseline import (at least one full season window)
- [x] Repeated refresh behavior without duplicate storms
- [x] Update/move behavior in source feed with in-place update (no duplicate)
- [ ] Cancel/delete behavior and no unexpected hard-delete
- [ ] Source label + color stability
- [x] Overlay + venue link persistence after refresh
- [x] Loaded disclosure honesty with partial ranges
- [x] No raw source identifiers in list/calendar/detail UI

Latest Stage 2.9B-2 run (2026-06-02, `weekendpro_test@example.com`, TI Owls 12U, 20:17:41Z):
- PASS: baseline import (23 events, 0 errors), refresh dedupe (`imported=0`, `changed=23`), overlay/venue persistence, loaded disclosure honesty, and no raw identifiers in list/calendar/detail.
- CARRY-FORWARD: source_name fallback is currently generic `Connected calendar`; cancel/delete behavior not covered due one-feed-only source checks.

### Stage 2.9B-4 UAT (SportsEngine / MySE baseline)

- Status: partial PASS on TI Red Robbins.
- Result summary:
  - Baseline import PASS (`Imported 6 · Updated 0 · Skipped 0`).
  - Repeated refresh PASS (3 attempts, `+0 new · 6 updated · 6 changes`, no duplicate storm).
  - Refresh summary signal appears as `Schedule refreshed · +0 new · 6 updated · 6 changes`.
  - Source/team labels (`SportsEngine — TI Red Robbins`, `TI Red Robbins`) are stable across reloads/refreshes.
  - Update/move follow-up PASS (`updated=5`, `changed=5`, `imported=0`, `skipped=0` on manual refresh).
  - Cancel/delete follow-up is PARTIAL: Team Event C rows remained present after cancellation/removal action (one row changed, one unchanged); no hard-delete observed, but deletion policy still not fully validated.
  - F4 (`/account/logout`) is PASS in local follow-up (`307` redirect to `/logout`).
  - Overlay/venue handling, conflicts, and raw-ID privacy remain PASS; F7 remains fixed for SE events.
  - No location payload on several fixture rows; this is fixture data quality, not a crash.
- Open to close in 2.9C follow-up:
  - Confirm hard-delete policy / retention for cancellation/removal vs source removal on one additional platform.
  - Missing-source behavior (source disabled/removal) was executed once: stale events remained and `last_synced_at` did not advance while source was disabled.

### Stage 2.9C UAT (Source identity hardening follow-ups)

- Purpose: close remaining 2.9B open items before broader platform expansion.
- Prompt: `docs/prompts/ti-planner-stage-2.9c-source-identity-hardening-followups.md`
- SportsEngine follow-up prompt: `docs/prompts/ti-planner-stage-2.9c-4-sportsengine-followups.md`
- Source closeout prompt: `docs/prompts/ti-planner-stage-2.9c-closeout-open-items-v1.0.md`
- Focused F3 fix prompt: `docs/prompts/ti-planner-stage-2.9c-f3-limit-blocker-fix-v1.0.md`
- Recommended preconditions:
  - 2.9B-2 and 2.9B-3 baseline/import behaviors captured.
  - Weekend Pro fixture account available for multi-source scenarios.

Validate:
- [ ] F3 limit gate behavior: Insider already-at-limit must surface upgrade prompt and not open import modal.
- [ ] F3 API enforcement: over-limit bypass paths must return `calendar_feed_limit_reached` (`403`) for insider attempts.
- [ ] Source color stability across runs (GC/TeamSnap + additional platforms when available).
- [x] Cancel/delete (and missing-in-feed) behavior is documented as retained events on source disable.
- [ ] Overlay + linked venue persistence after cancel/delete and repeated refresh across at least one additional platform.
- [ ] Loaded disclosure + privacy guardrails remain intact across those additional runs.
- [ ] Validate and document one additional source family cancel/delete behavior where SportsEngine retention was already observed.

### Stage 2.9C-1 UAT (connected calendar card action-row polish)

- Prompt: `docs/prompts/ti-planner-stage-2.9c-1-connected-calendar-card-actions-polish-v1.3.md`
- [x] Connected source card renders a single wrapped action row with:
  - `Edit label`
  - `Refresh schedule`
  - `Disconnect calendar`
- [x] Row actions are mutually safe when source edit/refresh/disconnect is in progress.
- [x] Disconnect confirmation explains that imported events remain.
- [x] Cancel/edit/delete behavior remains non-destructive.
- [x] No raw source identifiers appear in connected-calendar cards.
- [x] `npm run lint --workspace ti-web` and `npm run build --workspace ti-web` pass after merge.

Latest Stage 2.9C-1 UAT run (2026-06-02): **Complete Sign-Off** ✅
- Connected card action row (Edit label / Refresh schedule / Disconnect calendar) verified.
- Desktop one-line row verified at ~1372px; mobile wrap verified at 375px.
- Disconnect confirms non-destructive import retention and preserves source-linked rows after removal.
- `/api/planner/sources` response inspection remains free of raw source URL/source_event_uid data.

Suggested evidence capture:
- Note exact wording shown in disconnect confirmation.
- Verify disconnect succeeds and existing imported rows remain visible.
- Confirm action-row remains on one line when wide and wraps on mobile.

### Stage 2.9C-0 UAT (Source-linked event removal policy)

- [x] Canonical non-destructive policy documented for:
  - missing-from-feed
  - `STATUS:CANCELLED`
  - source disconnect
  - duplicate merge suppression
  - explicit user delete only for hard-delete
- [x] Evidence recorded that source-linked rows were retained on SportsEngine cancel/delete and temporary source-disable scenarios (no hard-delete observed).
- [x] API-driven disconnect implemented and validated as non-destructive (`DELETE /api/planner/sources/[id]` removes source only; existing events remain in query results immediately after disconnect).
- [ ] Close remaining platform-specific hard-delete policy gaps by validating a true cancel/delete workflow on one additional source family.

Latest 2.9C follow-up note (2026-06-03, Insider account): 2.9C-4 SE follow-up confirmed non-destructive retention on source-disable and cancel/delete scenarios, and 2.9C action-row hardening remains signed off. **F3 is now closed**: Insider at-limit shows the correct upgrade gate, direct `/api/planner/sources/import-ics` POST is blocked with HTTP `403` and `calendar_feed_limit_reached`, and disconnect removes the source while preserving previously imported events.

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
  - duplicate is a new manual event (not an imported-calendar source event)
  - original remains unchanged
  - duplicate flow opens edit UI and requires setting a new start time (starts_at field should be blank until set)
- [ ] Duplicate restrictions — confirm Duplicate is not offered for imported-calendar events (manual-only for now)
  - [ ] If an event is linked to a calendar source, it must NOT show a Duplicate button.
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
  - [ ] Confirm the static venue map shows an internal overlay cue near the bottom center:
    - desktop/tablet: `Click map to see hotels, food & coffee nearby →`
    - mobile/narrow: `Tap to plan nearby →`
  - [ ] Click the map preview itself → opens `/tournaments/[slug]/map?venue=...&source=venue_details` in the SAME TAB (not Google/Apple directly).
  - [ ] Confirm **Get directions** remains available as a secondary action and works.
  - [ ] If no tournament context is present, confirm the map preview does NOT show the planning overlay and does NOT act as an external maps link; directions should require the explicit `Get directions` action.

### Tournament Insights — Tournament Directory Filter UAT
- Open `/tournaments` on desktop, then repeat on a narrow/mobile viewport.
- Confirm the filter form still behaves as a semantic GET filter surface:
  - [ ] Search, ZIP, state, radius, month, sport chips, `Include past events`, and `AYSO only` all remain inside the same `/tournaments` GET form
  - [ ] None of those controls auto-submit individually on this page anymore
  - [ ] Results refresh only when the user explicitly clicks **Apply filters** or presses Enter to submit the form
- Apply/Reset row:
  - [ ] Default settled state reads `No changes to apply · Showing N tournament(s)`
  - [ ] Editing any control (search, ZIP, state, radius, month, sports, Include past, AYSO) flips helper text to `Unsaved filter changes`
  - [ ] **Apply filters** becomes enabled only when pending state differs from the currently applied URL params
  - [ ] **Apply filters** uses a real disabled HTML button when no changes exist
  - [ ] Submitting the GET form still performs normal navigation; there is no fake async spinner
  - [ ] **Reset** navigates to base `/tournaments` with no query params
- Tap targets / mobile dead-click coverage:
  - [ ] Sport chips are fully tappable, not just the checkbox glyph
  - [ ] Selected sport chips show a visibly stronger selected state
  - [ ] `Include past events` and `AYSO only` rows are easy to tap on mobile
  - [ ] State summary control remains easy to tap, opens the state menu correctly, and pending state selections appear immediately without submitting
  - [ ] No obvious blank tappable-looking dead zones appear around the filter controls
- Narrow/mobile layout:
  - [ ] Filter chips wrap cleanly instead of forcing horizontal-only chip scrolling
  - [ ] Apply and Reset buttons remain readable and tappable at mobile width
  - [ ] No horizontal page overflow is introduced by the filter row
- Result behavior:
  - [ ] After filter changes, the refreshed results still match the visible active filters
  - [ ] URL/query params still update correctly for shareable filtered views
  - [ ] Opening a tournament card after filtering still works normally

### TI Subscription & Conversion Sprint UAT (v1.4)

Implementation update (2026-06-02):
- `QuickVenueCheck` and TI alert email upgrade links now point to `/premium` (canonical entrypoint) instead of `/pricing`.
- Logged-in Account menu now shows “Upgrade to Weekend Pro” (`/premium`) for non-Pro users.
- Tournament-save interactions now use typed analytics event names in `SaveTournamentButton` and are added to `/api/analytics` allowlist for persistence.

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
- [ ] On sport/state hub pages such as `/baseball/california` or `/soccer/texas`, tapping a state in `Explore by State` triggers the same navigation as desktop click
- [ ] On the same sport/state hub pages, scrolling across the `Explore by State` SVG does not accidentally trigger state navigation
- [ ] On `/tournaments` and one `/{sport}/{state}` page, tapping the main tournament card body navigates to the tournament detail page on mobile
- [ ] If a tournament card shows a venue map strip, tapping that strip performs its intended navigation and is not a dead tap
- [ ] In the tournament card footer/CTA region, tapping `Tournament Details` works and taps in visible footer gaps do not die before hydration
- [ ] After refresh, an early tap on the intended tournament card navigation target still works before hydration completes

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
