# TournamentInsights Hotel Reliability & Conversion — Complete Implementation Task

You are working inside the existing TournamentInsights / RefereeInsights / Corralio monorepo.

This is a narrow TournamentInsights task focused on:

1. Auditing contextual hotel-search reliability.
2. Fixing narrow, proven TI defects where safe.
3. Guaranteeing a useful attributed HotelPlanner fallback.
4. Improving visibility of TI's existing generic sports-travel capability.
5. Selectively simplifying hotel CTA language.
6. Preserving existing SEO, attribution, commercial, privacy, and security behavior.

Do NOT build a new hotel product.
Do NOT create another generic hotel landing page.
Do NOT extend the attribution schema.
Do NOT modify Corralio or RefereeInsights.
Do NOT change HotelPlanner fee, beneficiary, partner, or commercial logic.
Do NOT push or deploy.

Reliability investigation comes before conversion optimization.

# 1. Known repository facts

Preserve these established facts unless the audit proves one is incorrect.

## Generic travel

`/book-travel` already exists and is the canonical generic TI travel landing page.

It already:

- has sports-travel metadata;
- accepts generic city/venue/event-location searches;
- explains that an event does not need to be listed on TI;
- includes hotels and vacation rentals;
- distinguishes 5+ room/team requests.

Improve/reuse `/book-travel`.

Do NOT create:

- `/hotels`
- `/sports-travel/hotels`
- another competing generic route

## Attribution

Existing typed production source values include:

- `book_travel`
- `tournament`
- `tournament_hotels`
- `venue`
- `venue_map`
- `team_hotel_booking`
- `weekend_planner`
- `weekend`

Preserve the existing vocabulary.

Do NOT add new attribution values in this task.

Do NOT add:

- `generic_hotel`
- `tournament_map`
- `team_hotel`
- `partner`
- `corralio`
- `future_corralio`
- any speculative future source

This task must not prepare Corralio attribution.

## Contextual handoff

Tournament hotel flows already preserve useful context through `/go/hotels`, including as applicable:

- tournament
- venue
- dates
- source type
- placement
- Custom attribution fields

Preserve this behavior.

## Existing observability

The hotel search path already has mechanisms including:

- `lodging_search_session`
- recorded fallback reasons
- `TI_LODGING_DEBUG`-gated provider diagnostics

Audit these before adding anything.

Do NOT create a new diagnostics table without separate authorization.

# 2. Execution stages

This task has two distinct stages.

## Stage 1 — Local code audit and implementation

Stage 1 is authorized now.

Stage 1 may include:

- repository inspection
- code changes
- fixture-based tests
- local typecheck/lint/build
- read-only inspection of existing code/config/docs

Stage 1 must make:

- ZERO HotelPlanner provider calls solely for investigation
- ZERO production mutations
- ZERO remote configuration changes
- ZERO live booking attempts

Do not enable production debug flags remotely.

Do not send live HotelPlanner traffic as part of Stage 1.

## Stage 2 — Real-provider UAT

Stage 2 requires explicit user approval.

If real HotelPlanner calls are needed to determine root cause, STOP after Stage 1 and report a proposed UAT plan containing:

- exact TI pages/context to test
- why each case is needed
- dates/search parameters proposed
- maximum number of HotelPlanner calls
- what data will be observed
- confirmation that no booking will be completed
- cleanup plan, if any
- expected diagnostic value

Do not perform Stage 2 until explicitly approved.

# 3. Preflight audit

Before editing, inspect:

- TI homepage
- primary navigation
- `/book-travel`
- tournament pages
- tournament hotel pages
- venue pages
- venue maps
- tournament maps where applicable
- team/group hotel page
- `/go/hotels`
- hotel search route
- HotelPlanner request helpers
- response parsing
- result filtering
- any hotel-result caching if it exists
- empty/error/fallback states
- `lodging_search_session`
- fallback-reason handling
- `TI_LODGING_DEBUG` diagnostics
- attribution/custom-field handling
- hotel analytics
- focused tests

