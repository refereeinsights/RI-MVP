# RI / TI Hotel Funnel Audit — Stage 1 Report Only

## Objective

Audit the current RefereeInsights → TournamentInsights → HotelPlanner hotel funnel and produce a decision packet for improving measurement quality.

This is a repository-only, REPORT-ONLY audit.

Do not query production or staging databases. Produce the diagnostic query/report design, but mark actual counts `UNPROVEN`.

Do not modify code, schema, analytics vocabularies, provider behavior, configuration, production data, or HotelPlanner routing.

Do not run migrations, push commits, deploy, or make HotelPlanner calls.

Stop after producing the proposed patch and decision packet.

Record initial `git status`, run the audit without edits, and confirm final status is unchanged. Do not claim the working tree is clean if unrelated pre-existing changes exist.

---

## Core question

Determine whether current RI hotel analytics cleanly distinguish:

* passive venue-page rendering;
* explicit browser interaction signals;
* property click;
* TI handoff;
* persisted outbound attribution;
* redirect;
* HotelPlanner arrival;
* confirmed booking.

The repository already indicates that RI venue pages initiate HotelPlanner lodging searches during server rendering before explicit user interaction.

The audit must verify the current implementation and explain the structural measurement implications. Actual production counts remain `UNPROVEN` in this repository-only audit.

---

# 1. Document the current temporal flow

Verify the actual repository-backed sequence and all material branches.

Expected successful flow:

```text
RI venue page server render
→ TI lodging search begins
→ lodging_search_session persistence attempted
→ row exists only if best-effort telemetry succeeds
→ HotelPlanner/provider results returned
→ page rendered
→ browser hydrates
→ ri_venue_hotel_results_loaded
→ optional hotel/property interaction
→ /go/hotels/property request
→ ti_outbound_clicks persistence attempted
→ redirect issued under the existing commercial handoff policy
→ HotelPlanner
→ possible booking
```

Also audit:

* successful provider results;
* zero/low inventory;
* provider failure;
* rate limiting;
* missing/invalid destination or dates;
* telemetry persistence failure;
* known-bot outbound persistence suppression;
* redirect with no persisted outbound row.

For every stage identify:

* exact file/function;
* client-side or server-side;
* whether explicit browser interaction is required;
* whether passive rendering can trigger it;
* whether crawlers/automated clients can trigger it;
* identifiers available for deterministic correlation.

Clearly distinguish proven repository behavior from inference.

Trace the IP-address and user-agent semantics seen by TI when RI performs the server-side lodging request. Determine whether TI sees the originating browser/crawler identity or only RI's shared server identity. Report only the behavior and field presence; do not print actual IP addresses or user-agent values.

---

# 2. Explicitly evaluate the temporal product decision

Do not silently assume hotel search should move behind user intent.

Compare these two architectures.

## Option A — Keep passive server-side hotel search

```text
venue page render
→ provider search
→ hotel results available
→ optional explicit interaction
```

Under this model:

* `lodging_search_session` must be treated as passive supply/search activity;
* it must not be interpreted as lodging intent;
* reporting must clearly separate provider searches from explicit browser interaction.

Evaluate:

* measurement clarity;
* provider capacity/load;
* caching implications;
* crawler inflation;
* product latency;
* SEO/rendering behavior;
* implementation complexity.

## Option B — Move provider search behind explicit hotel/travel intent

```text
venue page
→ explicit hotel/travel interaction
→ provider search
→ results
→ property click
```

Evaluate the same dimensions.

Do not implement either option.

End with a recommendation and explain the tradeoff.

---

# 3. Preserve all hotel funnel stages

Do not collapse these stages:

```text
Property click
→ /go/hotels/property request
→ outbound row persisted
→ redirect issued
→ HotelPlanner arrival
→ booking
```

For each stage state whether it is:

* directly observable;
* deterministically correlatable;
* inferred;
* currently unobservable.

Important:

A successful redirect does NOT prove HotelPlanner arrival.

If no repository-backed HotelPlanner arrival/callback signal exists, report:

`HotelPlanner arrival: UNOBSERVABLE`

