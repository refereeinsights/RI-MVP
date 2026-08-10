# TI Fix Generic Hotel Outbound Persistence Constraint

Please implement a focused fix for the confirmed Hotel Attribution Baseline v1 persistence defect.

## Objective

Allow legitimate HotelPlanner hotel-search handoffs to persist in `ti_outbound_clicks` when no `venue_id` exists.

This is a database-contract fix plus focused validation. Do not redesign the hotel attribution system.

## Authorization boundary

Implement and validate the migration locally or in an approved non-production environment.

Unless the request invoking this prompt separately and explicitly authorizes each action, do **not**:

- apply the migration to production;
- deploy any application or database change;
- commit or push changes;
- create validation rows in production; or
- contact HotelPlanner.

If production migration or deployment is not explicitly authorized, stop after producing a production-ready migration, completing safe validation, and documenting the exact production rollout and read-only verification steps.

If production migration and deployment are explicitly authorized, perform them only after the pre-production checks in this prompt pass.

## Confirmed production defect

Read-only production verification on 2026-08-10 found:

- `/go/hotels` correctly constructs attribution and attempts persistence;
- Book Travel supports valid generic hotel searches without a venue;
- Weekend Planner supports valid generic hotel searches without a venue;
- tournament detail has location-only fallback searches without a venue;
- these requests use `destination_type = 'hotels'`;
- production currently enforces `ti_outbound_clicks_destination_type_hotels_requires_venue_id`; and
- rows with `destination_type = 'hotels'` and `venue_id = null` fail with PostgreSQL `23514`.

At the verification cutoff, production observability showed:

- 292 persistence failures;
- 279 affected users;
- 0 persisted Book Travel rows after the baseline deployment; and
- 0 persisted Weekend Planner rows after the baseline deployment.

These figures are a timestamped snapshot, not permanent totals.

The HotelPlanner redirect continues after analytics persistence fails. Users can therefore complete a partner handoff while TI loses the `Custom3 → ti_outbound_clicks.outbound_attribution_id` join row.

This schema/application mismatch is believed to explain the post-baseline Book Travel booking that reached HotelPlanner with a valid `Custom3 attr:*` token but had no matching `ti_outbound_clicks` row.

## Product and data rule

A hotel outbound does **not** inherently require a venue.

Valid hotel-search contexts include:

- venue-specific hotel search;
- tournament/city hotel search;
- Book Travel generic hotel search;
- Weekend Planner hotel search; and
- tournament location-only fallback.

Do not fabricate or infer a fake venue merely to satisfy the existing constraint.

`venue_id = null` is valid when the originating hotel search genuinely has no venue context.

## 1. Inspect the constraint and migration history

Locate `ti_outbound_clicks_destination_type_hotels_requires_venue_id` and determine:

- which migration introduced it;
- its original purpose;
- whether any current application logic legitimately depends on every hotel row having a venue;
- whether reports or queries assume `destination_type = 'hotels' => venue_id is not null`; and
- whether foreign-key behavior, deletion workflows, or operational scripts depend on it.

Before changing the constraint, identify focused downstream assumptions that could break. Do not broaden this into a general analytics audit.

## 2. Fix the database contract

Create the smallest safe **forward** Supabase migration necessary to allow legitimate generic hotel-search rows.

Requirements:

- `destination_type = 'hotels'` may have `venue_id = null`;
- venue-specific hotel rows continue storing real venue IDs normally;
- no existing valid rows are rewritten;
- no fake venue IDs are introduced;
- unrelated destination-type and integrity constraints remain intact;
- the historical migration that introduced the constraint is not edited; and
- the new migration is idempotent where practical, including dropping the named constraint only if it exists.

Preferred outcome:

- drop `ti_outbound_clicks_destination_type_hotels_requires_venue_id` in a new migration if it serves no valid remaining purpose.

If a narrower replacement constraint is genuinely necessary, implement only the minimum correct rule and explain why it provides useful integrity without rejecting Book Travel, Weekend Planner, or tournament location-only searches.

Do not add an unrelated new attribution requirement as part of this fix.

## 3. Preserve application behavior

The proven defect is the database contract. Do not change `/go/hotels` application behavior unless validation reveals an additional blocker that is strictly necessary to complete this task.

The route must continue to:

- accept venue-specific searches;
- accept generic searches;
- generate or preserve canonical `outbound_attribution_id`;
- persist `session_id` when supplied;
- persist `cta_placement` when supplied;
- persist source, tournament, and venue context when genuinely available;
- mirror Custom1–Custom8;
- check and log persistence errors safely; and
- continue the redirect if analytics persistence fails.

