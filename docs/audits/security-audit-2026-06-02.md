# Security Audit — RI-MVP
**Date:** 2026-06-02
**Scope:** Full monorepo (`apps/ti-web`, `apps/referee`) + MCP server (`/Users/projects/MCP`)
**Method:** Static read-only code review — no penetration testing, no runtime testing

---

## Priority Action List

| # | Action | Severity |
|---|--------|----------|
| 1 | Rotate production Supabase service-role key | Critical |
| 2 | Remove cron secrets from `vercel.json`, rotate both tokens | Critical |
| 3 | Harden `x-vercel-cron` bypass in admin email cron | High |
| 4 | Fail-closed on missing `CRON_SECRET` in weekly alerts | High |
| 5 | Fail-hard on missing `CONTACT_ACCESS_HASH_SECRET` | High |
| 6 | Add auth to heatmap admin endpoints | High |
| 7 | Add per-user rate limiting to planner write endpoints | Medium |

---

## Critical

### CRIT-1 — Production service-role key in MCP `.env` file

- **File:** `/Users/projects/MCP/.env` (outside monorepo, gitignored in that repo)
- **Risk:** The production Supabase service-role key is stored in plaintext. This key bypasses all Row-Level Security and grants full read/write access to all tables in the shared production Supabase project used by both TI and RI.
- The file has not been committed to remote git history, but it exists on disk unprotected. If the machine is backed up to cloud storage, synced, or the file is shared, the DB is fully exposed.
- The same key also appears in the Claude Desktop `claude_desktop_config.json` as `SUPABASE_READ_KEY`.
- **Action:** Rotate the service-role key immediately. Evaluate whether a read-only Postgres role can replace the service key for MCP reads.

### CRIT-2 — Cron secret tokens hardcoded in version-controlled `vercel.json`

- **Files:**
  - `apps/ti-web/vercel.json` lines 4, 8, 12, 16
  - `apps/referee/vercel.json` lines 4, 8, 12
- **Risk:** Both files are committed to git and contain live `?token=` secrets embedded in cron path URLs. Anyone with repo read access can invoke these endpoints at will:
  - TI: whistle score recomputation, tournament alert emails to all subscribers, Stripe metric recomputation, static map generation
  - RI: admin dashboard email sends, affiliate sync
- **Action:** Remove `?token=` from `vercel.json` paths. Move secrets to Vercel environment variables. Validate the token from `x-cron-secret` header or env-sourced query param in the route handler. Rotate both secrets.

---

## High

### HIGH-1 — Three admin dashboard heatmap endpoints have no authentication

- **Files:**
  - `apps/ti-web/app/api/admin-dashboard-email/heatmap/route.ts`
  - `apps/ti-web/app/api/admin-dashboard-email/heatmap-us/route.ts`
  - `apps/ti-web/app/api/admin-dashboard-email/heatmap-us/data/route.ts`
- **Risk:** These GET endpoints use the service-role client (`supabaseAdmin`) and are reachable by any unauthenticated HTTP client with no rate limit. The data returned is aggregate tournament counts by state (low sensitivity), but the pattern of unauthenticated service-role use is a meaningful attack surface. An attacker can call these at will to consume Supabase quota.
- **Action:** Gate behind admin session check or a shared secret header.

### HIGH-2 — `x-vercel-cron: 1` header bypass in admin dashboard email cron

- **File:** `apps/ti-web/app/api/cron/admin-dashboard-email/route.ts`, lines 35–39
- **Risk:** The `isAuthorized()` function accepts `x-vercel-cron: 1` + `VERCEL_ENV=production` as a valid auth bypass without the `CRON_SECRET`. This header can be set by any external HTTP caller. Although Vercel's docs imply only Vercel infrastructure sets it, the header is not cryptographically verified. This allows unauthenticated callers to trigger admin dashboard email sends (includes business metrics, user counts, and outreach data).
- **Action:** Require `CRON_SECRET` unconditionally. Do not rely on a spoofable header for authorization.

