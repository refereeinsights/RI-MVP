# TI Team Hotels Phase 1 — SEO, Conversion Clarity, and Measurement

Please implement a focused Phase 1 improvement to TournamentInsights Team Hotels.

This is **not** a new Team Hotels product, page architecture, or programmatic SEO initiative. The existing canonical page:

`/team-hotel-booking`

must remain the primary Team Hotels acquisition and conversion page.

The goal is to make the existing Team Hotels opportunity:

- easier to understand
- easier to find
- easier to submit
- better aligned with search intent
- more trustworthy
- more measurable

Do not create new page classes.

---

## Business context

TournamentInsights has real early Team Hotels demand.

Founder-verified customer evidence currently includes:

- 2 legitimate Team Hotel requests
- 22 rooms requested
- more than 60 requested room nights

These are known real customer requests, not test submissions or duplicates.

Production contains additional provider-accepted `lodging_search_session` rows. Do **not** automatically treat every accepted row as legitimate customer demand.

For business reporting, distinguish:

- provider-accepted requests
- founder/customer-verified legitimate requests
- tests or uncertain rows

Do not rewrite historical analytics or production rows as part of this task. Do not add a CRM or broad request-status system in Phase 1. If no clean mechanism currently identifies test/internal requests, document the smallest future improvement.

---

## Product hypothesis and architecture

A Team Hotel request can represent materially more lodging volume than an individual family booking. The customer is typically a coach, team manager, travel coordinator, club administrator, or tournament organizer.

Their problem is not primarily “Team Travel.” It is closer to:

> I need hotel rooms for the whole team near our tournament.

Keep `/team-hotel-booking` as the single canonical Team Hotels landing page. Existing tournament and venue pages should feed it contextually. Book Travel may continue to support group lodging as an adjacent travel surface.

Do not create:

- sport-specific Team Hotels pages
- city or state Team Hotels pages
- venue Team Hotels pages
- tournament Team Hotels subpages
- programmatic Team Hotels SEO

---

## 1. Rename the primary navigation concept

Where global acquisition-facing navigation currently says `Team Travel`, change the visible label to `Team Hotels` while preserving the existing destination route.

Keep existing analytics event names, route names, database fields, and historical event taxonomy unchanged. Update new events' current `cta_label` values and relevant dashboard presentation labels to `Team Hotels` so they match the UI. Do not rewrite historical analytics.

---

## 2. Improve the canonical Team Hotels page

Keep `/team-hotel-booking`; do not create a replacement route.

Preserve its existing technical SEO foundation:

- public and indexable
- server rendered
- self-canonical
- sitemap included
- useful title, H1, FAQ content, and breadcrumb structured data

Improve rather than rebuild it.

The primary search-facing concept should remain close to:

**Team Hotel Blocks for Youth Sports Tournaments**

Useful supporting language includes:

- group hotel rooms for sports teams
- sports team hotel booking
- tournament hotel blocks
- team room blocks
- hotels for the whole team
- youth sports team hotels

Do not keyword-stuff. Write for coaches and team managers first and search engines second. Do not rely on `Team Travel` as the main description.

Above the fold, communicate something conceptually like:

### Need hotel rooms for your whole team?

Request group hotel options near your tournament and venues.

Use only wording supported by the current HotelPlanner/group-request relationship. Do not invent guaranteed discounts, rates, availability, hotel bidding, response times, savings, partner reach, or free/no-obligation claims.

Make it concise and clear that the service is for coaches, team managers, club administrators, and travel coordinators requesting at least five rooms.

---

## 3. Remove the 12-room maximum

Remove TI's current 12-room maximum completely.

Retain the provider's documented **five-room minimum**, integer validation, and reasonable protections against malformed or unsafe values, but do not impose a product-level maximum room count.

Inspect and update every relevant path:

- HTML input attributes and client validation
- canonical Team Hotels form
- tournament, venue, map, and Book Travel group-request surfaces
- API/backend validation
- shared types, schemas, constants, and provider adapters
- tests and fixtures
- database constraints, if any

Do not merely remove the visible input `max` while leaving a backend rejection in place. All Team Hotel request surfaces must use the same minimum-only room-count contract.

Do not introduce an arbitrary replacement maximum. If an upstream provider rejects a request because of an undocumented maximum, surface an honest actionable error, preserve enough diagnostic context for investigation without exposing PII, and report the observed provider restriction. Do not silently clamp or alter the customer's requested room count.

---

## 4. Reduce form friction

Audit each field against the HotelPlanner API and TI backend requirements.

The expected Phase 1 direction, unless current verified integration requirements establish otherwise, is:

| Field | Expected handling |
| --- | --- |
| Destination/property context | Required, with known context prefilled |
| Check-in/check-out | Required, with known dates prefilled |
| Rooms | Required; integer; minimum 5; no TI maximum |
| First name | Required by provider |
| Last name | Required by provider |
| Email | Required by provider |
| Phone | Optional unless an enabled provider feature requires it |
| Team/group name | Optional unless TI has a verified operational need |
| Adults per room | Use a clear backend default rather than requiring user entry where safe |
| Children | Optional with a safe default |
| Notes/comments | Optional to the user, with production-safe provider request construction |

