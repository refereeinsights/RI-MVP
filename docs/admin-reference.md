## Monorepo Structure
### Key files
- `package.json` (root scripts: smoke, seed, ops aliases)
- `playwright.smoke.config.ts` (smoke runner, loads env from repo + app roots)
- `apps/referee/app/admin/**` (RefereeInsights admin UI routes)
- `apps/referee/app/api/admin/**` (RefereeInsights admin API routes)
- `apps/referee/lib/admin.ts` (`requireAdmin()` and many admin server helpers)
- `apps/referee/lib/trackExternalCall.ts` (external API call tracking constants + wrapper)
- `apps/ti-web/app/admin/**` (TournamentInsights admin UI routes)
- `apps/ti-web/lib/outreachAdmin.ts` (`requireTiOutreachAdmin()` gate for TI admin pages)
- `apps/ti-web/lib/trackExternalCall.ts` (TI external API call tracking constants + wrapper)
- `supabase/migrations/**` (DB schema: tables/views/RPCs used by admin and ops)
- `scripts/ops/**` (ops scripts that mutate or audit Supabase data)

This monorepo contains two Next.js App Router apps plus Supabase migrations and ops scripts:
- `apps/referee` = RefereeInsights (RI) + the primary **admin UI** and **admin APIs** (`/admin/**`, `/api/admin/**`).
- `apps/ti-web` = TournamentInsights (TI) public site plus a small TI admin surface (`/admin/**`) primarily gated by an email allowlist.
- `supabase/migrations` = the schema source of truth (tables/views/functions/RPCs).
- `scripts/ops` and `scripts/ingest` = operational scripts that use service-role DB access.

Service role usage pattern:
- Server-side admin features typically use `supabaseAdmin` (service role client) to bypass RLS and read/write privileged tables.
- End-user features use a cookie-based server client (`createSupabaseServerClient()`) and are constrained by RLS.

---

## Admin Routes
### Key files
- RefereeInsights admin routes: `apps/referee/app/admin/**`
- RefereeInsights admin APIs: `apps/referee/app/api/admin/**`
- TournamentInsights admin routes: `apps/ti-web/app/admin/**`
- RefereeInsights auth gate: `apps/referee/lib/admin.ts` (`requireAdmin()`)
- TournamentInsights auth gate: `apps/ti-web/lib/outreachAdmin.ts` (`requireTiOutreachAdmin()`)

### RefereeInsights admin UI (Next.js App Router)
Admin page routes are implemented as `page.tsx` under `apps/referee/app/admin/**`. Notable routes include:
- `/admin` → `apps/referee/app/admin/page.tsx`
- `/admin/login` → `apps/referee/app/admin/login/page.tsx`
- `/admin/api-usage` → `apps/referee/app/admin/api-usage/page.tsx`
- `/admin/ti` → `apps/referee/app/admin/ti/page.tsx`
- `/admin/ti/clicks` → `apps/referee/app/admin/ti/clicks/page.tsx`
- `/admin/ti/revenue` → `apps/referee/app/admin/ti/revenue/page.tsx`
- `/admin/ti/outbound` → `apps/referee/app/admin/ti/outbound/page.tsx`
- `/admin/ti/static-maps` → `apps/referee/app/admin/ti/static-maps/page.tsx`
- `/admin/ti/seasons` → `apps/referee/app/admin/ti/seasons/page.tsx`
- `/admin/ti/quality` → `apps/referee/app/admin/ti/quality/page.tsx`
- `/admin/ti/discovery` → `apps/referee/app/admin/ti/discovery/page.tsx`
- `/admin/venues` and subroutes → `apps/referee/app/admin/venues/**`
- `/admin/tournaments` and subroutes → `apps/referee/app/admin/tournaments/**`
- `/admin/assignors` and subroutes → `apps/referee/app/admin/assignors/**`
- `/admin/outreach` and subroutes → `apps/referee/app/admin/outreach/**`

Most RI admin pages call `await requireAdmin()` and use `supabaseAdmin` for privileged DB access.

