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

## CSV Ingestion Tool

Use `tsx scripts/ingest-csv.ts [options] <path-to-csv>` to push tournament rows from a CSV into Supabase.

- Columns must include `name`, `state`, `source_url`, and either a `source` column or `--source=<source>` CLI flag. Optional columns (city, level, start_date, end_date, etc.) will be picked up automatically.
- Run with `--dry-run` first to validate rows without writing: `tsx scripts/ingest-csv.ts --dry-run --source=us_club_soccer ./path/to/file.csv`.
- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your environment before running without `--dry-run`.

## Referee review schema

The new referee review UI expects the following database objects:

1. `profiles` table gains a boolean `is_referee_verified default false`. Only admins should flip this flag. RLS should allow a user to select their own row.
2. `tournament_referee_reviews` table (RLS on) with at least: `id uuid primary key default gen_random_uuid()`, `tournament_id uuid references tournaments`, `user_id uuid references auth.users`, `created_at timestamptz default now()`, `overall_score smallint`, `logistics_score smallint`, `facilities_score smallint`, `pay_score smallint`, `support_score smallint`, `worked_games smallint`, `shift_detail text`, `status text default 'pending'`. RLS: verified users can `insert` with `auth.uid() = user_id`, and no direct `select`.
3. `tournament_referee_reviews_public` view that exposes sanitized fields for the UI by joining `tournament_referee_reviews` with `profiles` (to pull `handle`/`years_refereeing` as `reviewer_handle`/`reviewer_level`) and filtering to rows where `status = 'approved'`.
4. `tournament_referee_scores` materialized table/view storing one row per tournament with: `tournament_id`, `ai_score numeric`, `review_count integer`, `summary text`, `status text default 'clear'`, `updated_at timestamptz`. Grant read access to the anon role.
5. A cron/Edge Function that (a) ingests new referee reviews, (b) recomputes the whistle score (simple weighted average, or call your moderation/LLM pipeline), (c) sets `status = 'needs_moderation'` when the computed score < 50 or when abuse filters trip, and (d) writes a short `summary`.

Whenever `tournament_referee_reviews` changes you should also enqueue your “AI whistle score” worker so the badge/summary stays current.

## Low-score alert emails

Set the following environment variables to enable automatic admin alerts whenever an individual category score falls below 50:

- `RESEND_API_KEY`: Server-side API key for https://resend.com (or compatible endpoint our helper calls).
- `REVIEW_ALERT_EMAILS`: Comma-separated list of admin email addresses that should receive the alert.
- `REVIEW_ALERT_FROM` (optional): Custom “from” value if you don’t want the default `Referee Insights <refereeinsights@gmail.com>`.

Without these variables the alert request is skipped but the referee review submission still succeeds.

## Handle moderation

User handles are automatically normalized (lowercase, underscores, 20 characters max) and checked against a small list of banned words/slurs. You can extend the blocklist by setting `PROHIBITED_HANDLE_TERMS` to a comma-separated list (e.g. `PROHIBITED_HANDLE_TERMS="term1,term2"`). Any handle containing those sequences will be rejected both on signup and during automatic profile creation.

## Contributing

Feel free to submit issues and pull requests to improve this project. 

## License

This project is licensed under the MIT License.