Report internally:

1. Every hotel CTA and wording.
2. Every HotelPlanner handoff path.
3. Every contextual hotel failure/empty state.
4. How `/go/hotels` preserves attribution.
5. Whether any CTA unnecessarily loses known context.
6. What existing observability already distinguishes.
7. Whether a hotel-result cache actually exists.
8. Whether Weekend Pro gates or appears to gate hotel access.
9. Whether current `Book Travel` navigation remains appropriate.

Do not duplicate capabilities already present.

# 4. Reliability classification

Audit the code paths capable of producing the current unavailable/empty states.

Use mutually meaningful classifications.

## LEGITIMATE_ZERO_INVENTORY

A successful, structurally valid upstream response produces zero upstream/parsed usable hotels.

This category must not be used for parsing failures or upstream errors.

## UPSTREAM_REQUEST_FAILURE

Includes:

- timeout
- network failure
- authentication failure
- rate limit
- non-success upstream response
- provider request failure

## INVALID_SEARCH_CONTEXT

TI lacks or sends invalid/incomplete:

- destination
- dates
- coordinates
- venue context
- tournament context
- other required search inputs

## RESPONSE_PARSING_FAILURE

The provider response is structurally unexpected or mapping/parsing throws/fails.

Do not classify a valid zero-result response as parsing failure.

## FILTERING_FAILURE

Parsed hotel count is greater than zero but TI's post-processing/filtering reduces the usable count to zero.

## CACHE_FAILURE

Use only if an actual hotel-result cache exists and contributes to the behavior.

If no such cache exists:

### Mark CACHE_FAILURE investigation NOT APPLICABLE.

Do not add caching in this task.

## UI_STATE_FAILURE

Usable results exist at the application layer but the UI incorrectly renders an unavailable/empty state.

## UNKNOWN

Available Stage 1 evidence is insufficient to classify safely.

Do not force a diagnosis.

# 5. Privacy-safe diagnostics

Audit existing observability before adding anything.

Determine whether current mechanisms can distinguish:

- successful search with results
- successful valid search with zero results
- upstream timeout/failure
- invalid search context
- parsing failure
- filtering to zero
- fallback reason
- provider duration/status class

Use existing `lodging_search_session`, fallback reasons, and gated diagnostics where sufficient.

If a small observability improvement is required, prefer bounded fields such as:

- existing public tournament ID
- existing public venue ID
- search context type
- destination completeness boolean/category
- date-range validity
- upstream status class
- parsed hotel count
- post-filter hotel count
- fallback reason enum
- duration bucket

Do NOT newly log or persist merely for this investigation:

- raw HotelPlanner payloads
- hotel lists
- full provider URLs
- authorization headers
- credentials/tokens
- raw destination strings
- IP addresses
- user agents
- unbounded exception/error bodies
- customer PII
- private commercial configuration

Do not expand persisted PII.

Do not create a new logging/diagnostic table.

# 6. Automated testing boundary

Automated regression tests must make ZERO HotelPlanner calls.

Use bounded, sanitized fixtures representing the actual expected integration shapes.

Cover where applicable:

- valid response with hotels
- structurally valid response with zero hotels
- upstream failure
- unexpected/malformed response
- parsing exception
- parsed-positive/post-filter-zero
- invalid context
- UI fallback
- existing attribution preservation

Do not put real HotelPlanner credentials, URLs, payloads, customer data, or production responses into fixtures.

Real-provider inventory behavior belongs only in approved Stage 2 UAT.

# 7. Narrow defect fixing

If Stage 1 identifies a clear TI defect such as:

- malformed request construction
- invalid date/context construction
- parsing bug
- incorrect filtering
- incorrect fallback logic
- incorrect UI state
- actual cache bug, if caching exists

fix it only if:

- root cause is understood;
- change is narrow;
- fixture-based regression tests can cover it;
- commercial routing remains unchanged;
- attribution remains unchanged.

If provider behavior cannot be proven without real calls, do not guess.