### RefereeInsights admin API routes
Admin API endpoints are implemented as `route.ts` under `apps/referee/app/api/admin/**`. Common groups:
- API usage alarms CRUD / evaluation:
  - `/api/admin/api-usage/alarms` → `apps/referee/app/api/admin/api-usage/alarms/route.ts`
  - `/api/admin/api-usage/check-alarms` → `apps/referee/app/api/admin/api-usage/check-alarms/route.ts`
- Venue admin APIs: `apps/referee/app/api/admin/venues/**`
- Tournament admin APIs: `apps/referee/app/api/admin/tournaments/**`
- TI discovery admin APIs: `apps/referee/app/api/admin/ti/discovery/**` and `.../discovery-v2/**`
- Static map runner: `/api/admin/ti/static-maps/run` → `apps/referee/app/api/admin/ti/static-maps/run/route.ts`

These routes typically use `supabaseAdmin` and may call `requireAdmin()` (directly or indirectly) to enforce admin-only access.

### TournamentInsights admin UI
TI has its own `/admin/**` routes under `apps/ti-web/app/admin/**`:
- `/admin` → `apps/ti-web/app/admin/page.tsx`
- `/admin/dashboard-email` → `apps/ti-web/app/admin/dashboard-email/page.tsx`
- `/admin/dashboard-email/heatmap-us` → `apps/ti-web/app/admin/dashboard-email/heatmap-us/page.tsx`
- `/admin/outreach-dashboard` → `apps/ti-web/app/admin/outreach-dashboard/page.tsx`
- `/admin/outreach-previews` → `apps/ti-web/app/admin/outreach-previews/page.tsx`
- `/admin/outreach-reply` → `apps/ti-web/app/admin/outreach-reply/page.tsx`

These TI admin routes are gated by `requireTiOutreachAdmin()` (email allowlist / dev-mode gate), not by RI’s `requireAdmin()`.

---

## API Usage Tracking
### Key files
- Table migration: `supabase/migrations/20260428_external_api_calls.sql` (`public.external_api_calls`)
- RPC migrations: `supabase/migrations/20260429_api_usage_summary_rpc.sql` and `supabase/migrations/20260505_api_usage_summary_rpc_half_open.sql` (`public.api_usage_summary`)
- TI events RPC: `supabase/migrations/20260505_api_usage_summary_rpc_half_open.sql` (`public.ti_map_event_summary`)
- Alarm table migration: `supabase/migrations/20260505_api_usage_alarms.sql` (`public.api_usage_alarms`)
- RI admin UI: `apps/referee/app/admin/api-usage/page.tsx`
- Alarm CRUD API: `apps/referee/app/api/admin/api-usage/alarms/route.ts`
- Alarm evaluator API: `apps/referee/app/api/admin/api-usage/check-alarms/route.ts`
- Tracking wrapper: `apps/referee/lib/trackExternalCall.ts` and `apps/ti-web/lib/trackExternalCall.ts`

### Storage table: `public.external_api_calls`
Defined in `supabase/migrations/20260428_external_api_calls.sql`.
- Columns:
  - `id bigserial`
  - `api text`
  - `operation text`
  - `surface text`
  - `status text` (`ok` | `error`)
  - `latency_ms integer`
  - `error text`
  - `called_at timestamptz default now()`
- Indexes:
  - `(api, called_at desc)`
  - `(called_at desc)`
- Grants:
  - Service-role only (revoke from `public/anon/authenticated`, grant `select/insert` to `service_role`).

### Aggregation RPC: `public.api_usage_summary(from_ts, to_ts)`
Defined in `supabase/migrations/20260429_api_usage_summary_rpc.sql` and updated in `supabase/migrations/20260505_api_usage_summary_rpc_half_open.sql`.
- Signature:
  - `api_usage_summary(from_ts timestamptz, to_ts timestamptz) returns table(api, operation, surface, calls, errors, avg_latency_ms)`
- Behavior:
  - Aggregates `external_api_calls` in a half-open time window: `called_at >= from_ts AND called_at < to_ts`.
  - `errors` = count of rows where `status = 'error'`.
  - `avg_latency_ms` = rounded average of `latency_ms`.
- Security:
  - `security definer`, execute granted to `service_role` only.

### TI map events aggregation RPC: `public.ti_map_event_summary(from_ts, to_ts, event_names)`
Defined in `supabase/migrations/20260505_api_usage_summary_rpc_half_open.sql`.
- Signature:
  - `ti_map_event_summary(from_ts timestamptz, to_ts timestamptz, event_names text[]) returns table(event_name, calls)`
