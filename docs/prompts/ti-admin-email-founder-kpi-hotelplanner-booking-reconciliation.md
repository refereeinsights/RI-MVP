# TournamentInsights Daily Admin Email — Founder KPI Cleanup + HotelPlanner Booking Reconciliation

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

This task has two related goals:

1. Refactor the TournamentInsights daily admin email into a short founder-level business report.
2. Add reliable HotelPlanner booking reconciliation so the email reports actual bookings, room nights, and economics rather than relying primarily on raw outbound-click volume.

This is an analytics/reporting task.

Do not redesign TournamentInsights, Corralio, HotelPlanner checkout, or the underlying product experiences.

Do not push or deploy unless separately instructed.

---

# 1. What the daily email should answer

The daily TI email should answer five questions quickly:

1. Is TournamentInsights getting meaningful traffic?
2. Is hotel commerce generating bookings and economics?
3. Is tournament-director distribution working?
4. Is the existing TI Weekend Planner generating any meaningful activation?
5. Is anything materially broken?

The email should be readable on mobile in approximately 20 seconds.

Detailed diagnostics should remain available elsewhere when useful, but should not dominate the founder's daily email.

---

# 2. Audit before coding

Before changing anything, inspect:

* current TI daily admin email generator (`apps/ti-web/app/api/cron/admin-dashboard-email/route.ts` — this is the real email, not the simpler version in the referee app)
* current cron/scheduled-job infrastructure
* analytics queries/services used by the email
* `/go/hotels` and other HotelPlanner outbound handoff code
* Hotel Program resolver/configuration
* `ti_outbound_clicks` (columns include `custom_field1`–`custom_field8`, `keyword`, `job_code`, `outbound_attribution_id`)
* immutable HotelPlanner attribution/economic snapshot implementation (`apps/ti-web/lib/hotelPlannerAttribution.ts`)
* current Custom1–8 / JobCode / Keyword behavior — **Custom8 now defaults to `app:tournamentinsights` as of 2026-08-25 commit `a4f367fd`**
* existing HotelPlanner provider/auth code
* `buildHotelPlannerAuthorizationToken` or its current equivalent
* **existing HotelPlanner XLS-based booking sync** (`apps/referee/lib/hotelPlannerBookingSync.ts`) — this already exists and parses HP's XLS commission export format; the audit must determine whether to extend this or switch to the JSON `getReport` API
* **`ti_hotel_bookings` table** — created 2026-08-24; verify its current schema and whether any rows exist (the cron had not yet run as of creation date)
* tournament outreach dashboard/data source
* current TI Weekend Planner activation definitions
* existing timezone/report-window utilities

Do not create duplicate infrastructure when a canonical implementation already exists.

Report material differences between repository reality and this prompt before expanding scope.

---

# 3. Target email structure

Refactor the email toward this structure:

## TI Admin — Daily

### BUSINESS SNAPSHOT

Tournaments: X total / X published / X missing venues

Users:

* Insider: X (+X yesterday)
* Weekend Pro: X (+X yesterday)

### TRAFFIC

Tournament visitors:

* X yesterday
* X trailing 7 complete days
* +/- X% vs prior 7 complete days

Prefer unique visitors/sessions over raw event volume.

### HOTELS

Hotel handoffs:

* X yesterday
* X trailing 7d

Bookings:

* X confirmed yesterday
* X confirmed trailing 7d

Booking source:

* X tracked TI bookings
* X direct/organic/shared HotelPlanner bookings
* X legacy/partial attribution bookings, if this remains a meaningful category

Room nights:

* X yesterday
* X trailing 7d

Handoff → tracked booking conversion:

* X%

Hotel economics:

* expected commission: $X
* actual/paid commission: $X if reliably available
* custom fees: $X if reliably available

Do not display an economics field if the underlying HotelPlanner response/report does not reliably provide it.

Hotel booking data last synced: `{timestamp}` — always render this line when booking metrics appear in the email. Zero bookings and a stale sync are materially different situations. If the last sync is more than 36 hours old, this line should also appear in ALERTS.

### TI WEEKEND PLANNER

CTA:

* X impressions
* X clicks
* X% CTR

Activated:

* X sessions
* X% activation

This section refers ONLY to the existing TournamentInsights Weekend Planner.

Do not mix Corralio metrics into this email.

### TOURNAMENT PARTNERS

Compact summary only:

* outreach sent
* replies
* reply rate
* live pilots/partners if reliably tracked
* partner-generated hotel traffic/bookings if reliably attributable

### ALERTS

