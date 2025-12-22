# Route Inventory (App Router)

## apps/referee (RefereeInsights)
| Path | Type | File | Purpose | Auth (best-effort) |
| --- | --- | --- | --- | --- |
| `/` | page | app/page.tsx | Landing/hero | Public |
| `/tournaments` | page | app/tournaments/page.tsx | Tournament insights listing | Public |
| `/tournament-insights` | page | app/tournament-insights/page.tsx | Alias to tournaments page (UI) | Public |
| `/tournaments/list` | page | app/tournaments/list/page.tsx | Tournament submission form | Public submit (server validates) |
| `/tournaments/[slug]` | page | app/tournaments/[slug]/page.tsx | Tournament detail + actions | Public; review submission gated by auth/verification |
| `/schools` | page | app/schools/page.tsx | School insights listing | Public |
| `/schools/review` | page | app/schools/review/page.tsx | School review submission | Auth required to submit |
| `/school-insights` | page | app/school-insights/page.tsx | Alias to schools insights | Public |
| `/reviews/new` | page | app/reviews/new/page.tsx | Generic review entry | Likely auth |
| `/account` | page | app/account/page.tsx | User account profile | Auth |
| `/account/login` | page | app/account/login/page.tsx | Login form | Public |
| `/auth/reset` | page | app/auth/reset/page.tsx | Password reset | Public |
| `/admin` | page | app/admin/page.tsx | Admin dashboard | Admin auth |
| `/admin/login` | page | app/admin/login/page.tsx | Admin login | Public |
| `/signup` | page | app/signup/page.tsx | Signup | Public |
| `/feedback` | page | app/feedback/page.tsx | Feedback form | Public |
| `/privacy` | page | app/privacy/page.tsx | Privacy policy | Public |
| `/terms` | page | app/terms/page.tsx | Terms | Public |
| `/disclaimer` | page | app/disclaimer/page.tsx | Disclaimer | Public |
| `/how-it-works` | page | app/how-it-works/page.tsx | Info page | Public |
| `/content-standards` | page | app/content-standards/page.tsx | Standards page | Public |
| `/email-preferences` | page | app/email-preferences/page.tsx | Email prefs | Auth |
| `/gear` (+ sports subpaths) | pages | app/gear/**/page.tsx | Gear catalogs (soccer, basketball, football, etc.) | Public |

### API routes
| Path | File | Purpose | Auth check (best-effort) |
| --- | --- | --- | --- |
| `/api/feedback` | app/api/feedback/route.ts | Stores feedback to Supabase; optional GitHub issue | No explicit auth; service key on server |
| `/api/logout` | app/api/logout/route.ts | Clears Supabase auth and redirects | Requires session to logout |
| `/api/cron/whistles` | app/api/cron/whistles/route.ts | Cron-protected job (token check) | Token via `CRON_SECRET` |
| `/api/admin/tournaments/search` | app/api/admin/tournaments/search/route.ts | Admin tournament search | Intended admin auth (enforced server-side) |
| `/api/referee-reviews` | app/api/referee-reviews/route.ts | Submit referee tournament reviews | Requires auth/verification |
| `/api/schools/search` | app/api/schools/search/route.ts | School search | Public |
| `/api/schools/reviews` | app/api/schools/reviews/route.ts | Submit school reviews | Auth expected |

## apps/corp (Tournyx)
| Path | Type | File | Purpose |
| --- | --- | --- | --- |
| `/` | page | apps/corp/app/page.tsx | Tournyx corporate homepage |

## apps/ti-web (TournamentInsights placeholder)
| Path | Type | File | Purpose |
| --- | --- | --- | --- |
| `/` | page | apps/ti-web/app/page.tsx | TournamentInsights coming-soon overview |

## Notes
- Dynamic segments: `/tournaments/[slug]` handles tournament detail pages.
- API routes rely on Supabase service role on the server; client-facing auth handled via Supabase middleware/session.
