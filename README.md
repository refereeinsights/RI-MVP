# README.md

# My Next.js App

This is a Next.js application built with TypeScript. It serves as a template for creating modern web applications using React and Next.js.

## Project Structure

The project has the following structure:

```
my-next-app
├── app
│   ├── layout.tsx       # Layout component for the application
│   ├── page.tsx         # Main entry point for the application
│   └── globals.css       # Global CSS styles
├── package.json          # NPM configuration file
├── next.config.js        # Next.js configuration file
├── tsconfig.json         # TypeScript configuration file
├── next-env.d.ts         # TypeScript definitions for Next.js
├── .gitignore            # Git ignore file
└── README.md             # Project documentation
```

## Getting Started

To get started with this project, follow these steps:

1. **Clone the repository:**
   ```
   git clone <repository-url>
   cd my-next-app
   ```

2. **Install dependencies:**
   ```
   npm install
   ```

3. **Run the development server:**
   ```
   npm run dev
   ```

4. **Open your browser and navigate to:**
   ```
   http://localhost:3000
   ```

## Scripts

- `dev`: Starts the development server.
- `build`: Builds the application for production.
- `start`: Starts the production server.

## Admin tournament tools (MVP)

- Paste URL → Draft + Enrichment: in the admin “Tournament uploads” tab you can paste a tournament URL, choose a sport, and it will fetch metadata (title/description/dates/location), create a draft tournament, and queue the enrichment job automatically.
- Ops dashboard: visit `/admin/tournaments/dashboard` (admin only) to filter by sport/state/date and view counts, coverage, enrichment success, and “needs attention” rows.

## CSV Ingestion Tool

Use `tsx scripts/ingest-csv.ts [options] <path-to-csv>` to push tournament rows from a CSV into Supabase.

- Columns must include `name`, `state`, `source_url`, and either a `source` column or `--source=<source>` CLI flag. Optional columns (city, level, start_date, end_date, etc.) will be picked up automatically.
- Run with `--dry-run` first to validate rows without writing: `tsx scripts/ingest-csv.ts --dry-run --source=us_club_soccer ./path/to/file.csv`.
- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your environment before running without `--dry-run`.

## Tournament submission subtype

We track how each tournament entered the system so admins can prioritize vetting. Add the `sub_type` column (and seed existing rows) with:

```sql
alter table public.tournaments
  add column if not exists sub_type text
  check (sub_type in ('internet','website','paid','admin'))
  default 'internet';

update public.tournaments
  set sub_type = 'internet'
  where sub_type is null;
```

- `internet`: default for crawled/imported events.
- `website`: submissions via the public `/tournaments/list` form.
- `paid`: reserved for future promoted listings.
- `admin`: records created manually inside the admin dashboard.

Once the column exists, redeploy so the new form and admin UI surface the subtype.

### Cash-tournament flag

Public submissions can now flag tournaments that pay crews in cash. Add the boolean column with:

```sql
alter table public.tournaments
  add column if not exists ref_cash_tournament boolean default false;
```

Rows with `NULL` are treated as `false`.

## Tournament series aggregation

Many tournaments repeat yearly. The UI now groups “series” together so a 2026 event inherits the whistle score and recent reviews from 2025, 2024, etc. To opt into this behavior:

- Slug pattern: give the canonical event a slug plus year suffix, e.g. `jr-hardwood-invite-2025`, `jr-hardwood-invite-2026`. The helper in `lib/tournamentSeries.ts` trims a trailing `-YYYY` to find the series slug.
- Canonical rows: keep importing new years as separate rows (`is_canonical = true` only on the current year). As long as the slug follows the `base-YYYY` pattern the new row is automatically associated with prior years.
- Retroactive data: if an older row did not include a year suffix you can manually update its slug or create a duplicate row with the correct naming. The aggregation query fetches both exact matches and `slug` values that start with `base-`.
- Whistle metrics: `aggregateWhistleScoreRows` weights AI scores by review count across every tournament ID in the series. Referee review lists also pull the latest 10 submissions from all years, so referees can see historical context immediately.

If you ever need to break a tournament out of a series, just change its slug to a unique base that does not share the same prefix.