Only render when something requires attention.

Examples:

* HotelPlanner reconciliation failed
* HotelPlanner bookings contain unexpected attribution state
* materially abnormal traffic drop
* booking sync stale
* required analytics stopped reporting

Do not create noisy alerts for expected zero-volume metrics.

---

# 4. Remove from the daily email

Remove these sections from the founder daily email:

* Tournament heatmap
* sport-by-sport tournament inventory and "0 yesterday"
* Owl's Eye venues reviewed
* Venue Check submissions
* full Weekend Planner First-Game Activation diagnostic table
* Weekend Planner Legacy / All-Flow Context
* Direct Weekend Planner Entry Funnel
* Tournament Anonymous Planner Funnel
* Direct Planner Session Funnel
* First Planner Actions
* detailed Activation by Source table
* Top Tournament Pages by Planner Clicks
* Team Hotel Blocks unless currently an active founder-level experiment
* Founders Preview purchases
* Campspot raw-click reporting until session attribution is trustworthy (current data shows 100% missing session IDs)
* RI Data Health
* lowest states
* detailed missing-tracking/instrumentation notes
* giant lists of zero-value funnel steps

Do not automatically delete the underlying analytics, admin pages, tables, or diagnostics.

The goal is primarily to remove noise from the daily founder email.

---

# 5. Hotel handoff definition

Do not use raw `/go/hotels` request/event volume as the headline hotel metric.

Define a HotelPlanner handoff as:

`COUNT(DISTINCT outbound_attribution_id)`

for valid HotelPlanner outbound attribution records in the reporting window.

If the existing analytics layer already contains a canonical, tested definition that materially differs, document that before changing it.

Do not silently redefine an existing KPI.

Label this metric simply:

**Hotel handoffs**

Do not call it "unique hotel handoff sessions" unless it genuinely represents session IDs.

---

# 6. HotelPlanner booking reconciliation

TournamentInsights currently hands users to the branded HotelPlanner booking engine.

Do NOT replace this checkout model.

HotelPlanner continues to own:

* hotel shopping
* rates
* room selection
* checkout
* payment
* 3DS
* reservation servicing
* cancellations

TournamentInsights should reconcile resulting bookings through HotelPlanner reporting.

HotelPlanner API v2.3 documents:

`method = getReport`

with:

`reportType = individual`

and supports filtering by:

* purchasedDateStart
* purchasedDateEnd
* check-in/check-out ranges
* cancelled-date ranges
* commission-received ranges
* itinerary number
* sourceCode
* jobCode
* keyword
* customField1–8
* includeCancelled

The repository already contains an XLS-based booking sync (`apps/referee/lib/hotelPlannerBookingSync.ts`) that parses HP's spreadsheet commission export. The audit must determine whether to:

* extend the existing XLS sync, or
* switch to the JSON `getReport` API

These are two different mechanisms with potentially different field names, response shapes, and auth behavior. Do not assume the JSON API field names match the XLS export column names. Document the trade-off and chosen path before implementing.

Use the API only after verifying the actual repository/provider behavior described below.

---

# 7. HotelPlanner authentication

Before implementing `getReport`:

1. Inspect the existing HotelPlanner authentication/provider implementation.
2. Inspect `buildHotelPlannerAuthorizationToken` or its current equivalent.
3. Confirm from existing HotelPlanner documentation and/or a successful request that `getReport` uses:

   * the same HMAC authorization mechanism
   * appropriate account credentials
   * correct Site ID/header behavior
   * correct API endpoint/domain
   * required epoch/customer parameters
4. Reuse the existing auth implementation if appropriate.

Do not create a second HotelPlanner authentication system unnecessarily.

If the reporting endpoint requires materially different credentials or authentication and this cannot be verified:

**STOP and report the blocker.**

Do not guess.

---

# 8. Require a real report response

The available HotelPlanner documentation describes `getReport / individual` request parameters but does not provide a complete authoritative response schema.

Before finalizing the booking mapper/database schema:

* obtain a real JSON response from `getReport / individual`, OR
* locate an existing captured HotelPlanner individual-report API response/sample in the repository/project materials, OR
* determine that the existing XLS-based sync (`apps/referee/lib/hotelPlannerBookingSync.ts`) is the better path and use its XLS column mapping as the authoritative schema reference.

We have evidence from HotelPlanner commission exports (the XLS format) containing fields such as:

* Itinerary
* Confirmation
* Status
* Rooms
* Hotel
* Purchased
* Check-In
* Check-Out
* Nights
* Room Nights
* Source
* Keyword
* Job Code
* Avg Rate
* Total
* Exp Comm USD
* Paid
* Comm. USD
* Custom1–8
* Hotel ID
* Booking ID
* Parent ID
* Cancel Date
* Custom Fee
* Retail Rate
* RevSharePct
* Settled

Do NOT assume the JSON API uses these exact column names or exposes every export field.

Do not invent response fields.

If no real/sample API response can be obtained and the XLS path is not chosen:

* do not finalize a speculative booking mapper;
* implement only safely verifiable scaffolding if useful;
* report exactly what API response/sample is required to continue.

---

# 9. External booking identity and idempotency

The booking reconciliation job must be idempotent.

Do not guess the deduplication key.

Preferred external identity is HotelPlanner `itineraryNumber` IF the real API response (or the existing XLS sync) confirms it uniquely represents the reservation record we need.

If multiple independently updateable booking records can exist under one itinerary:

* identify the documented stable reservation/booking identifier; or
* use a documented composite identifier if necessary.

Do not manufacture an identity from unstable fields such as:

* guest name
* hotel
* dates
* email
* amount

Add an appropriate unique database constraint using provider + verified external booking identity.

Rerunning reconciliation must update the existing reservation/status rather than insert duplicates.

If no stable unique external identifier can be verified:

**STOP and report the issue.**

---

# 10. Attribution model

The authoritative tracked TI booking join remains:

HotelPlanner booking
→ `Custom3 = attr:{outbound_attribution_id}`
→ `ti_outbound_clicks`
→ immutable hotel-program/economic snapshot

Do not determine historical economics from:

* current tournament settings
* current fee configuration
* current Hotel Program
* tournament slug alone
* HotelPlanner URL alone

The immutable outbound snapshot remains the authoritative source for the economic program that existed at handoff time.

---

# 11. Attribution categories

Do NOT classify every HotelPlanner booking lacking Custom3 as a reconciliation failure.

HotelPlanner has confirmed that bookings can occur through:

* organic traffic to `tournamentinsights.hotelplanner.com`
* people sharing HotelPlanner links
* direct/repeat visits after HP session cookies expired

and therefore may legitimately contain:

`Source = tournamentinsights`

while having no Job Code, Keyword, or Custom1–8 values.

These are valid TournamentInsights HotelPlanner bookings.

**Important new context (2026-08-25):** `buildHotelPlannerBookingAttribution` now defaults `custom8` to `app:tournamentinsights` when no explicit value is passed. This means:

* Handoffs originating from TI product surfaces after 2026-08-25 will carry `Custom8 = app:tournamentinsights`
* RI-originated handoffs carry `Custom8 = app:refereeinsights`
* Tournament Hotels page handoffs carry `Custom8 = {tournament name}` (e.g. `Cowboy Cup`)
* Organic/direct/shared traffic that arrives at `tournamentinsights.hotelplanner.com` without going through a TI `/go/hotels` redirect will still carry blank `Custom8`
* Pre-2026-08-25 TI-originated handoffs may carry blank `Custom8` — these are Category B or C, not Category D

Normalize booking attribution into useful categories:

### A. Tracked TI

Valid `Custom3 = attr:{outbound_attribution_id}` successfully joins to a TI outbound attribution record.

### B. Legacy / partial TI attribution

No valid Custom3 join, but other historical TI tracking fields such as Job Code, Keyword, Custom4 (`srcp:`) or other Custom fields provide legitimate older attribution context.

Only keep this category if actual data supports it.

### C. Direct / organic / shared / untracked white-label

`Source = tournamentinsights`

with no specific TI tracking fields.

These are legitimate TI HotelPlanner bookings and economics.

Do not label them "unattributed failures."

Blank Custom8 is consistent with this category but does not prove organic search as the acquisition source. The booking could be direct, repeat, shared link, legacy, or any session that lost tracking before conversion. Do not report this category as "organic bookings" in the email or dashboard — label it "direct / organic / shared" and leave acquisition source ambiguous.

After 2026-08-25, bookings with `Custom8 = app:tournamentinsights` but no Custom3 join are still Category B or C, not Category D — the app-source marker confirms TI routing, but the session may not have converted within the HP cookie window.

### D. Attribution anomaly

Use this only when something genuinely looks wrong, for example:

* Custom3 contains an `attr:` value but no matching TI outbound record exists
* malformed attribution identifier
* provider data violates expected invariants

Only category D belongs in Alerts by default.

---

# 12. Booking status normalization

Do not assume HotelPlanner's complete status vocabulary.

