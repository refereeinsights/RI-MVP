# TI Team Hotels Phase 1 implementation — 2026-08-11

## Outcome

Phase 1 improves the existing `/team-hotel-booking` funnel without adding page classes or changing the HotelPlanner integration architecture.

## User-facing changes

- Global navigation now displays **Team Hotels**. Existing event names remain unchanged; new `cta_label` values and admin-email presentation labels use `Team Hotels`.
- The canonical page now leads with **Team Hotel Blocks for Youth Sports Tournaments** and concrete whole-team/group-room language.
- Tournament callouts now ask **Booking rooms for the whole team?** and use **Request a team hotel block**.
- The venue feeder uses **Team hotel rooms** or **Request 5+ rooms for your team**, depending on its existing eligibility level.
- The canonical and map success states say that the request was sent to the lodging partner and that the partner may follow up. The unsupported 24–48-hour promise was removed.
- Book Travel now supplies an unbranded page title so the root Next.js title template renders one `| TournamentInsights` suffix.

## Form requirements

| Field | Before | After | Reason |
| --- | --- | --- | --- |
| Destination/property | Required | Required; contextual prefill preserved | Provider itinerary needs a destination/property |
| Check-in/check-out | Required | Required; contextual prefill preserved | Provider itinerary requirement |
| Rooms | Required; 5–12 | Required; safe integer, minimum 5, no TI product maximum | Provider docs establish 5+ and do not document a maximum |
| First name | Required | Required | Provider requirement |
| Last name | Required | Required | Provider requirement |
| Email | Required | Required | Provider requirement |
| Phone | Required in UI | Optional | Provider-optional when SMS opt-in is not used |
| Team/group name | Required in UI | Optional | Provider-optional |
| Adults per room | Required in UI | Removed from first-step UI; backend default 2 | Provider payload still receives a useful default |
| Children per room | Optional in UI | Removed from first-step UI; backend default 0 | Avoid unnecessary first-step detail |
| Notes/comments | Optional | Optional; blank notes produce a truthful production-safe provider comment | Provider requires comments; test marker is test-only |

The former group-request limit was removed from the canonical UI and API validation. The shared constant was renamed to `maxSearchRooms` to make clear that the existing 12-room guard applies only to ordinary individual hotel inventory searches, not Team Hotel group requests. Provider payload construction now preserves large safe-integer room counts without clamping.

## Partner and process claims

Verified in `docs/reference/hotelplanner-api-docs.md` and used:

- `createGroupRequest` is for 5+ rooms.
- Hotels respond with negotiated offers.
- Booking is completed with the responding property's sales team.
- First name, last name, email, room count, comments, and itinerary are required provider fields.
- Group name and phone are optional when SMS opt-in is not enabled.
- `comments: "test test"` is reserved for testing.

Not verified and omitted:

- response within 24–48 hours
- guaranteed response, availability, rate, discount, savings, or number of options
- free/no-obligation claims
- partner network size

## Attribution and persistence

- A versioned browser-session acquisition context captures first touch as `direct`, `internal`, `organic_search`, `referral`, or normalized `utm:<source>`.
- External referrers are reduced to their origin; paths, query strings, and internal TI referrers are not persisted.
- Canonical, Book Travel, and venue-map group forms submit acquisition source/referrer alongside existing source surface, placement, tournament, venue, and outbound attribution context.
- The API sanitizes acquisition values again and persists them through the existing authoritative `traffic_source` and `referrer` columns.
- The database `lodging_search_session.session_id` remains server generated. The separate client Team Hotels session is stored as `client_team_hotel_session_id` inside the authoritative `search_query` JSON context.
- Map requests now persist their specific selected-venue versus venue-list CTA placement rather than collapsing both into one generic placement.

## SEO and architecture

- Canonical route remains `/team-hotel-booking`.
- No Team Hotels route or page class was added.
- Title, description, H1, body copy, FAQ copy, contextual internal links, self-canonical, sitemap inclusion, and JSON-LD remain on the existing page.
- Book Travel title-template duplication is fixed.
- Stay-to-play guidance remains visible.

## Validation performed

- `node --import tsx --test ...`: 25 focused Team Hotels, attribution, provider, link, and callout tests passed.
- `npx tsc -p apps/ti-web/tsconfig.json --noEmit`: passed.
- `npm run lint --workspace ti-web`: passed with no warnings or errors under the repository's quiet lint command.
- `npm run build --workspace ti-web`: completed and generated all routes. It emitted existing repository warnings and sandbox DNS errors while attempting Supabase-backed prerender fetches; compilation, type validation, page generation, and trace collection completed.
- Headless mobile browser UAT against local TI on port 3101: page returned meaningful content with no console errors or Next.js error overlay; canonical H1/title rendered; `Team Hotels` navigation rendered; 24-room prefill survived; room input had `min=5` and no `max`; phone/group were optional; adults-per-room was absent; Book Travel rendered one brand suffix.
- A screenshot was reviewed at 390×844 and the form remained readable with the revised fields.

Not performed:

- No form submission or real HotelPlanner RFP was created.
- No production database mutation or provider-accepted persistence test was performed.
- No Search Console query validation was possible.