## Referee review schema

The new referee review UI expects the following database objects:

1. `profiles` table gains a boolean `is_referee_verified default false`. Only admins should flip this flag. RLS should allow a user to select their own row.
2. `tournament_referee_reviews` table (RLS on) with at least: `id uuid primary key default gen_random_uuid()`, `tournament_id uuid references tournaments`, `user_id uuid references auth.users`, `created_at timestamptz default now()`, `overall_score smallint`, `logistics_score smallint`, `facilities_score smallint`, `pay_score smallint`, `support_score smallint`, `worked_games smallint`, `shift_detail text`, `status text default 'pending'`. RLS: verified users can `insert` with `auth.uid() = user_id`, and no direct `select`.
3. `tournament_referee_reviews_public` view that exposes sanitized fields for the UI by joining `tournament_referee_reviews` with `profiles` (to pull `handle`/`years_refereeing` as `reviewer_handle`/`reviewer_level`) and filtering to rows where `status = 'approved'`.
4. `tournament_referee_scores` materialized table/view storing one row per tournament with: `tournament_id`, `ai_score numeric`, `review_count integer`, `summary text`, `status text default 'clear'`, `updated_at timestamptz`. Grant read access to the anon role.
5. A cron/Edge Function that (a) ingests new referee reviews, (b) recomputes the whistle score (simple weighted average, or call your moderation/LLM pipeline), (c) sets `status = 'needs_moderation'` when the computed score < 50 or when abuse filters trip, and (d) writes a short `summary`.

All score fields are stored as integers from 1–5 (number of “whistles”). Convert legacy percentage data before surfacing it in the UI.

Whenever `tournament_referee_reviews` changes you should also enqueue your “AI whistle score” worker so the badge/summary stays current.

## Tournament Site Harvester (MVP)

- Apply SQL migration: `supabase/migrations/20250105_tournament_enricher.sql` (creates job + candidate tables with admin-only RLS).
- Admin UI: `/admin/tournaments/enrichment` (select tournaments with URLs, queue jobs, run now, review recent jobs).
- Backend runner: POST `/api/admin/tournaments/enrichment/run?limit=10` (admin/service only) pulls queued jobs, fetches up to 8 pages per tournament, extracts contacts/venues/referee comp signals deterministically (no LLM).
- Queue jobs: POST `/api/admin/tournaments/enrichment/queue` with `{"tournament_ids":["..."]}` (admin only).
- Environment: uses existing Supabase service role (`SUPABASE_SERVICE_ROLE_KEY`). Optional admin header for run endpoint: `x-admin-secret` matching `ADMIN_SECRET`.
- Smoke tests: `scripts/smoke.sh` (Supabase/Places), enrichment tests: `npm run test` in `apps/referee`.
- Rate limits: 10s fetch timeout, 1MB cap, 8 pages max, per-domain 500ms delay; PDF links recorded without download.

## Low-score alert emails

Set the following environment variables to enable automatic admin alerts whenever an individual category score falls below 50:

- `RESEND_API_KEY`: Server-side API key for https://resend.com (or compatible endpoint our helper calls).
- `REVIEW_ALERT_EMAILS`: Comma-separated list of admin email addresses that should receive the alert.
- `REVIEW_ALERT_FROM` (optional): Custom “from” value if you don’t want the default `Referee Insights <refereeinsights@gmail.com>`.

Without these variables the alert request is skipped but the referee review submission still succeeds. Alerts fire when any whistle rating is below 3 (≤2 out of 5).

## Error monitoring (Sentry)

We use `@sentry/nextjs` for automatic error reporting. Configure these env vars to enable it:

- `SENTRY_DSN` (or `NEXT_PUBLIC_SENTRY_DSN` for client-side capture)
- Optional: `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_REPLAYS_SESSION_SAMPLE_RATE`, `SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`

If no DSN is provided, Sentry stays disabled locally.

## Feedback intake (Google Sheets)