Inspect real report data and explicitly map provider statuses into a small TI-normalized model such as:

* confirmed
* cancelled
* pending
* unknown

The daily headline:

**Bookings**

should count normalized confirmed bookings.

Document provider-status → normalized-status mappings in code and tests.

Cancelled bookings should remain stored so later status changes can be reconciled.

Cancelled bookings should not count toward current confirmed booking/room-night/economic headline metrics unless a specific metric explicitly says otherwise.

---

# 13. Booking fields to persist

Persist only fields confirmed to exist in the real API response (or XLS export, if that path is chosen) and needed for reconciliation/reporting.

Likely requirements include, where actually available:

* provider
* external booking/reservation identity
* itinerary number
* outbound_attribution_id when present
* normalized attribution category
* source code
* booking/purchase date
* check-in
* check-out
* room count
* nights
* room nights
* hotel ID
* hotel name
* provider status
* normalized status
* cancellation date
* expected commission
* actual/paid commission
* custom fee
* currency
* last_synced_at

Do not store unnecessary guest PII merely because HotelPlanner returns it.

Specifically review whether TI actually needs to persist:

* guest name
* guest email
* phone
* confirmation number

Default to NOT storing these unless required for a defined operational need.

This reporting task should minimize customer PII.

Note: `ti_hotel_bookings` was created on 2026-08-24. Verify its current schema against the field list above before adding/altering columns. If the schema is already correct or partially correct, extend rather than replace.

---

# 14. Sync schedule and lookback

Integrate reconciliation into existing TI scheduled-job infrastructure.

Target behavior:

* booking reconciliation runs before the daily TI admin email;
* it may also be callable independently/on-demand if that fits the existing architecture cleanly;
* use a rolling overlapping purchase-date lookback rather than querying only yesterday.

Initial default:

**7 calendar days**

on every routine sync.

Make this configurable.

Include cancelled bookings.

Upsert idempotently.

The overlap intentionally captures:

* delayed HotelPlanner reporting
* late status changes
* cancellations
* other provider lag

Do not automatically perform an unlimited historical backfill every day.

Historical reconciliation/backfill should be a separate explicit operation.

---

# 15. Hotel metrics

Calculate:

### Hotel handoffs

Distinct outbound attribution IDs in the reporting window.

### Total confirmed HotelPlanner bookings

All confirmed bookings associated with the TournamentInsights HotelPlanner source/site, regardless of whether they have a tracked outbound attribution.

### Tracked TI bookings

Confirmed bookings with a valid Custom3 → outbound attribution join.

### Direct / organic / shared bookings

Confirmed bookings belonging to the TournamentInsights HotelPlanner source but lacking specific TI tracking fields.

### Room nights

Confirmed, non-cancelled room nights.

### Tracked handoff → booking conversion

Use:

`tracked confirmed bookings / distinct tracked hotel handoffs`

Do NOT divide total HotelPlanner bookings by TI handoffs because direct/organic/shared bookings did not necessarily originate from an instrumented TI handoff.

Label the metric accordingly.

### Economics

Where reliably available, report:

* expected commission
* paid/actual commission
* custom fee
* total attributable hotel economics

Keep provider economics and custom-fee economics distinguishable internally.

Do not fabricate missing commission fields.

---

# 16. Hotel source breakdown

Do not make a giant source table part of the default daily email.

The underlying reporting should still be capable of breaking tracked TI bookings/handoffs down by useful source/placement such as:

* venue
* referee
* venue_map
* weekend
* tournament
* tournament_hotels
* book_travel
* other current canonical values

Use existing attribution fields such as `srcp:` / placement data where authoritative.

Only surface source detail in the email when it helps explain a meaningful change or active experiment.

Keep detailed source reporting available in drill-down/admin queries.

---

# 17. Fee-site readiness

TournamentInsights is establishing separate HotelPlanner sites for different economic programs.

Current intended architecture includes:

* Standard/no custom fee
* $5 per room-night support program
* $10 per room-night support-plus program

Do not assume the hostname alone is sufficient historical attribution.

Preserve the resolved Hotel Program/economic snapshot at outbound handoff.

As fee-bearing bookings begin appearing, the reporting model should be able to distinguish:

* standard HotelPlanner affiliate economics
* incremental custom fee
* economic owner/beneficiary from the immutable outbound snapshot

**Audit prerequisite:** Before building fee-aware reporting, verify that `hotel_program_type` and related economic-snapshot columns in `ti_outbound_clicks` are actually populated in production data, not just present in the schema. If these columns are empty or sparsely populated in current production rows, report that gap rather than building fee-differentiated metrics against empty data.