- Behavior:
  - Counts events in `public.ti_map_events` within `[from_ts, to_ts)` filtered to `event_name = any(event_names)`.

### RI admin UI: `/admin/api-usage`
Implemented in `apps/referee/app/admin/api-usage/page.tsx`:
- Gated by `await requireAdmin()`.
- Uses `supabaseAdmin.rpc("api_usage_summary", { from_ts, to_ts })` for the selected range and for MTD totals.
- Uses `supabaseAdmin.rpc("ti_map_event_summary", { from_ts, to_ts, event_names })` for a small set of TI event names (currently `venue_map_opened`, `venue_map_loaded`) to connect engagement to usage.
- UI includes:
  - per-(api,operation,surface) rows (calls/errors/avg latency)
  - vendor totals (calls/errors/avg latency aggregated client-side from RPC result)
  - free-tier gauges/limits and range filter helpers

### Alarms: `public.api_usage_alarms` + admin endpoints
- Table: `public.api_usage_alarms` (see `supabase/migrations/20260505_api_usage_alarms.sql`)
- Admin CRUD endpoint: `apps/referee/app/api/admin/api-usage/alarms/route.ts`
- Evaluator endpoint: `apps/referee/app/api/admin/api-usage/check-alarms/route.ts`
  - Uses `supabaseAdmin.rpc("api_usage_summary", ...)` and compares against configured thresholds.

---

## trackExternalCall
### Key files
- RI implementation: `apps/referee/lib/trackExternalCall.ts`
- TI implementation: `apps/ti-web/lib/trackExternalCall.ts`
- Storage table: `supabase/migrations/20260428_external_api_calls.sql` (`public.external_api_calls`)

### Function signature
Both apps expose the same signature:
```ts
export async function trackExternalCall<T>(
  api: string,
  operation: string,
  surface: string,
  fn: () => Promise<T>
): Promise<T>
```

### Behavior (common)
- Measures latency (`Date.now()` around `fn()`).
- Inserts a row into `public.external_api_calls` with:
  - `api`, `operation`, `surface`
  - `status` (`ok` or `error`)
  - `latency_ms`
  - `error` (truncated message) when status=`error`
- “Fail-open” insertion: insertion is done async and does not block the caller.
- Debug logging:
  - If insert fails and `EXTERNAL_API_CALL_TRACKING_DEBUG === "true"`, logs a warning.

### Enablement / env gates
RI (`apps/referee/lib/trackExternalCall.ts`):
- Tracking enabled when:
  - `NODE_ENV !== "development"` OR `ENABLE_EXTERNAL_API_CALL_TRACKING === "true"`.
TI (`apps/ti-web/lib/trackExternalCall.ts`):
- Tracking enabled when:
  - `NODE_ENV !== "development"` OR `ENABLE_EXTERNAL_API_CALL_TRACKING === "true"` OR
  - `surface === EXTERNAL_API_SURFACE.static_map_cron` (special case to record cron usage in local dev).

---

## External APIs (EXTERNAL_API constants)
### Key files
- RI constants: `apps/referee/lib/trackExternalCall.ts`
- TI constants: `apps/ti-web/lib/trackExternalCall.ts`
- RI API usage alarms allowlist uses these values: `apps/referee/app/api/admin/api-usage/alarms/route.ts`

### RefereeInsights `EXTERNAL_API`
Defined in `apps/referee/lib/trackExternalCall.ts`:
```ts
export const EXTERNAL_API = {
  google_places: "google_places",
  foursquare: "foursquare",
  mapbox: "mapbox",
  resend: "resend",
  open_meteo: "open_meteo",
  brave_search: "brave_search",
  bing_search: "bing_search",
  serpapi: "serpapi",
  overpass: "overpass",
  timezonedb: "timezonedb",
  perplexity: "perplexity",
} as const;
```

### TournamentInsights `EXTERNAL_API`
Defined in `apps/ti-web/lib/trackExternalCall.ts`:
```ts
export const EXTERNAL_API = {
  google_places: "google_places",
  mapbox: "mapbox",
  resend: "resend",
  open_meteo: "open_meteo",
} as const;
```