The public `/feedback` page posts to `/api/feedback`, which appends rows into a Google Sheet using a service account. Required environment variables:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (replace literal `\n` with actual newlines)
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_TAB_NAME` (optional, defaults to `feedback`)

One-time setup: run `npx tsx scripts/createFeedbackSheet.ts` to create a spreadsheet titled “RI MVP Feedback” with the correct header row. The script prints the spreadsheet ID—save it to `GOOGLE_SHEETS_SPREADSHEET_ID`.

## Google Places (school reviews)

Verified referees can now submit reviews for individual schools. The school search field calls Google Places Text Search so we can normalize addresses and avoid duplicates. Add the following env var wherever the API runs:

- `GOOGLE_PLACES_API_KEY` — server-side key with Places API + Places API (New) enabled. No referer restrictions if it’s only used on the server.

The `/api/schools/search` route proxies these requests and the `/api/schools/reviews` handler ensures the Supabase `schools` table is populated or re-used per Google Place ID.

## School review schema

To power the `/schools/review` flow you’ll need the following tables/views (patterns match the tournament reviews):

```sql
-- 1. Canonical school directory
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  state text not null,
  address text,
  slug text not null unique,
  google_place_id text unique,
  latitude double precision,
  longitude double precision,
  created_at timestamptz default now()
);

-- 2. Raw school reviews (only verified refs can insert)
create table public.school_referee_reviews (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  sport text not null default 'soccer',
  overall_score smallint not null,
  logistics_score smallint not null,
  facilities_score smallint not null,
  pay_score smallint not null,
  support_score smallint not null,
  worked_games smallint,
  shift_detail text,
  status text not null default 'pending'
);

-- RLS: verified refs can insert their own row, no select.
alter table public.school_referee_reviews enable row level security;
create policy "verified refs insert school reviews"
  on public.school_referee_reviews
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and coalesce(p.is_referee_verified, false) = true
    )
  );

-- 3. Public view for the UI (join with profiles/badges as needed)
create view public.school_referee_reviews_public as
select
  r.id,
  r.school_id,
  r.created_at,
  r.overall_score,
  r.logistics_score,
  r.facilities_score,
  r.pay_score,
  r.support_score,
  r.worked_games,
  r.shift_detail,
  s.name as school_name,
  s.city as school_city,
  s.state as school_state,
  p.handle as reviewer_handle,
  p.years_refereeing as reviewer_level
from public.school_referee_reviews r
join public.profiles p on p.user_id = r.user_id
left join public.schools s on s.id = r.school_id
where r.status = 'approved';

grant select on public.school_referee_reviews_public to anon;

-- 4. Aggregated scores (same schema as tournament_referee_scores)
create table public.school_referee_scores (
  school_id uuid primary key references public.schools(id) on delete cascade,
  ai_score numeric,
  review_count integer default 0,
  summary text,
  status text default 'clear',
  updated_at timestamptz default now()
);

grant select on public.school_referee_scores to anon;
```

Run your existing whistle-score worker against `school_referee_reviews` so `school_referee_scores` stays current. Once these objects exist, the `/api/schools/reviews` endpoint and UI will work end-to-end.

## Handle moderation

User handles are automatically normalized (lowercase, underscores, 20 characters max) and checked against a small list of banned words/slurs. You can extend the blocklist by setting `PROHIBITED_HANDLE_TERMS` to a comma-separated list (e.g. `PROHIBITED_HANDLE_TERMS="term1,term2"`). Any handle containing those sequences will be rejected both on signup and during automatic profile creation.

## Assignor Directory public beta checklist

- Logged out: `/assignors` shows masked email/phone only, no `mailto:`/`tel:` links, and a sign-in CTA.
- Logged in (terms not accepted): masked contact info with “Accept & Reveal” prompt; accepting terms updates `profiles.contact_terms_accepted_at`.
- Logged in (terms accepted): Reveal button returns full email/phone and logs to `contact_access_log`.
- Rate limiting: multiple reveals over limit returns 429 and blocks additional reveals.
- Claim/remove: `/assignors/claim?assignor_id=<id>` inserts into `assignor_claim_requests` and shows thank-you state.
- RLS: anon cannot select from `assignor_contacts` or `contact_access_log`.

## Contributing

Feel free to submit issues and pull requests to improve this project. 

## License

This project is licensed under the MIT License.