Do not infer arrival from redirect issuance.

---

# 4. Reuse existing RI analytics vocabulary first

Inspect existing RI analytics definitions and usage, including:

* `ri_venue_hotels_cta_clicked`
* `ri_travel_search_submitted`
* `ri_venue_hotel_results_loaded`
* `ri_venue_hotel_card_clicked`

Start with:

`apps/referee/lib/riAnalyticsEvents.ts`

Determine whether `ri_venue_hotels_cta_clicked` can already represent venue hotel intent.

Its existing usage may include multiple interactions such as fallback and Nearby hotel actions.

Evaluate whether:

1. the existing event semantics are sufficient;
2. semantics can be tightened through dimensions or placement;
3. a new event is actually necessary.

Do not propose `ri_venue_hotel_intent` unless existing vocabulary cannot represent the required distinction cleanly.

---

# 5. Prefer existing correlation infrastructure

Inspect and document the current correlation chain involving:

* `cta_interaction_id`
* `lodging_search_id`
* `outbound_request_id`
* `outbound_attribution_id`
* HotelPlanner `Custom3`

Determine the smallest deterministic funnel join.

Prefer the existing pattern if repository evidence supports it:

```text
RI hotel card interaction
    .cta_interaction_id
→ ti_outbound_clicks
    .cta_interaction_id
→ outbound_attribution_id
→ HotelPlanner Custom3
→ confirmed booking
```

Inspect:

`apps/ti-web/app/go/hotels/property/route.ts`

and existing hotel diagnostic/reconciliation code.

Do not default to exposing `outbound_attribution_id` in RI client analytics if `cta_interaction_id` already provides sufficient deterministic correlation.

Explain any gaps where identifiers are generated too late or dropped.

---

# 6. Keep analytics namespaces separate

Do not mix RI analytics terminology with TI outbound attribution vocabulary.

Specifically verify:

## RI analytics

`page_type` may include values such as:

`venue_detail`

## TI hotel outbound attribution

`source_page_type` uses its own closed vocabulary and currently may identify RI traffic as:

`referee`

Detailed placement may instead be represented by:

`cta_placement=ri_venue_detail_hotels`

Do not prescribe:

`source_page_type=venue_detail`

unless repository evidence demonstrates that the TI attribution vocabulary itself should be migrated.

Prefer existing attribution dimensions where sufficient.

---

# 7. Booking attribution and conversion rules

Reuse the repository's established booking reconciliation logic, including:

`apps/referee/lib/hotelBookingReconciliation.ts`

Verify the valid reconciliation categories and HotelPlanner `Custom3` join semantics.

Use:

```text
HotelPlanner Custom3
→ attr:{outbound_attribution_id}
→ ti_outbound_clicks
```

as the authoritative deterministic booking join where supported.

Do not infer a booking from:

* current tournament configuration;
* tournament slug;
* HotelPlanner URL;
* Custom8 alone;
* source surface alone.

---

# 8. Reporting definitions

Propose or reuse a read-only diagnostic design for:

* 7 days
* 30 days
* 90 days

Do not execute it against production or staging during this audit. Mark actual counts `UNPROVEN`.

The diagnostic should report:

* tracked RI venue-detail view events;
* hotel CTA / explicit browser interaction events;
* hotel search submissions where relevant;
* `referee_venue_detail` lodging-search sessions;
* hotel results-loaded events;
* hotel-card click events;
* `/go/hotels/property` requests if independently observable;
* persisted TI HotelPlanner outbound rows;
* redirects issued, if observable separately;
* HotelPlanner arrivals, or `UNOBSERVABLE`;
* deterministically matched confirmed bookings;
* room nights;
* booking value;
* expected commission;
* paid commission.

Keep these financial measures separate.

Do NOT label commission as generic "revenue."

For funnel economics, booking value, room nights, expected commission, and paid commission must include only deterministically matched confirmed bookings. Any broader accounting totals must be displayed separately and clearly labeled.

---

# 9. Conversion cohort rules

Cohort hotel conversions by persisted outbound-handoff time.

For example:

```text
persisted outbound handoffs created in last 30 days
→ any subsequently known deterministically matched confirmed booking
```

Do not require booking purchase time to fall inside the same 30-day window.

Clearly describe immature cohorts where some recent handoffs have not had enough time to convert.

Only deterministically matched confirmed bookings count toward conversion rates.

---

# 10. Visitor/event terminology

Do not call an event a confirmed human simply because it is client-side.

Use terms such as:

* explicit browser interaction signal;
* client-side hotel interaction;
* tracked interaction event.

Automation can still execute JavaScript and clicks.

Do not report:

`intent visitors`

unless a safe and stable visitor identifier already exists and is proven appropriate.

Otherwise report:

`intent events`

or equivalent.

---

# 11. Room-night definition

Verify the semantics of booking fields.

Explicitly state whether:

`nights`

means:

* stay nights;
* room nights;
* or another HotelPlanner field.

If room count exists separately, determine whether true room nights should be:

```text
rooms × nights
```

Do not label `nights` as room nights without verification.

---

# 12. Bot handling

Inspect current known-bot handling.

Do not build sophisticated bot detection.

Do not classify "not matched by bot regex" as human.

Use bot/user-agent analysis only as a secondary diagnostic.

The tracking architecture should rely on clearer funnel semantics and deterministic correlation rather than perfect bot classification.

---

# 13. Privacy and safety invariants

The recommended design must preserve these invariants:

* new analytics or correlation persistence must never block or alter a redirect;
* preserve the existing commercial handoff policy exactly, including any existing economic-snapshot safety behavior;
* do not broaden or weaken that policy;
* do not alter HotelPlanner commercial routing;
* do not alter immutable hotel economic snapshots;
* do not add sophisticated bot detection;
* do not expand collection of IP addresses;
* do not expand raw user-agent collection;
* do not collect new raw URLs or destinations unless already required;
* do not store provider responses for analytics;
* do not add customer/reservation PII to analytics;
* use existing read-only admin/reporting infrastructure where practical.

---

# 14. Proposed metrics

Where structurally supported, design these calculations:

```text
hotel CTA events / tracked venue-detail views

lodging searches / tracked venue-detail views

results-loaded / lodging searches

hotel-card clicks / results-loaded

persisted outbound rows / hotel-card clicks

confirmed matched bookings / outbound cohort

matched confirmed booking value / outbound cohort

matched confirmed expected commission / outbound cohort

matched confirmed paid commission / outbound cohort
```

Also design absolute differences such as:

```text
persisted outbound rows
minus
hotel-card click events
```

For every metric and funnel connection label the evidence as exactly one of:

* `DETERMINISTICALLY JOINED`
* `AGGREGATE-ONLY`
* `INFERRED`
* `UNAVAILABLE`

Do not present aggregate event-count ratios as a deterministic user journey.

Break RI HotelPlanner outbound rows down by existing dimensions such as:

* `source_page_type`
* `cta_placement`

Do not mix `referee_travel` and broader `referee` traffic without clearly separating them.

---

# 15. Decision packet

End with:

## Current-state funnel

Repository-backed diagram, including the important success and failure branches.

## Measurement problems

Rank each issue by severity.

## Option A

Keep passive SSR/provider search and improve classification/reporting.

Include:

* benefits;
* drawbacks;
* smallest tracking changes.

## Option B

Move provider search behind explicit hotel/travel interaction.

Include:

* benefits;
* drawbacks;
* smallest product/technical changes.

## Recommended option

State which option you recommend and why.

## Proposed patch

List exact files/functions that would change.

Do not make the changes.

## Schema/migration requirements

State:

`NONE`

if existing events and identifiers are sufficient.

Otherwise identify the smallest necessary change.

## Historical reporting impact

Explain which historical metrics remain trustworthy and which cannot be reconstructed cleanly.

## Implementation order

Give the smallest safe sequence.

## Audit confirmation

Explicitly confirm:

* no code changes;
* no database writes;
* no production or staging reads;
* no HotelPlanner calls;
* no migrations;
* no push;
* no deployment;
* initial and final `git status` are unchanged after the prompt update.
