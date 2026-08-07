# TI Hotel Booking Attribution Reconciliation Audit

**Date:** 2026-08-07  
**Scope:** Read-only investigation into HotelPlanner booking attribution reconciliation  
**Bookings examined:** 9 total since approximately 2026-07-01

---

## 1. Attribution Token Generation

### Where `attr:` is generated

`attr:` tokens are generated in `apps/ti-web/app/go/hotels/route.ts` via `deriveStableAttributionId`, which resolves the final `outboundAttributionId` by three paths in priority order:

1. **Pre-passed value:** If `outbound_attribution_id` is present in the incoming `/go/hotels` URL and passes UUID validation, it is used directly. This path is used by `WeekendPlannerClient` (Book Travel / Weekend Planner flows), which generates the ID client-side and injects it before navigation.
2. **SHA-256 derivation:** If `outbound_request_id` is present, derives `sha256("ti-hp:{outboundRequestId}").slice(0, 32)`. Added in a later patch; earlier version of this function went directly to path 3.
3. **Fresh random UUID:** `createOutboundAttributionId()` generates a new UUID via `crypto.randomUUID()`. This is the path for the venue map `buildVenueHotelsHref` plain `<a>` tag, which does not pre-set `outbound_attribution_id`.

The token is then formatted as `attr:{32-char hex}` and placed in `Custom3` for HotelPlanner.

The token is stored in `ti_outbound_clicks.outbound_attribution_id` **without** the `attr:` prefix. The join is: strip `attr:` from Custom3, match to `outbound_attribution_id` column.

### Uniqueness and collision risk

Tokens generated via path 1 or 2 are deterministic per click. Path 3 generates a fresh UUID each time `/go/hotels` is hit without a pre-set ID, so the venue map "view all hotels" `<a>` tag generates a new token on every page hit. Collisions are cryptographically negligible for all paths.

### Survival across handoff paths

The token survives the `/go/hotels` → HP Search redirect path. HotelPlanner carries Custom3 forward from the initial search redirect through to the booking record. For individual property clicks via `/go/hotels/property`, the token is also passed explicitly. The token does **not** survive if a user navigates directly on HP's side without TI-originated custom fields.

---

## 2. Custom1–Custom8 Semantics

| Field | Encoding | Default behavior | Notes |
|-------|----------|-----------------|-------|
| Custom1 | `ven:{venueId}` or `src:{sourcePageType}` | `ven:{venueId}` when venue present; `src:{sourcePageType}` otherwise | Group requests: `ven:{venueId}` or `tour:{tournamentId}`. **Do not join without stripping prefix.** |
| Custom2 | Tournament slug or source page type | Tournament slug when available; falls back to `sourcePageType` | No prefix. Group requests: `tour:{tournamentId}` as fallback. |
| Custom3 | `attr:{outboundAttributionId}` | Always set | Primary join key. Strip `attr:` before joining to `ti_outbound_clicks`. |
| Custom4 | `srcp:{sourcePageType}` | Always set | Values: `srcp:tournament`, `srcp:venue`, `srcp:venue_map`, `srcp:book_travel`, `srcp:weekend_planner`, `srcp:referee`, `srcp:other` |
| Custom5 | `place:{ctaPlacement}` | Set when `cta_placement` is in the URL | Values: `place:venue_map_view_all_hotels`, `place:book_travel_view_all_hotels`, `place:venue_map_property_card`, `place:book_travel_property_card`, etc. Null when `cta_placement` not passed to `/go/hotels`. |
| Custom6 | `plan:{plannerSessionId}` | Set only for Weekend Planner-sourced hotel flows with an active planner session | Blank for all 9 examined bookings (none originated from Weekend Planner hotel CTA). |
| Custom7 | `cta:{ctaInteractionId}` | Set when `cta_interaction_id` is in the URL (injected by `VenueHotelLink`) | Blank for all 9 bookings; neither "view all hotels" path uses `VenueHotelLink`. |
| Custom8 | Reserved / pass-through | No current default | Blank for all examined bookings. |

---

## 3. TI-Side Persistence

### Primary table: `ti_outbound_clicks`

| Column | Notes |
|--------|-------|
| `outbound_attribution_id` | Join key from Custom3 (strip `attr:`) |
| `created_at` | Click timestamp |
| `session_id` | Browser session from sessionStorage — **null for "view all hotels" CTAs** |
| `venue_id` | Raw UUID, no prefix |
| `tournament_id` | UUID |
| `tournament_slug` | Full slug string |
| `source_surface` | e.g. `tournament`, `venue`, `book_travel` |
| `cta_placement` | e.g. `venue_map_view_all_hotels` — null for plain `<a>` paths that don't pre-set it |
| `source_page_type` | Derived source type |
| `device_type` | `desktop` / `mobile` / `tablet` |
| `traffic_source` | null for all examined rows |
| `referer` | null for all examined rows |
| `outbound_request_id` | Client-side per-click UUID — null for paths not using `VenueHotelLink` |
| `cta_interaction_id` | null for "view all" paths |
| `custom_field1–8` | Mirror of HP Custom1–8 |
| `user_id` | **Not stored.** No direct user join available. |