Classify it as requiring Stage 2 UAT and report the proposed bounded test plan.

# 8. Fallback destination rules

There are exactly two conceptual fallback paths.

## A. Valid contextual hotel search

When valid tournament/venue/date context exists, use the existing attributed `/go/hotels` handoff.

Preserve all applicable existing context:

- `tournament_hotels` or other existing correct source type
- tournament
- venue
- dates
- placement
- Custom fields
- existing attribution

Do NOT send a known-context user to a context-free `/book-travel` page.

Preferred CTA:

### Find Hotels Near the Venue

Supporting copy may say:

> Search live availability with our hotel partner.

Use venue, not fields, because TI supports sports including hockey, swimming, basketball, gymnastics, and others.

## B. Insufficient contextual data

When TI does not have enough trusted tournament/venue/date context for the attributed contextual handoff, use:

### `/book-travel`

Prefill only safely available public context using existing supported behavior.

Do not invent or infer sensitive/private context.

Preferred CTA:

### Find Hotels

# 9. Positive failure UX

Do not lead high-intent users with:

> Live hotel results are temporarily unavailable.

when a valid HotelPlanner handoff remains available.

Present the next useful action positively.

For contextual users:

### Find available hotels for your tournament

**Find Hotels Near the Venue →**

For generic/insufficient context:

### Find hotels for your sports trip

**Find Hotels →**

Do not falsely imply TI itself has inventory.

Do not present HotelPlanner as a consolation prize.

# 10. CTA vocabulary

Prefer three clear jobs:

## Generic family/individual travel

### Find Hotels

## Known venue/tournament context

### Find Hotels Near the Venue

## Group/team travel

### Request Team Hotel Options

Do not mechanically replace every existing string if context makes another approved phrase clearer.

Avoid adding new CTA variants unnecessarily.

# 11. Homepage

Add or improve a visible homepage sports-travel module.

Core concept:

### Traveling for sports?

**Find hotels for tournaments, games, and team travel — even if your event isn't listed on TournamentInsights.**

Primary CTA:

### Find Hotels

Destination:

### existing `/book-travel`

Do not create another landing page.

Keep tournament discovery as TI's primary homepage purpose.

Sports travel should become a clear secondary job.

# 12. `/book-travel`

Reuse and selectively improve the existing page.

Preserve:

- existing route
- existing metadata/SEO
- generic location search
- unlisted-event messaging
- hotel capability
- vacation-rental capability
- 5+ room distinction

Improve only where useful:

- headline clarity
- CTA hierarchy
- internal linking
- sports-travel positioning
- distinction between family and group booking

Do not rebuild the page unnecessarily.

# 13. Navigation

Current navigation uses:

### Book Travel

Because `/book-travel` includes hotels and vacation rentals, this label is defensible.

Navigation renaming is REPORT-ONLY in this task.

Do not rename it to Hotels.

Report whether a future A/B or UX test appears justified.

# 14. Tournament and venue pages

Do not broadly redesign these pages.

Where hotel intent is strong, prefer:

Primary:

### Find Hotels Near the Venue

Secondary:

### Request Team Hotel Options

Maps remain planning context.

HotelPlanner remains transaction infrastructure.

Do not require map interaction before hotel booking.

# 15. Team/group booking

Preserve the existing team/group hotel flow.

Maintain the conceptual distinction:

### 1–4 rooms
Find Hotels

### 5+ rooms
Request Team Hotel Options

Do not blur family self-service booking and group/team booking.

# 16. Attribution

Preserve the existing typed production attribution vocabulary.

Do not extend the enum/schema.

Preserve existing values including:

- `book_travel`
- `tournament`
- `tournament_hotels`
- `venue`
- `venue_map`
- `team_hotel_booking`
- `weekend_planner`
- `weekend`

Use the existing appropriate value for each existing flow.

Preserve:

- Custom fields
- tournament context
- venue context
- dates
- placement
- existing partner/commercial routing

Do not expose fee/beneficiary configuration client-side.