### HIGH-3 — Weekly alerts send with no auth when `CRON_SECRET` is unset

- **File:** `apps/referee/lib/alerts/sendWeeklyDigest.ts`, line ~80
- **Risk:** Auth logic reads: `if (CRON_SECRET && options?.cronSecretHeader && options.cronSecretHeader !== CRON_SECRET)`. When `CRON_SECRET` is not set, the condition short-circuits and any POST triggers the weekly alert job, emailing all subscribed users.
- **Action:** Fail-closed: `if (!CRON_SECRET || options?.cronSecretHeader !== CRON_SECRET) throw new Error(...)`.

### HIGH-4 — `CONTACT_ACCESS_HASH_SECRET` defaults to `"local-dev"` if unset

- **Files:**
  - `apps/referee/app/api/assignors/reveal/route.ts` line 12
  - `apps/referee/app/api/assignors/reveal-bulk/route.ts` line 12
  - `apps/referee/app/api/auth/send-reset/route.ts` line 19
  - `apps/referee/app/api/invites/route.ts` line 25
- **Risk:** `process.env.CONTACT_ACCESS_HASH_SECRET ?? "local-dev"` — if this env var is unset in production (a silent misconfiguration), the hash secret degrades to the known string `"local-dev"`, making the `contact_access_log` / `rate_limit_events` audit hashes trivially reversible. This affects PII audit trail integrity for assignor contact reveals (email and phone).
- **Action:** Fail hard (`throw`) if the env var is missing in production instead of using a known fallback.

---

## Medium

### MED-1 — No rate limiting on planner write endpoints

- **Files:** All routes under `apps/ti-web/app/api/planner/`
- **Risk:** Any authenticated Insider/Weekend Pro user can create unlimited manual events, trigger unlimited ICS imports/refreshes, and call the merge endpoint. No per-user or per-IP write throttle exists beyond the tier-based feed count cap. The ICS import has a 2MB response cap and 10s timeout but no hourly/daily import frequency limit.
- **Action:** Add simple DB-based per-user rate limiting (e.g., max N ICS refreshes per hour per user).

### MED-2 — PostgREST `.or()` filter uses template literals (fragile)

- **File:** `apps/ti-web/app/api/planner/events/route.ts`, lines ~300–305
- **Risk:** Planner cursor pagination builds a PostgREST filter string via template literal: `` q.or(`starts_at.gt.${start},and(starts_at.eq.${start},id.gt.${cursorRowId})`) ``. Currently safe because `cursorStart` is validated by `isIsoDateTime()` and `cursorRowId` by `isUuid()`. However, the pattern is fragile — a future loosening of input validation could silently introduce a filter injection path.
- **Action:** Switch to chained PostgREST filter calls (`.gte("starts_at", ...)`) rather than raw `.or()` string construction.

### MED-3 — Analytics endpoint accepts unauthenticated writes

- **File:** `apps/ti-web/app/api/analytics/route.ts`
- **Risk:** Any client (no session required) can POST to this endpoint. The event allowlist and field sanitization are solid, but there is no rate limit. An unauthenticated actor could flood the analytics table or skew funnel data.
- **Action:** Add a lightweight per-IP rate limit or require session auth for DB persistence.

### MED-4 — Outreach admin fails open if `TI_ADMIN_EMAILS` is unset in non-production

- **File:** `apps/ti-web/lib/outreachAdmin.ts`, lines 6–24
- **Risk:** If `TI_ADMIN_EMAILS` is empty and `NODE_ENV !== 'production'`, any logged-in user is treated as an outreach admin. Safe in production only as long as the env var is always set.
- **Action:** Fail-closed in all environments if `TI_ADMIN_EMAILS` is empty.

### MED-5 — `X-Forwarded-For` IP spoofable for assignor reveal rate limiting

- **Files:**
  - `apps/referee/app/api/assignors/reveal/route.ts` line ~63
  - `apps/referee/app/api/assignors/reveal-bulk/route.ts` line ~63
