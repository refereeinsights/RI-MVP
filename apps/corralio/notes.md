# Corralio Notes

## 2026-08-17 — Initial application shell

- Established Corralio as the independent npm workspace `corralio-app` under `apps/corralio`.
- Added a static, mobile-first, `noindex` landing shell using Next.js 14, React 18, TypeScript, and app-local styling.
- Added minimal manifest metadata without icons, a service worker, offline caching, install prompts, or push behavior.
- Intentionally added no Supabase, authentication, analytics, database, HotelPlanner, data-fetching, or environment-variable requirements.
- Reserved local port 3002 so RefereeInsights and TournamentInsights can continue using ports 3000 and 3001.
- Vercel project creation, deployment, `corralio.com` attachment, and DNS configuration remain manual and were not performed.
- Validation completed from the monorepo root:
  - npm workspace discovery recognizes `corralio-app`.
  - `npm run lint --workspace corralio-app` passes.
  - `npx tsc -p apps/corralio/tsconfig.json --noEmit` passes.
  - `npm run build --workspace corralio-app` passes and emits the landing page and manifest as static routes.
- The root package lock changed only to register the new workspace and its app-local development dependencies.