Notes:
- The storage table `external_api_calls.api` is `text` and can store additional values, but the admin UI and alarm allowlists are driven by these constants.

---

## External API Surfaces (EXTERNAL_API_SURFACE constants)
### Key files
- RI constants: `apps/referee/lib/trackExternalCall.ts`
- TI constants: `apps/ti-web/lib/trackExternalCall.ts`

### RefereeInsights `EXTERNAL_API_SURFACE`
Defined in `apps/referee/lib/trackExternalCall.ts`:
```ts
export const EXTERNAL_API_SURFACE = {
  owls_eye_batch: "owls_eye_batch",
  owls_eye_gear: "owls_eye_gear",
  venue_geocode: "venue_geocode",
  venue_timezone: "venue_timezone",
  venue_places_lookup: "venue_places_lookup",
  venue_address_verify: "venue_address_verify",
  tournament_enrichment: "tournament_enrichment",
  email_alert: "email_alert",
  email_digest: "email_digest",
  email_transactional: "email_transactional",
  venue_field_map: "venue_field_map",
  atlas_search: "atlas_search",
  tournament_scan: "tournament_scan",
  ti_discovery: "ti_discovery",
} as const;
```

### TournamentInsights `EXTERNAL_API_SURFACE`
Defined in `apps/ti-web/lib/trackExternalCall.ts`:
```ts
export const EXTERNAL_API_SURFACE = {
  static_map_cron: "static_map_cron",
  weather_widget: "weather_widget",
  zip_geocode: "zip_geocode",
  email_transactional: "email_transactional",
  hotel_redirect: "hotel_redirect",
} as const;
```

Notes:
- Surfaces are used to attribute calls to features/routes/scripts (e.g., Owl’s Eye batch enrichment vs a venue address verify tool vs a cron job).

---

## Scripts
### Key files
- Root scripts: `package.json`
- Ops scripts: `scripts/ops/**`
- Ingest scripts: `scripts/ingest/**`
- Smoke seeding: `apps/ti-web/scripts/seed_smoke_test_users.ts`
- Playwright smoke runner: `playwright.smoke.config.ts`

This repo contains many scripts; the admin/ops-relevant ones typically require service-role Supabase access.

### Common prerequisites
- Run from repo root: `/Users/roddavis/RI_MVP/RI-MVP`
- Common required env vars for scripts that touch Supabase:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Many scripts are TypeScript and run via `tsx`:
  - Examples use `node --import tsx ...` or `npx tsx ...` depending on the script.

### Common commands (root `package.json`)
- Smoke tests:
  - `npm run test:smoke` (Playwright config: `playwright.smoke.config.ts`)
  - `npm run test:smoke:ui` (headed)
- Seed TI smoke users (Supabase Auth + profiles):
  - `npm run seed:smoke:users`
  - Runs `tsx apps/ti-web/scripts/seed_smoke_test_users.ts`
  - Controlled by env vars in `apps/ti-web/.env.local` such as:
    - `TI_SMOKE_SEED_ALLOW`
    - `TI_SMOKE_EXPLORER_EMAIL`, `TI_SMOKE_EXPLORER_PASSWORD`
    - `TI_SMOKE_INSIDER_EMAIL`, `TI_SMOKE_INSIDER_PASSWORD`
    - `TI_SMOKE_WEEKENDPRO_EMAIL`, `TI_SMOKE_WEEKENDPRO_PASSWORD`
- Ops alias:
  - `npm run ops:flag-long-tournaments`
  - Runs `node --import tsx scripts/ops/flag_long_tournaments.ts --apply`

### Notable ops scripts (examples)
These live in `scripts/ops/` and are typically run with service-role credentials:
- `scripts/ops/flag_long_tournaments.ts`
  - Flags suspicious tournament date ranges (often used with related quality tables/views).
- `scripts/ops/scan_tournament_seasons_2027.ts`
  - Seasonal scanning workflow; note this script references `trackExternalCall` behavior.
- `scripts/ops/import_season_scan_csv.ts`
  - Imports prior scan CSV output into DB tables without re-running external searches.
- `scripts/ops/apply_high_confidence_draft_venues.ts`
  - Applies high-confidence venue draft rows (writes to DB; typically run with `--limit/--offset`).