Do not blindly remove fields. Document any departure from this direction with the exact provider, backend, or operational requirement.

Keep validation and defaults centralized where practical so the canonical and map forms do not drift. Do not create a multi-step wizard for Phase 1.

---

## 5. Eliminate test-only values from production requests

Inspect HotelPlanner request construction, especially the current blank-comment fallback.

Provider documentation reserves `comments: "test test"` for testing. A production request must never receive `"test test"` or another test marker merely because the customer left notes blank.

Replace the fallback with truthful, production-safe request context that satisfies the provider's required `comments` field. Keep the provider's test marker only behind an explicit test-only path or test environment. Do not misrepresent user-entered text.

Add regression coverage proving:

- blank optional notes do not generate a test marker in production request construction
- explicit user notes remain intact
- test mode can still use the documented test value when intentionally invoked

---

## 6. Preserve contextual prefill

Preserve and verify prefill for tournament, destination, venue, sport, and check-in/check-out dates whenever those values are already known from the originating TI surface.

Do not make users re-enter information TI already knows, and do not invent missing information.

---

## 7. Clarify what happens next

Make pre-submit and post-submit copy internally consistent about HotelPlanner, who follows up, and what happens after submission.

At minimum, users should understand:

1. they submit a Team Hotel request
2. TI sends the request to the lodging partner
3. hotels may respond with negotiated offers and booking is completed with the responding property's sales team, only if current integration documentation still supports those facts

Remove or avoid claims such as `Expect options within 24–48 hours` unless current partner documentation or a confirmed agreement supports them.

Document unverified response-time, option-count, booking-link, free/no-obligation, and service-level claims as business questions rather than inventing answers.

---

## 8. Improve trust using verified facts only

Useful truthful elements may include:

- designed for requests of 5+ rooms
- tournament and venue context carried into the request
- no TI account required, if still true
- stay-to-play warning where applicable
- request sent to the lodging partner

Do not add fake testimonials, fabricated team or booking counts, savings claims, unverified partner reach, or unsupported response guarantees.

The two founder-verified requests are business evidence, not automatically public testimonials.

---

## 9. Preserve contextual feeder hierarchy

### Tournament detail

Keep the individual-family hotel CTA primary and the Team Hotel CTA secondary. Use concrete language such as:

**Booking rooms for the whole team?**

**Request a team hotel block**

Preserve tournament, venue, date, and sport prefill.

### Venue detail

Keep Team Hotels secondary to the individual-hotel flow. Replace vague wording such as `Explore team lodging options` with concise language such as `Team hotel rooms` or `Need 5+ rooms for your team?`

Do not create venue-specific Team Hotels routes.

### Book Travel

Keep Book Travel as a mixed individual/group lodging feeder. Fix the title that currently renders approximately:

`Tournament Travel Hotels & Rentals | TournamentInsights | TournamentInsights`

The page-level title must omit the duplicated brand suffix and allow the root Next.js title template to append the brand once. Preserve the path to the canonical Team Hotels page. Do not redesign Book Travel.

### Tournament venue map

Preserve its working conversion utility and make its Team Hotel quick-form wording and validation consistent with the canonical offer. Do not turn the map into an SEO surface or create a new map-to-canonical architecture unless a small consistency fix requires it.

---

## 10. Add precise acquisition attribution

Future provider-accepted requests should identify, where available:

- initial acquisition source
- current source surface
- CTA placement
- tournament and venue context
- outbound/request attribution ID
- client funnel session context, if already supported

Preserve the server-generated authoritative `lodging_search_session.session_id`; do not overwrite or conflate it with a client analytics session ID.

Capture first-touch acquisition separately. Prefer existing authoritative `traffic_source` and `referrer` fields where available. Store a normalized acquisition category using existing TI conventions where possible, sufficient to distinguish organic search, direct, internal/contextual, referral, email, and explicit UTM sources.

Store only a sanitized external referrer origin or hostname, not a full URL with query parameters or potential PII. Treat the current submission surface separately from the initial acquisition source.

Carry this attribution consistently through:

- canonical Team Hotels traffic
- tournament- and venue-prefilled canonical traffic
- Book Travel
- map quick form
- other existing Team Hotel submission surfaces

The HTTP request's TI `Referer` is not a substitute for the original acquisition referrer. Capture initial browser referrer/source at the appropriate first-touch point, persist it for the Team Hotels journey, and pass it to authoritative request persistence.

Reuse existing infrastructure and conventions. Do not build a broad analytics platform or place unnecessary PII in analytics events.

---

## 11. Preserve authoritative request persistence

Continue treating the successful group-request persistence path as the source of truth for provider-accepted Team Hotel requests. Client analytics are supplementary, not authoritative.

Preserve:

- provider request ID
- attribution ID
- authoritative server session ID
- request context
- requested room count
- stay dates
- tournament/venue context where available
- source surface and placement
- acquisition source and sanitized referrer where available

Prefer existing authoritative fields or a small clearly named extension. If client Team Hotels session context must be persisted, use an existing structured context field or a clearly named new field; do not reuse the authoritative server `session_id` for a different meaning.

---

## 12. Search Console, stay-to-play, and scope boundaries

Search Console query data is unavailable in the current environment. Do not manufacture search-demand evidence or build a Search Console integration. Keep the canonical page ready for a founder-run 60-day test through correct indexing, canonical, title, H1, description, and crawlable internal links.

Preserve existing stay-to-play warnings and logic. Do not imply that TI's Team Hotels request replaces mandatory official tournament housing.

Do not implement programmatic Team Hotels pages, organizer or proposal dashboards, family booking-link management, a team hotel marketplace, paid search, a broad redesign, or downstream commission ingestion unless an existing partner integration exposes that data trivially.

---

## 13. Measurement funnel

Support measurement through:

`Team Hotels landing`
→ `form start`
→ `form submit`
→ `provider accepted request`

Proposal, booked-room-night, and commission stages may remain future work. A qualified Team Hotel request is valuable because of its room-night potential, not because a CTA was clicked.

---

## Validation and testing safety

Perform and report only checks actually completed.

### Automated validation

Verify:

- room count accepts integers of 5 or greater without a TI maximum
- values below 5 and malformed values are rejected consistently
- no form or backend path retains the former 12-room restriction
- blank notes never become a production test marker
- provider request construction preserves the requested room count without clamping
- attribution normalization and sanitization work as intended
- authoritative persistence retains all required identifiers and context

### Browser UAT

Verify:

- anonymous access, metadata, canonical, H1, crawlable copy, and form rendering
- desktop and mobile navigation display `Team Hotels` and reach the correct destination
- canonical, tournament, venue, Book Travel, and map entry points remain functional
- individual hotel CTAs remain primary where required
- contextual prefills survive
- form validation and success/error presentation are consistent
- Book Travel has only one brand suffix in its rendered title

### Partner and production safety

Do **not** create a real HotelPlanner group RFP in local or production solely for testing without explicit authorization. Use automated tests, provider mocks, or an explicitly approved provider test path.

Production verification must be read-only unless a specifically identified test submission is separately authorized. Do not validate the absence of the room ceiling by sending an unsolicited high-room-count live request.

If a real user later encounters an undocumented upstream room limit, preserve the failure for diagnosis without PII, present an actionable error, and report the provider behavior rather than silently changing the requested count.

---

## Deliverables

Provide:

### User-facing changes

List navigation wording, canonical page copy, form changes, tournament and venue CTA changes, success-state changes, and the Book Travel metadata fix.

### Form requirements

Provide a before/after table:

| Field | Before | After | Reason |
| --- | --- | --- | --- |

Explicitly confirm that rooms now use a five-room minimum with no TI maximum, and identify every previous frontend/backend limit removed.

### Partner/process claims

List claims verified and used, and claims not verified and therefore omitted.

### Attribution

Explain exactly how initial acquisition, current source surface, CTA placement, and authoritative request identifiers are captured and persisted. Confirm that server and client session concepts remain distinct and that referrer data is sanitized.

### SEO

Confirm that `/team-hotel-booking` remains canonical, no new Team Hotels page classes were created, and describe metadata/internal-link changes.

### Validation

Report only checks actually performed: typecheck, lint, tests, build, browser UAT, and read-only persistence inspection. Clearly identify anything not run.

---

## Acceptance criteria

Phase 1 is complete when:

- `/team-hotel-booking` remains the canonical Team Hotels page
- global user-facing navigation uses `Team Hotels`
- new CTA labels match the visible wording without renaming event taxonomy or rewriting history
- acquisition copy uses concrete team-hotel/block language
- the 12-room limit is removed from all frontend, backend, shared-schema, and request paths
- room requests accept integers of 5 or greater without a TI maximum and are never silently clamped
- unnecessary required fields are reduced where safely possible
- production provider payloads cannot contain an accidental test-only comment marker
- tournament and venue contextual links remain secondary and intact
- known tournament, venue, sport, and date context continues to prefill
- Book Travel title duplication is fixed through correct Next.js title-template usage
- pre- and post-submit process language is consistent and truthful
- unsupported partner claims are not introduced
- future accepted requests preserve improved first-touch and contextual attribution in the authoritative request path
- server-generated authoritative session IDs remain distinct from client funnel sessions
- HotelPlanner/group-request behavior is not broadly redesigned
- no real partner RFP is created solely for testing without explicit authorization
- no programmatic Team Hotels pages are introduced

---

## Final product rules

> **Make the existing Team Hotels funnel clearer and easier before creating more Team Hotels surfaces.**

> **A qualified Team Hotel request is valuable because of its room-night potential, not because a CTA was clicked.**

Optimize for legitimate group lodging demand, not vanity traffic.
