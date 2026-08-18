# Corralio Notes

## 2026-08-18 — Slice 2 household and schedule data foundation (applied and verified)

- Applied the reviewed Slice 2 migration to the production Supabase project for private, household-owned Corralio data:
  - households and V1 owner memberships
  - children and teams
  - sensitive ICS schedule sources
  - manual and imported schedule events
- Authorization is household-membership based. Anonymous access is denied, authenticated access is row-scoped with RLS, and composite foreign keys prevent cross-household child, team, or source references.
- Household creation is limited to the idempotent `corralio_ensure_owner_household` RPC. It derives the user from `auth.uid()`, uses a transaction advisory lock, accepts no caller-supplied user ID, and runs as `SECURITY DEFINER` with a locked `search_path`.
- Calendar source URLs are treated as bearer-like secrets:
  - authenticated clients have no `SELECT` privilege on `corralio_schedule_sources.source_url`;
  - authenticated reads must request the explicit safe metadata columns;
  - schedule-source creation and replacement URL writes use narrowly granted RPCs that return no URL;
  - authenticated clients receive no direct schedule-source `INSERT` or `UPDATE` privilege, avoiding constraint-error paths that could expose the protected column;
  - future refresh workers may read URLs only through trusted service-role access;
  - URLs must not appear in logs, analytics, error payloads, or ordinary API responses.
- Authenticated clients may read imported events but cannot create, update, or delete them. Manual events remain household-owner writable.
- Imported-event suppression is deliberately deferred until a refresh flow and user-facing imported-event hide/delete behavior exist.
- Full account and household deletion semantics are deliberately deferred. The membership FK follows the repository's existing `auth.users on delete cascade` convention, but no cross-schema trigger deletes an ownerless household or its private records. Ownerless cleanup requires a separately reviewed design before production scale.
- Completed the controlled, rollback-only production verification covering anonymous denial, RPC idempotency, household isolation, explicit child/team/event household-reassignment denial, composite-FK isolation, membership-write denial, source URL column protection, cross-household source mutation denial, trusted URL access, positive manual-event mutation, imported-event immutability, explicit Team B/Event B isolation, and the currently intentional ownerless-household FK behavior.
- Confirmed the verification transaction rolled back completely: synthetic user, household, child, team, and event counts were all zero afterward.
- Completed the read-only production catalog audit:
  - all six Corralio private tables have RLS enabled;
  - all 15 policies are scoped to `authenticated`, with no `anon` or `PUBLIC` policy;
  - authenticated schedule-source reads expose only the ten approved metadata columns and exclude `source_url`;
  - authenticated table-level schedule-source access is `DELETE` only, with creation and URL replacement confined to the reviewed RPCs;
  - the three authenticated RPCs are `postgres`-owned `SECURITY DEFINER` functions with locked `search_path`, denied to `anon`, and executable by `authenticated` and `service_role`;
  - the `postgres`-owned timestamp trigger helper is not `SECURITY DEFINER` and is not executable by `anon` or `authenticated`.

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
