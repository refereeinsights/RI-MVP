# Referee Insights (`apps/referee`)

Primary Next.js app in this repo: Referee Insights (RI).

## What’s here

- App Router UI + API routes under `app/`
- Server/domain logic under `src/`
- Supabase integration (auth, DB writes via service role where required)
- Admin tooling for tournament ingestion + enrichment (see root `README.md`)

## Local dev

From repo root:

```bash
npm run dev --workspace referee-app
```

Default dev server: `http://127.0.0.1:3000`.
