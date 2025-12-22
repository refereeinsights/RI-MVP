# Dependencies

Framework / core
- next (14.2.14)
- react / react-dom (18.3.1)

Backend / data
- @supabase/supabase-js
- @supabase/ssr
- googleapis (used in scripts/helpers)
- cheerio (HTML parsing/ingest utilities)

Monitoring / analytics
- @sentry/nextjs
- posthog-js

Email
- Resend (via `lib/email.ts`)

Tooling / tests
- playwright
- tsx
- typescript
- @types/node, @types/react

Notes
- These versions are duplicated per workspace; refactor to a shared version spec if desired.
- High-impact deps: Supabase SDK (auth/DB), Sentry (error reporting), PostHog (analytics). Ensure envs are configured before deploy.***