### User attribution path

`ti_outbound_clicks` does not store `user_id`. Indirect user attribution requires:

`session_id` → `ti_map_events` or equivalent analytics table → auth/user state where captured

This is only possible when `session_id` is non-null, which is not the case for any of the 9 examined bookings.

### Group hotel requests

Group requests (`/api/lodging/group-request`) log to `lodging_search_session`, not `ti_outbound_clicks`. The same `outbound_attribution_id` is stored there. `lodging_search_session` holds `session_id`, `venue_id`, `tournament_id` (not slug), `cta_placement`, `device_type`, `traffic_source`, and `planner_session_id`. None of the 9 bookings are group requests.

---

## 4. Reconciliation of Corrected Bookings

Three bookings have corrected `attr:` attribution. Six legacy bookings (Booking IDs ≤ 19154481) have no Custom3 attr token and cannot be joined to `ti_outbound_clicks`.

### Legacy bookings (not reconcilable)

| Booking | Custom1 | Custom2 | Custom3 | Status |
|---------|---------|---------|---------|--------|
| Mojo | `ven:{uuid}` | Mojo | — | Venue partially identifiable; no session join |
| Central Florida Jam Fest | Central Florida Jam Fest | Team Chemistry | — | Free text only; no join |
| Chadwick Bay | Chadwick Bay | Amherst Lightning | — | Free text only; no join |
| src:book_travel | `src:book_travel` | moscow, id | camp planner | Pre-attr format; Custom3 is free text |
| 2026 All American | `ven:{uuid}` | `2026-all-american-games-melbourne-fl` | — | Closest to current format; no attr token |
| Apex Grind | Apex Grind | — | — | Free text only; no join |

These predate the attribution phase 2a commit (2026-07-27).

### Corrected bookings reconciliation table

| Booking | Attr token | DB rows found | Source surface | Placement | Tournament | Venue | CTA interaction | Planner session | Device | Traffic source | Referer | User recoverable? | Confidence |
|---------|------------|---------------|----------------|-----------|------------|-------|-----------------|-----------------|--------|----------------|---------|-------------------|------------|
| Indy Cup / Lakota Fc | `9ea4eb46...260e` | **0** | book_travel (from HP) | book_travel_view_all_hotels (from HP) | unknown | unknown | — | — | unknown | unknown | unknown | No | None — DB write failed |
| Belgrade Bandits (19357404) | `388d90b4...2ff3` | 1 | tournament | null in DB / `venue_map_view_all_hotels` in HP | northwest-class-a-regional-american-legion-baseball-tournament-casper-wy | 0d0922c5-... | — | — | desktop | null | null | No | Partial — tournament + venue confirmed; CTA path inconsistent |
| American Legion District (19356917) | `388d90b4...2ff3` | shared row above | tournament | (same as above) | (same as above) | (same as above) | — | — | desktop | null | null | No | Partial — two bookings from one click event |

**Note on Belgrade Bandits rows 2 and 3:** Both share the same attr token, same Hotel ID (637619), and different Booking IDs. Two separate bookings at the same hotel from a single attributed click event. The one DB row covers both.

**Note on Custom field mismatch:** HP's booking records show `Custom1 = Belgrade Bandits` and `Custom5 = place:venue_map_view_all_hotels`. The `ti_outbound_clicks` row shows `Custom1 = ven:0d0922c5-...` and `Custom5 = null`. HP's booking attribution likely reflects Custom fields from the property checkout click, not the search redirect click that TI logged. HP carries the `attr:` token (Custom3) forward from the initial search, but Custom1 and Custom5 may be overwritten by the later checkout step.

---

## 5. CTA-Level Attribution (Custom7)

Custom7 (`cta:{ctaInteractionId}`) is blank for all 9 bookings. Neither the venue map "view all hotels" `<a>` tag nor the WeekendPlannerClient `openGoUrlInNewTab` flow uses `VenueHotelLink`, which is the component that generates and injects `cta_interaction_id` client-side. Without `VenueHotelLink`, no CTA interaction ID is available, and Custom7 is not populated.

Individual hotel property clicks that go through `VenueHotelLink` would populate Custom7. None of the examined bookings used that path.

---

## 6. Weekend Planner Attribution (Custom6)

Custom6 (`plan:{plannerSessionId}`) is blank for all 9 bookings. None originated from the Weekend Planner hotel CTA, which is the only path that passes `plannerSessionId` to `/go/hotels`. The WeekendPlannerClient `buildHotelSearchParams` function does pass `planner_session_id` when a planner session context is active, and it is stored in `ti_outbound_clicks.custom_field6`. This path is untested by any of the 9 examined bookings.

---

## 7. Session vs User Attribution

### Session attribution