- **Risk:** Rate limiter uses `ipHeader.split(",")[0]?.trim()` (leftmost/client-controlled value). A malicious client can vary this to defeat the per-IP rate limit on assignor contact reveals (PII — email and phone).
- **Action:** Use Vercel's `x-vercel-forwarded-for` header or take the rightmost trusted IP from `x-forwarded-for`.

---

## Low / Informational

**LOW-1 — `dangerouslySetInnerHTML` usage is safe**
All uses are JSON-LD schema serialization via `JSON.stringify` or static inline JS with no user-controlled data. No action needed.

**LOW-2 — RI middleware excludes `/api/*` routes**
`apps/referee/middleware.ts` matcher excludes API routes. Individual API routes all perform their own auth checks — no immediate risk. Session refresh only happens on page navigations, not API calls; expired sessions on API calls return 401 without automatic refresh.

**LOW-3 — `ALERTS_DRY_RUN` double-negative logic**
`process.env.ALERTS_DRY_RUN !== "false"` — currently safe (defaults to dry-run), but the double-negative is easy to misconfigure. Documented for awareness.

**LOW-4 — Stripe webhook secret retrieved at call time**
Webhook correctly validates Stripe signature. If env var is unset, the result is a 500 at call time rather than a clean startup failure.

**LOW-5 — TI admin `layout.tsx` has no shared auth guard**
`apps/ti-web/app/admin/layout.tsx` contains no auth check. Individual pages call `requireTiOutreachAdmin()`, but a future admin page that omits this call would be open to any user. The RI admin app uses a proper `ensureAdminRequest()` pattern consistently.
**Action:** Add a shared server-side auth guard in TI admin `layout.tsx` as belt-and-suspenders.

---

## Opportunities for Improvement

- **No security response headers** — No `Content-Security-Policy`, `X-Frame-Options`, or `X-Content-Type-Options` headers set in `vercel.json` or `next.config.js`. Adding these would reduce XSS/clickjacking blast radius.
- **Service role used for user-scoped queries** — Several routes use `supabaseAdmin` (bypasses RLS) for queries that could use the session-scoped client. Defense in depth: use the session client where possible so RLS is a second enforcement layer.
- **MCP server uses service-role key for reads** — Even with writes disabled, the MCP server currently bypasses RLS on all reads. Consider creating a dedicated read-only Postgres role for MCP to limit blast radius.
- **`sanitizeSupabaseKey` in `supabaseAdmin.ts`** — Intentional hardening measure that strips non-JWT characters to guard against copy-paste corruption. Worth preserving.

---

## Checked and Found Clean

| Area | Finding |
|------|---------|
| SQL injection | No raw SQL string construction; all DB access via Supabase client builder. One `.or()` template literal is guarded by strict `isIsoDateTime()` + `isUuid()` validation. |
| Hardcoded secrets in application source | None found. All secrets via `process.env.*`. |
| `eval()` usage | None found. |
| XSS via unsanitized user content | `dangerouslySetInnerHTML` uses are all safe. |
| ICS SSRF | Multi-layer defense: protocol allowlist, blocked private IP ranges (IPv4 + IPv6), DNS pre-resolution of all A/AAAA records, hop-by-hop redirect re-validation. Solid. |
| Planner ownership enforcement | All planner routes consistently filter by `.eq("user_id", user.id)`. |
| RI admin API routes | All call `ensureAdminRequest()` with Supabase session + `role === "admin"` check. |
| Open redirect on `returnTo` | Uses `sanitizeReturnTo()` helper consistently. |

---

## Out of Scope / Not Tested

- Runtime/dynamic testing (no requests made to live endpoints)
- Supabase RLS policy definitions (DB-level; not readable from source code)
- Vercel infrastructure configuration beyond `vercel.json`
- Third-party dependency vulnerabilities (`npm audit` not run)
- MCP server runtime behavior