# 17. Weekend Pro

Hotels remain accessible without Weekend Pro.

Do not create copy or UX implying Pro is required to:

- find hotels
- search HotelPlanner
- request team hotel options

Pro may enhance planning context, but hotel commerce remains available to free users.

# 18. SEO

Do not create a new generic travel route.

Do not mass-generate pages.

Do not add programmatic hotel SEO architecture.

Use:

- `/book-travel`
- existing tournament pages
- existing venue pages
- existing hotel pages

Improve internal linking and legitimate sports-travel language where useful.

Relevant concepts may include:

- youth sports hotels
- tournament hotels
- sports travel
- team travel

Do not keyword-stuff.

Preserve existing canonical URLs and tournament/venue SEO behavior.

# 19. Scope exclusions

Do NOT:

- build a new hotel engine
- create another generic travel route
- add another hotel provider
- extend attribution enums
- modify HotelPlanner fee logic
- modify beneficiary logic
- change tournament partner economics
- rebuild maps
- add coffee/food/local discovery
- modify Corralio
- modify RefereeInsights
- change auth
- change Supabase configuration
- add new diagnostic tables
- expand persisted PII
- add hotel-result caching
- mass-generate SEO pages
- build a hotel recommendation engine
- perform live HotelPlanner UAT without explicit approval

# 20. Stage 1 verification

Run the smallest appropriate local verification:

1. Focused hotel tests.
2. TI typecheck.
3. TI lint.
4. TI production build.
5. `git diff --check`.

The TI production build is REQUIRED for this task.

Do not push or deploy.

Do not perform real HotelPlanner calls.

# 21. Standing production build gate

This task may use focused TI checks during development.

However, preserve the standing repository rule:

### Before any eventual production push, all four production workspace builds must pass.

Do not push as part of this task.

If shared code changed in a way that warrants broader builds now, run them and report why.

# 22. Final report

Return:

## Stage 1 reliability audit

- paths inspected
- existing observability found
- what `lodging_search_session` currently captures
- fallback reasons currently available
- what `TI_LODGING_DEBUG` currently exposes
- whether hotel-result caching exists
- failure paths identified
- classifications supported by Stage 1 evidence

## Defects

- defects proven
- defects fixed
- regression tests added
- unresolved cases

## Stage 2 UAT request

If live provider testing is still needed, provide:

- exact pages
- exact context
- proposed dates
- maximum provider calls
- information expected
- cleanup plan
- reason UAT is required

Then STOP and wait for approval.

## Conversion changes

Report:

- homepage sports-travel module
- `/book-travel` improvements
- positive fallback changes
- CTA cleanup
- tournament/venue changes

## Fallback verification

Confirm:

- valid context uses attributed `/go/hotels`
- tournament/venue/date/placement/Custom attribution is preserved
- insufficient context uses `/book-travel`
- no known context is unnecessarily discarded

## Attribution

Confirm:

- existing vocabulary preserved
- no attribution enum changes
- no Corralio preparation
- commercial routing unchanged

## Privacy

Confirm:

- no raw provider payload retention added
- no hotel-list retention added
- no raw provider URLs logged
- no auth headers/tokens logged
- no IP/user-agent collection added
- no persisted PII expansion
- no new diagnostics table

## SEO/navigation

Confirm:

- `/book-travel` remains canonical generic travel page
- no competing generic route created
- existing SEO architecture preserved
- `Book Travel` navigation was not renamed
- any future nav recommendation is report-only

## Verification

Report:

- focused tests
- typecheck
- lint
- TI production build
- diff check

## Files changed

List only files belonging to this task.

## Verdict

Choose exactly one:

- **TI HOTEL RELIABILITY & CONVERSION READY**
- **TI HOTEL RELIABILITY & CONVERSION REQUIRES APPROVED PROVIDER UAT**
- **TI HOTEL RELIABILITY & CONVERSION NOT READY**

Keep this task narrow.

Priority order is:

### Reliability → attributed fallback → conversion clarity → SEO refinement.

