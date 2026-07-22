# TournamentInsights Venue Hotel Funnel Phase 2 Local Verification

Date: 2026-07-22
Original reviewed commit: `0b32018e`
Local commit was amended after the proven migration fix before handoff.

## Verdict

`FAIL — fix locally before pushing`

## Why this is a fail

- A blocking defect was proven in the pre-push migration and fixed locally.
- A successful local persisted funnel trace was not possible on this machine because no disposable Postgres path is available.
- This repo documents TI as production-only for Supabase UAT, so the required local/disposable persisted trace could not be substituted with a safe non-production remote environment.

## Scope review

- Commit scope is narrow and venue-hotel specific.
- Modified files are limited to venue CTA tracking, funnel helpers, `/go/hotels`, `/api/lodging/search`, analytics persistence, one additive migration, one helper test file, and implementation docs.
- No CTA copy changes were found.
- No new CTA placements were added.
- No group-booking implementation was added.
- No broad analytics or identity rewrite was added.
- No legacy events, columns, or tables were removed.
- The high-volume venue CTA path is included through `apps/ti-web/components/venues/VenueCard.tsx:1`.

## Venue coverage

- `apps/ti-web/components/venues/VenueHotelLink.tsx:1` is the shared venue CTA tracker.
- `apps/ti-web/components/venues/VenueCard.tsx:1` routes the venue directory text link and both card/button placements through the shared tracker.
- `apps/ti-web/components/venues/HotelBookingCta.tsx:1` routes the venue details CTA through the shared tracker.
- `apps/ti-web/components/venues/OwlsEyeVenueCard.tsx:1` reaches the shared tracker via `HotelBookingCta`.
- Remaining `/go/hotels` paths exist outside the venue Phase 2 scope in tournament and planner surfaces.

## Identifier lifecycle findings

- `cta_instance_id` is generated once per mounted CTA instance with `useRef` in `apps/ti-web/components/venues/VenueHotelLink.tsx:27`.
- `cta_instance_id` is reused for impression and click and propagated into tracked `/go/hotels` hrefs.
- `cta_interaction_id` is created only on accepted click attempts and is not created for impressions.
- Click acceptance is guarded by `acceptVenueHotelClickAttempt` in `apps/ti-web/lib/venueHotelFunnel.ts:164`.
- Current venue placements are centrally defined as `page_type = 'venue'` and `flow_type = 'direct_outbound'` in `apps/ti-web/lib/venueHotelFunnel.ts:24`.
- No canonical joins rely on timestamps, referrer parsing, or page-path guessing.

## Persistence findings

- `hotel_cta_impression` persists canonically in `ti_map_events` via `apps/ti-web/app/api/analytics/route.ts:1`.
- `hotel_cta_clicked` persists canonically in `ti_map_events` via `apps/ti-web/app/api/analytics/route.ts:1`.
- `lodging_search_started` persists canonically in `lodging_search_session` via `apps/ti-web/app/api/lodging/search/route.ts:1`.
- `hotel_outbound_clicked` persists canonically in `ti_outbound_clicks` via `apps/ti-web/app/go/hotels/route.ts:609`.
- Legacy `venue_hotels_cta_clicked` remains a secondary compatibility event and is not the canonical click authority.

## Navigation reliability findings

- Click persistence uses the project analytics helper before navigation; the code remains sensitive to normal navigation timing because it does not use `sendBeacon`.
- Navigation is not blocked on analytics failure because `/go/hotels` redirect still proceeds even when outbound persistence fails.
- Click guard state resets after a cooldown and does not permanently disable the link.
- Keyboard activation and `_blank` handling remain intentional through anchor semantics plus click interception.
- The unresolved risk is event loss under real browser navigation, which requires an actual browser + persisted DB trace.

## Deduplication findings

- Impression dedupe is client-side and CTA-instance scoped.
- Click dedupe is client-side and accepted-interaction scoped.
- Search dedupe relies on authoritative `lodging_search_session.id`.
- Outbound dedupe relies on `outbound_request_id`.
- Blocking defect found: `apps/ti-web/app/go/hotels/route.ts:609` writes outbound rows with `onConflict: "outbound_request_id"`, but `supabase/migrations/20260722_ti_venue_hotel_funnel_phase2.sql:1` originally created only a partial unique index on that column.
- Proven basis: PostgreSQL `INSERT ... ON CONFLICT` unique-index inference requires a matching arbiter index; partial unique indexes require a matching predicate in the conflict target. The current write path does not specify one.
- Local fix applied: the migration now creates a normal nullable-column unique index on `ti_outbound_clicks(outbound_request_id)`, which still allows multiple historical `NULL` rows.