Do not change HotelPlanner destination URLs, affiliate semantics, or user-facing behavior unnecessarily.

## 4. Validate the migration safely

Apply and validate the migration in an appropriate local, ephemeral, or approved non-production database first.

Preferred validation method:

1. inspect the production-equivalent constraint state;
2. begin a database transaction;
3. insert representative generic and venue-backed hotel outbound rows;
4. assert the expected fields and constraints;
5. roll back the transaction; and
6. confirm no validation data remains.

Do not insert validation rows into production.

If a production-equivalent database is unavailable, validate the migration SQL and relevant application behavior as far as the environment permits, and clearly label any database checks that could not be performed. Do not claim an insert passed unless it was actually executed.

## 5. Validate generic Book Travel persistence

Verify in the safe validation environment that a representative Book Travel row can persist with:

- `destination_type = 'hotels'`;
- `venue_id = null`;
- `source_surface = 'book_travel'`;
- `source_page_type = 'book_travel'`;
- `cta_placement = 'book_travel_view_all_hotels'`;
- non-null `outbound_attribution_id`;
- non-null `session_id`;
- `custom_field3 = attr:{outboundAttributionId}`;
- `custom_field4 = srcp:book_travel`;
- `custom_field5 = place:book_travel_view_all_hotels`; and
- device context.

Do not call `/go/hotels` or contact HotelPlanner merely to validate persistence. Use a direct non-production database validation or an isolated test that cannot follow the redirect or create partner traffic.

## 6. Validate Weekend Planner persistence

Verify in the safe validation environment that a representative Weekend Planner row can persist with:

- `destination_type = 'hotels'`;
- `venue_id = null` when appropriate;
- `source_surface = 'weekend_planner'`;
- `source_page_type = 'weekend_planner'`;
- `cta_placement = 'weekend_planner_view_all_hotels'`;
- non-null `session_id`;
- non-null `outbound_attribution_id`;
- `custom_field3 = attr:{outboundAttributionId}`;
- `custom_field4 = srcp:weekend_planner`;
- `custom_field5 = place:weekend_planner_view_all_hotels`; and
- `custom_field6 = plan:{plannerSessionId}` when a planner session is supplied.

The `/go/hotels` request carries `planner_session_id`, but `ti_outbound_clicks` does not currently store it in a first-class `planner_session_id` column. For this flow, validate its persisted representation in `custom_field6`; do not invent a new column in this task.

Do not alter Planner behavior.

## 7. Validate tournament location-only fallback

Verify that a tournament hotel search without a resolved venue can persist without violating the database contract.

It should retain all legitimate available context, including where supplied:

- tournament ID;
- tournament slug;
- source surface and source page type;
- device type;
- outbound attribution ID; and
- canonical Custom fields.

Do not create a fake venue.

## 8. Venue-backed regression validation

Confirm venue-backed hotel rows remain compatible and preserve real venue IDs.

At minimum validate:

### Venue detail

- venue ID;
- attribution ID;
- session ID;
- placement; and
- tournament context when available.

### Venue map

For `venue_map_view_all_hotels`, confirm persistence of:

- real venue ID;
- tournament ID and slug;
- session ID when supplied by the selected-venue click path;
- placement;
- attribution ID; and
- canonical Custom fields.

### RI venue detail

Do not redesign RI. Confirm the existing RI venue-detail hotel path remains compatible with the relaxed schema contract and continues storing its real venue ID.

## 9. Downstream regression inspection

Inspect only the queries, reports, and code paths that consume hotel outbound rows and could fail or silently exclude valid null-venue rows.

For each relevant consumer, report one of:

- no venue assumption;
- venue optional and already handled;
- intentionally venue-only analysis; or
- requires a focused adjustment for generic hotel rows.

Do not rewrite intentionally venue-specific reports merely because generic hotel rows now exist. Adjust a consumer only if its stated purpose includes generic hotel handoffs and it incorrectly assumes a venue is always present.

## 10. Rollback and forward safety

Document that this is a no-rewrite forward migration.

Do not describe re-adding the old constraint as an automatically safe rollback. Once legitimate null-venue hotel rows exist, restoring the old constraint would fail or require deleting or distorting valid data.

Preferred recovery strategy:

- use a forward corrective migration if an unforeseen issue is found.