For the corrected bookings: `session_id` is null in all available `ti_outbound_clicks` rows. The "view all hotels" paths — both venue map `buildVenueHotelsHref` and WeekendPlannerClient `buildHotelSearchParams` — do not read `session_id` from sessionStorage before calling `/go/hotels`. The `/go/hotels` route only reads `session_id` from the incoming URL query param; it does not independently establish a session server-side.

Session attribution: **unavailable for all 9 examined bookings.**

### User attribution

`ti_outbound_clicks` does not store `user_id`. Even if session_id were present, user identity would require a secondary join through `ti_map_events` or equivalent. With session_id null, user attribution is not possible by any path.

User attribution: **unavailable. Classified as unavailable (not indirect-but-partial), because session_id is the prerequisite.**

---

## 8. Attribution Gaps

### Structural gaps

| Gap | Affected flows | Impact |
|-----|---------------|--------|
| `session_id` never passed to `/go/hotels` by "view all hotels" CTAs | Venue map `<a>` tag, WeekendPlannerClient `button` | No session attribution for search-redirect bookings |
| Venue map "view all hotels" is a plain `<a>` tag, not `VenueHotelLink` | `TournamentVenueMapClient.tsx` line 2761 | No `cta_interaction_id`, no `outbound_request_id` client enrichment |
| WeekendPlannerClient does not read sessionStorage for `session_id` | `buildHotelSearchParams` | Same gap, different component |
| DB write fails silently for some clicks | `/go/hotels` catch block | Indy Cup: zero rows despite HP having the attr token |
| Custom field values in HP booking may differ from the logged click | Both "view all" flows | HP carries attr token from search but Custom1/Custom5 from checkout step |

### Expected anonymous-user limitations

- Users who are not signed in have no user identity to recover even with session_id
- `referer` and `traffic_source` are null for all examined rows; these fields depend on the browser forwarding referrer headers through the redirect chain

### Legacy booking gaps (pre-attribution-fix)

All 6 bookings before Booking ID 19356917 have no `attr:` token. Not reconcilable. These predate the 2026-07-27 phase 2a deployment.

### Patch-related gap

The Indy Cup booking (most recent, `srcp:book_travel`) has zero `ti_outbound_clicks` rows. The DB write failure occurred after the 2026-07-27 attribution fix was in place (the attr token exists in HP), suggesting a regression introduced by one of the 2026-08-04 or 2026-08-06 patches rather than a pre-fix booking. Not investigated further.

---

## 9. Minimum Fix

The "view all hotels" CTAs — in `TournamentVenueMapClient.tsx` (plain `<a>` tag, line 2761) and `WeekendPlannerClient.tsx` (`openGoUrlInNewTab` button) — need to read `session_id` from sessionStorage and append it to the `/go/hotels` URL before navigation.

Both components are client components. The sessionStorage key used by `VenueHotelLink` is `ti_venue_hotel_session_id`. Reading or creating that value at click time and appending `session_id` to the URL params is a two-line change per component and does not require converting either CTA to `VenueHotelLink`.

This closes the session attribution gap for all future "view all hotels" bookings without architectural changes.

---

## Attribution Verdict

### Attribution verdict

**Directionally useful but incomplete**

The `attr:` token join to `ti_outbound_clicks` works for corrected bookings. Tournament and venue are recoverable. But session-level attribution is unavailable, one of three corrected bookings has zero DB rows, and HP's Custom field values at booking time may not match the TI-logged click.

### Can we attribute bookings to TI session?

**No** — `session_id` is null across all available corrected rows.

### Can we attribute bookings to TI source surface?

**Partial** — recoverable from the `ti_outbound_clicks` row when it exists (`source_surface = tournament`, `source_page_type = tournament`). Zero rows for Indy Cup.

### Can we attribute bookings to placement?

**Partial** — `cta_placement` is null in the Belgrade Bandits DB row despite the venue map CTA setting it; HP shows the correct placement value but it may not match what TI stored.

### Can we attribute bookings to tournament?

**Partial** — tournament slug and ID recoverable from the Belgrade Bandits row. Not available for Indy Cup (zero rows).

### Can we attribute bookings to venue?

**Partial** — venue ID recoverable from the Belgrade Bandits row. Not available for Indy Cup.

### Can we attribute bookings to CTA interaction?

**No** — Custom7 blank for all bookings; neither "view all" path uses `VenueHotelLink`.

### Can we attribute Planner-sourced bookings to planner session?

**Not applicable for tested rows** — no examined booking originated from the Weekend Planner hotel CTA.

### Can we attribute bookings to acquisition source/referrer?

**No** — `traffic_source` and `referer` null for all examined rows.

### Can we attribute bookings to authenticated user?

**No** — `session_id` null; user attribution requires session as prerequisite.

### Minimum next engineering change

Add `session_id` (read or create from `sessionStorage` key `ti_venue_hotel_session_id`) to the `/go/hotels` URL params in both the venue map "view all hotels" `<a>` tag (`TournamentVenueMapClient.tsx`) and the WeekendPlannerClient "View all hotels on HotelPlanner" button (`buildHotelSearchParams`).