Do not change production routing or activate a fee program as part of this email/reporting task.

---

# 18. TI Weekend Planner metric definition

The PLANNING section refers ONLY to the existing TournamentInsights Weekend Planner.

Do not mix Corralio into this report.

Use the existing canonical TI activation definition, currently expected to be:

* `planner_manual_event_created`
  OR
* `planner_calendar_feed_connect_succeeded`

Confirm this against repository analytics code before relying on the prompt.

If a newer authoritative definition exists, document it rather than silently reverting it.

Reduce the email to:

* CTA impressions
* CTA clicks
* CTR
* activated sessions
* activation rate

Do not include the entire diagnostic funnel.

---

# 19. Tournament partner reporting

Before modifying tournament-partner metrics, inspect:

* existing outreach dashboard
* database tables
* existing queries
* current source of sent/reply data

Reuse existing definitions.

Do not build a new tournament-director CRM/tracking system for this email.

Desired compact metrics:

* outreach sent
* replies
* reply rate
* live/pilot tournaments if reliably represented
* partner-generated hotel traffic/bookings if reliably attributable

If "live pilot" or partner-generated bookings are not reliably represented in current data:

* omit them for now;
* report the gap;
* do not invent proxies.

---

# 20. Traffic trend definition

Where the email reports:

**7d vs prior 7d**

use two complete rolling 7-calendar-day windows in the same canonical reporting timezone already used by the TI admin email.

Do not compare a partial current day against a complete historical day.

Example:

Recent:
previous 7 complete calendar days

Comparison:
7 complete calendar days immediately preceding the recent window

Reuse existing timezone/window utilities when available.

---

# 21. Alerts

Alerts should be actionable.

Potential hotel alerts:

* HotelPlanner sync failed
* last successful booking sync is stale (threshold: >36 hours)
* `attr:` Custom3 value cannot join to a TI outbound record
* unexpected provider status appears
* booking response schema changed materially
* fee-bearing booking cannot be reconciled to its immutable economic snapshot

Do NOT alert merely because:

* a legitimate direct/organic/shared booking lacks Custom3
* a booking carries `Custom8 = app:tournamentinsights` but has no Custom3 join — this is expected for organic/late-return sessions
* a metric is zero during a naturally low-volume period
* detailed planner instrumentation is missing but not required for the founder email

---

# 22. Tests

Add tests appropriate to the implementation.

At minimum cover:

### Reconciliation

* same booking synced twice creates one local booking
* later status update updates the existing booking
* confirmed → cancelled transition works
* valid Custom3 joins correctly
* malformed Custom3 is handled safely
* valid `attr:` with missing outbound record becomes an attribution anomaly
* Source=tournamentinsights with no tracking becomes direct/organic/shared, not an error
* booking with `Custom8 = app:tournamentinsights` but no Custom3 join is classified as B or C, not D
* legacy/partial attribution classification if supported
* unknown HotelPlanner status normalizes safely

### Metrics

* distinct outbound IDs are counted once
* tracked booking conversion uses only tracked bookings in numerator
* direct/organic/shared bookings are included in total booking economics but not tracked handoff conversion
* cancelled bookings are excluded from confirmed room-night metrics
* 7d/prior-7d windows use complete calendar days
* economics are not invented when provider fields are absent

### Regression

Confirm existing:

* HotelPlanner outbound attribution
* immutable economic snapshot behavior
* TI analytics
* daily email generation
* tournament outreach reporting

continue to work.

Run existing typecheck, lint, tests, production build, and `git diff --check` as appropriate for the repository.

---

# 23. Implementation discipline

* Reuse existing HotelPlanner auth/provider code.
* Reuse existing attribution infrastructure.
* Reuse existing analytics definitions.
* Do not duplicate Hotel Program logic.
* Do not create a second HotelPlanner authentication system.
* Do not replace the HotelPlanner booking engine or checkout flow.
* Do not store guest PII beyond what is required for a defined operational need.
* Audit before coding; repository reality wins over prompt assumptions.
* If the XLS-based sync in `apps/referee/lib/hotelPlannerBookingSync.ts` already handles the majority of the reconciliation need, extend it rather than building a parallel implementation.
* No push, deploy, migration apply, or cron invocation without separate authorization.
* Run all four production builds (`corp-app`, `referee-app`, `ti-web`, and any Corralio app that shares infrastructure) before any future push.
* Use `git diff --check` before committing.