- `scripts/ops/update_missing_director_emails_from_csv.mjs`
  - Batch updates missing director emails from a CSV input.

Guidance for safe operation:
- Prefer “dry run” modes when offered; only use `--apply` or write modes when intended.
- Many scripts have `--limit/--offset` for incremental runs.
- If a script calls external APIs, verify whether `ENABLE_EXTERNAL_API_CALL_TRACKING` is enabled (for usage visibility) and ensure you understand quotas/cost.

---

## Auth (requireAdmin)
### Key files
- RI admin gate: `apps/referee/lib/admin.ts` (`requireAdmin()`)
- RI admin login page: `apps/referee/app/admin/login/page.tsx`
- RI profile table reads: `apps/referee/lib/admin.ts` (`profiles.role`)
- TI admin gate (email allowlist): `apps/ti-web/lib/outreachAdmin.ts` (`requireTiOutreachAdmin()`)

### `requireAdmin()` (RefereeInsights)
Defined in `apps/referee/lib/admin.ts`:
- Behavior:
  - Uses `createSupabaseServerClient()` (cookie-based) to call `auth.getUser()`.
  - If not logged in: `redirect("/admin/login")`.
  - If logged in, checks admin privilege using service role:
    - `supabaseAdmin.from("profiles").select("user_id, role").eq("user_id", user.id).maybeSingle()`
  - If DB read fails: redirects to `/admin/login?error=server_error` (fails “softly”).
  - If role is not `admin`: redirects to `/admin/login?error=not_authorized`.
  - Returns the Supabase user object when authorized.
- Admin role source of truth:
  - `public.profiles.role` must equal `"admin"`.

### `requireTiOutreachAdmin()` (TournamentInsights)
Defined in `apps/ti-web/lib/outreachAdmin.ts`:
- Uses `createSupabaseServerClient()` to get the current user.
- Gate is an allowlist by email:
  - `TI_ADMIN_EMAILS` (comma-separated) or fallback `RI_ADMIN_EMAIL`
  - In non-production, allows access if logged in and allowlist is not configured.
- Redirect behavior:
  - If not logged in: redirects to `/login` with optional `returnTo`.
  - If logged in but not allowed: redirects to `/`.

---

## Planned Features
### Key files
- `NOTES.md`

This section is intentionally sourced from `NOTES.md` only (no speculation). Items below are forward-looking notes present in `NOTES.md` and may already have partial scaffolding in code.

Examples currently noted in `NOTES.md`:
- TI affiliate sync: cron scaffold + rollup table to support pulling publisher transaction totals into admin dashboards later (see `apps/referee/app/api/cron/ti-affiliate-sync/route.ts`, `supabase/migrations/20260503_ti_affiliate_daily_metrics.sql`).
- TI saved tournaments digest enhancements: per-tournament “what changed” summary (see `docs/ti-saved-tournament-change-notifications.md` and referenced TI email job files).
- Admin UI incremental enhancements noted as “next/later” items in various entries (review `NOTES.md` for the most current forward-looking bullets tied to specific file paths).

---

## How to Update This Doc
### Key files
- `docs/admin-reference.md`
- `NOTES.md`

- When adding a new admin UI route, update **Admin Routes** with the new path and file location, and note which tables/RPCs it uses.
- When adding a new admin API route (`route.ts`), update **Admin Routes** and include the endpoint path and its authorization mechanism.
- When adding a new external API integration, add its value to the appropriate `EXTERNAL_API` constant and update **External APIs**.
- When adding a new call site for `trackExternalCall`, ensure the surface string is a constant and update **External API Surfaces** if needed.
- When modifying `external_api_calls` schema or API-usage RPCs, update **API Usage Tracking** with the migration filename and new behavior.
- When adding/changing alarm behavior, update **API Usage Tracking** and include the admin routes that create/evaluate alarms.
- When adding or changing ops scripts, update **Scripts** with how to run them and which env vars they require.
- When changing admin authorization rules, update **Auth (requireAdmin)** and include new failure modes / redirects.
- When adding forward-looking work, record it in `NOTES.md` and then update **Planned Features** to reflect the latest items (do not add items that are not present in `NOTES.md`).