If a rollback procedure is documented, it must first inspect for valid null-venue hotel rows and must not delete or fabricate data without separate explicit authorization.

## 11. Scope exclusions

Do **not** use this task to:

- add session propagation to every hotel anchor;
- redesign tournament hotel CTAs;
- redesign venue-map hotel interactions;
- change direct property-card session behavior;
- redesign property-route persistence observability;
- change Owl's Eye;
- change Weekend Pro;
- redesign Weekend Planner;
- create new analytics events;
- change Custom1–Custom8 semantics;
- add `user_id`;
- add a first-class `planner_session_id` column;
- modify HotelPlanner affiliate configuration;
- change RI UX; or
- clean up historical hotel analytics.

Those issues can be evaluated separately if later production evidence identifies a material booking-reconciliation failure. The current priority is eliminating the proven database rejection.

## 12. Production rollout and read-only verification

Perform this section only if production migration/deployment was separately and explicitly authorized.

Before production application:

- confirm the forward migration is the only required schema change;
- confirm no destructive data rewrite is present;
- inspect current null-venue assumptions;
- record the migration and verification timestamps; and
- confirm the safe validation results.

After production application, use read-only inspection to verify:

- the named constraint is absent or correctly replaced;
- no new `23514` failures from `ti_outbound_clicks_destination_type_hotels_requires_venue_id` occur after the migration timestamp;
- venue-backed hotel rows continue persisting; and
- organic generic Book Travel or Weekend Planner rows persist when such traffic occurs.

Do not generate HotelPlanner traffic or synthetic production rows solely for verification.

If no organic generic traffic occurs during the observation window, report **insufficient production evidence** for organic generic-row persistence. Structural completion may still be established through production schema inspection and the successful non-production transactional validation; do not fabricate traffic to obtain stronger evidence.

## Deliverables

Implement the migration and create:

`docs/reports/ti-generic-hotel-outbound-persistence-constraint-fix-2026-08-10.md`

The report must include:

### Root cause

Confirm the schema/application mismatch.

### Migration

State exactly what constraint was changed or removed and why. Include the migration filename.

### Downstream assumptions

List relevant query, report, and code consumers that assumed all hotel rows had a venue, whether each assumption is intentional, and whether an adjustment was required.

### Generic-flow validation

Report actual validation results for:

- Book Travel;
- Weekend Planner; and
- tournament location-only fallback.

### Venue-backed regression validation

Report actual validation results for:

- venue detail;
- venue map; and
- RI venue-detail compatibility.

### Production observability

If production application was authorized and performed, report whether new matching `23514` failures occurred after the migration timestamp, using read-only evidence only.

If production application was not authorized or organic qualifying traffic did not occur, state that clearly and use **not performed** or **insufficient production evidence** rather than implying success.

### Validation

Report only checks actually performed:

- migration and schema validation;
- transactional database validation;
- typecheck;
- lint;
- focused tests;
- build; and
- production read-only inspection, if authorized and performed.

Do not list a check as passing if it was skipped or unavailable.

## Acceptance criteria

The implementation is complete when all structurally testable criteria pass:

- a new forward migration permits valid hotel rows with `venue_id = null`;
- a representative Book Travel row persists in the safe validation environment;
- a representative Weekend Planner row persists in the safe validation environment;
- a representative tournament location-only row persists in the safe validation environment;
- venue-backed rows still preserve their real venue IDs;
- canonical `Custom3 → outbound_attribution_id` reconciliation remains intact;
- session and placement fields persist when supplied;
- Weekend Planner's planner session is preserved as `custom_field6 = plan:{plannerSessionId}` when supplied;
- no fake venue IDs are introduced;
- no unrelated integrity constraints are weakened;
- no existing valid rows are rewritten;
- HotelPlanner user behavior and affiliate semantics remain unchanged; and
- the old venue-required constraint can no longer produce the confirmed `23514` failure in the production-equivalent schema.

Production observation is evaluated separately:

- if production rollout is authorized and organic qualifying traffic occurs, confirm that the former constraint error does not recur and that generic rows persist;
- if no organic qualifying traffic occurs, report insufficient production evidence without blocking structural acceptance; and
- if production rollout is not authorized, report production application and observation as not performed.

## Final rule

Fix the data model to reflect legitimate product behavior.

Do not distort product behavior to satisfy an obsolete analytics constraint.

After this is deployed and validated, stop expanding hotel attribution unless new production evidence identifies another material booking-reconciliation failure.