Do not turn this into a new travel architecture project.

# 23. Authoritative execution clarifications

These clarifications are part of the canonical prompt and override conflicting
or ambiguous wording above.

## Bounded production diagnostic read

Stage 1 is authorized to perform ONE bounded, read-only inspection of existing
`lodging_search_session` production diagnostic records to understand observed
hotel-search outcomes.

This authorization is intentionally narrow:

- Lookback window: maximum 30 days.
- Use a bounded query selecting at most the 500 most recent eligible records
  within that window, then aggregate only that bounded set. Database
  query-planner internals do not violate this limit.
- Read-only schema/catalog inspection needed to identify the existing safe
  diagnostic columns is permitted and does not count as the one record
  inspection. It must not retrieve diagnostic row values.
- Zero INSERT, UPDATE, DELETE, mutating RPC/function invocation, configuration
  change, HotelPlanner/provider call, or live booking attempt.

Select only existing bounded diagnostic fields needed to understand outcomes,
such as:

- outcome/status classification;
- fallback reason;
- upstream/provider status class, if already stored;
- result count and existing parsed/post-filter counts;
- duration or duration bucket;
- existing typed source/entry type;
- safe public tournament or venue IDs;
- created timestamp for windowing and aggregation.

Use the actual schema. Do not add columns merely to satisfy this list.

Do not select, inspect, print, persist, or report:

- raw search query or destination/address text;
- IP address or user agent;
- referrer;
- page URL/path when it may contain user-entered context;
- provider request URL or response/payload;
- hotel lists;
- authorization headers, tokens, or secrets;
- raw error body or unbounded exception detail;
- customer/user PII.

If meaningful analysis requires a prohibited field, stop and report that
limitation instead of widening the query.

Report aggregate findings only: sessions inspected, successful-with-results and
valid-zero-results counts/rates, fallback-reason and upstream-failure
distributions, safe source-type distribution, useful duration distribution, and
bounded context-failure counts. Do not reproduce individual records. Clearly
separate production observations, code inference, fixture results, and future
provider UAT. This read does not authorize a live HotelPlanner request.

## Browser verification without provider traffic

Because this task changes homepage and hotel fallback UI, perform focused
desktop and mobile browser verification with ZERO HotelPlanner/provider calls.

Use deterministic fixture state, existing mocks, request interception, or
another existing offline mechanism. Install interception before navigating to
any contextual page that may automatically search, abort any unexpected
provider-facing request, and assert that zero provider requests escaped.

Verify:

1. Homepage sports-travel module renders.
2. Mobile and desktop hierarchy remain usable.
3. Generic CTA routes to `/book-travel`.
4. Valid contextual fallback resolves to the expected attributed `/go/hotels`
   URL without following it to HotelPlanner.
5. Tournament, venue, dates, source, placement, and Custom attribution remain.
6. Insufficient-context fallback routes to `/book-travel`.
7. Team-hotel CTA remains distinct.
8. Hotel actions are not Pro-gated.
9. No new console errors, broken links, or obvious responsive regressions exist.

Inspect outbound URLs locally; do not complete provider navigation. Report
viewports, scenarios, and results.

## Documentation and local commit

Update the existing TournamentInsights notes/documentation with:

- reliability audit evidence and bounded aggregate findings;
- proven root causes and code changes;
- fallback, `/book-travel`, and attribution behavior;
- tests and browser verification;
- unresolved provider-UAT questions;
- final verdict.

Do not create a competing documentation system.

After authorized verification passes:

1. Review `git diff`.
2. Confirm only task-related files are staged.
3. Run `git diff --check`.
4. Commit locally with a focused message.

Do not push or deploy. Before any eventual production push, all four production
workspace builds must pass.

The final report must include a Production diagnostic evidence section with the
date window, session count, safe categories inspected, aggregate distributions,
production-supported findings, code-only inferences, confirmation that
prohibited/private fields were not inspected, and confirmation that no writes
or HotelPlanner calls occurred.