## Migration findings

- Migration remains additive and backward compatible.
- New columns remain nullable.
- No historical backfill is attempted.
- The updated unique index is compatible with the `/go/hotels` idempotent write path.
- Rollback remains safe because additive columns can remain in place if application code is rolled back.

## Test and typecheck results

- `node --import tsx --test apps/ti-web/lib/venueHotelFunnel.test.ts apps/ti-web/lib/booking/venueBooking.test.ts` → exit `0`
- `npx tsc -p apps/ti-web/tsconfig.json --noEmit` → exit `0`
- No nearby route-level or migration-level automated tests were present for `/go/hotels`, `/api/analytics`, or `/api/lodging/search`.

## Local controlled trace results

- Not completed.
- This machine does not have `docker`, `postgres`, `initdb`, `pg_ctl`, or `psql`.
- `supabase` CLI is installed, but local Supabase runtime is not usable here without Docker.
- TI repository guidance states the Supabase environment is production-only in `docs/weekend-planner-uat.md:3`, so a remote persisted trace would not satisfy the local/disposable requirement safely.

## SQL validation

- `scripts/analysis/ti_venue_hotel_funnel_queries.sql:1` uses identifier joins rather than timestamp-only joins.
- The query file distinguishes canonical impression/click records from search/outbound server rows.
- The placement aggregation handles direct-outbound placements without requiring search rows.
- Queries were reviewed but not executed because no disposable database was available.

## Defects found

- Fixed: outbound idempotency migration used a partial unique index incompatible with the current `ON CONFLICT` write path.

## Required fixes before push

- Run one successful local or disposable-database persisted funnel trace after applying `supabase/migrations/20260722_ti_venue_hotel_funnel_phase2.sql`.
- Capture one direct-outbound chain proving shared `cta_instance_id` and `cta_interaction_id` across canonical rows.

## Non-blocking follow-up items

- Add a focused automated test around `/go/hotels` outbound idempotency.
- Add a browser-level verification harness for venue CTA impression/click/navigation persistence.
- Expand `scripts/analysis/ti_venue_hotel_funnel_queries.sql` with an explicit duplicate-detection query for `outbound_request_id`.

## Exact commands run

```bash
cat '/Users/roddavis/.codex/attachments/09dece9f-2562-4af8-8dd4-34d2ca8b1788/pasted-text.txt'
git status --short
git show --stat --oneline 0b32018e
git diff 0b32018e^ 0b32018e -- .
rg -n 'go/hotels|HotelPlanner|VenueHotelLink|hotel_cta_|venue_hotels_cta_clicked' apps/ti-web/components/venues apps/ti-web/app
which supabase
which docker
which psql
node -e "try{console.log(require.resolve('pg-mem'))}catch(e){console.log('no-pg-mem')}"
node -e "try{console.log(require.resolve('better-sqlite3'))}catch(e){console.log('no-better-sqlite3')}"
sed -n '1,240p' scripts/analysis/ti_venue_hotel_funnel_queries.sql
sed -n '1,260p' docs/reports/ti-venue-hotel-phase2-2026-07-22.md
sed -n '1,260p' apps/ti-web/app/go/hotels/route.ts
sed -n '1,240p' supabase/migrations/20260722_ti_venue_hotel_funnel_phase2.sql
rg -n "create table .*ti_outbound_clicks|ti_outbound_clicks" supabase apps/ti-web -g '*.sql' -g '*.ts'
sed -n '560,700p' apps/ti-web/app/go/hotels/route.ts
sed -n '1,160p' supabase/migrations/20260412_ti_outbound_clicks.sql
sed -n '1,180p' supabase/migrations/20260420_ti_outbound_clicks_hotels.sql
cat package.json
find .. -name AGENTS.md -print
git rev-parse --short HEAD
node --import tsx --test apps/ti-web/lib/venueHotelFunnel.test.ts apps/ti-web/lib/booking/venueBooking.test.ts
npx tsc -p apps/ti-web/tsconfig.json --noEmit
which postgres || true; which initdb || true; which pg_ctl || true
rg -n "SUPABASE|DATABASE_URL|LOCAL_DB|staging|dev project|supabase start|db reset" -g '.env*' -g '*.md' -g '*.json' -g '*.ts' apps/ti-web supabase docs .
```
