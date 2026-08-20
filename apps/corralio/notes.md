# Corralio Notes

## 2026-08-20 — Slice 4.0A children and teams foundation (local implementation)

- Activated the existing private `corralio_children` and `corralio_teams` model in the authenticated Corralio home page. Household owners can add and rename active children, add child-owned private teams, and edit team names and optional sport. Archived rows remain excluded; delete, archive, restore, reorder, color editing, team-child reassignment, roster, and collaboration behavior remain deliberately deferred.
- Kept the applied Slice 2 cardinality unchanged: one child may own multiple private team rows, while each private team belongs to exactly one child. Siblings may use separate team rows with the same display name; no shared-team junction, canonical sports entity, or name-uniqueness rule was added.
- Child colors are assigned automatically in the existing six-token order (`forest`, `ocean`, `amber`, `violet`, `rose`, `teal`). The persisted `rose` compatibility key is retained with the accessible fuchsia presentation; no color picker or new schema field was added.
- All family mutations use the authenticated cookie-backed Supabase server client and the existing idempotent owner-household RPC, validate IDs/names/sport server-side, scope writes to the resulting active owner household, and continue relying on the existing RLS and composite household foreign keys. No family mutation uses the service role or accepts a browser-supplied household ID.
- Added the unapplied, preflight-protected migration `20260820_corralio_slice40a_family_foundation.sql` to narrow the existing optional `corralio_teams.sport` field to the established nine-value Corralio taxonomy. It does not coerce existing values and aborts if incompatible rows exist. Read-only catalog and rollback-only behavioral verification scripts are ready for the controlled manual production migration workflow.
- Schedule behavior is unchanged. Slice 4.0A does not assign schedule sources or events, fetch/refresh a feed, alter canonical ingestion, mutate imported events, add analytics, or change the weekend plan. Child/team assignment remains Slice 4.0B.
- Offline validation passed all 47 Corralio tests, TypeScript, lint, production build, and diff checks. No production SQL, private data mutation, live feed request, cron invocation, push, or deployment was performed.

## 2026-08-19 — Slice 3.3 persistent refresh failure and recovery (local implementation)

- Extended the existing Slice 3.2 source state instead of adding a new `sync_status`: the unapplied migration `20260819_corralio_slice33_persistent_refresh_recovery.sql` adds a private consecutive-failure counter saturated at the fixed threshold of three and a safe `refresh_paused_at` marker. One and two accepted claimed failures remain eligible after the normal 23-hour window; the third keeps the source connected as `error`, preserves its URL/events/household/sport, releases the claim, and excludes it from later cron batches. No table, queue, cron, poller, history rows, or index were added.
- Failure recording remains service-role-only and atomic in `corralio_fail_claimed_ics_refresh_v1`. Only the eight established bounded categories can increment; a stale, expired, duplicate, or mismatched claim returns false and cannot mutate state. The worker now distinguishes such a skipped finalization from an accepted persisted failure while continuing later sources.
- Canonical `corralio_persist_ics_ingestion_v1` remains the single successful-ingestion boundary and resets count, pause, and `last_refresh_error_code` for scheduled, valid-empty, repeat-import, and validated-replacement success. Paused sources cannot be recovered through the ordinary connect form; they use the existing validated replacement flow. Successful replacement updates `last_refresh_attempted_at` in the same transaction, while failed replacement rolls URL, events, freshness, and failure state back together.
- The connected-source UI reads only the household-authorized safe pause timestamp. Below-threshold errors show `Refresh delayed` with automatic-retry copy; threshold sources show `Schedule needs attention`, confirm existing events remain available, and reuse `Replace calendar link`. Authenticated clients still cannot read the exact failure counter, claim metadata, or private `source_url`.
- Added read-only catalog and rollback-only behavioral verification scripts. The behavioral fixture uses full synthetic batches and deterministic low UUIDs, asserts every claim remains inside the synthetic household, and never assumes production has no other eligible sources. The migration was manually applied. The consolidated catalog audit passed all 13 schema, RLS, ownership, locked-search-path, function-execution, and column-privilege checks. The complete rollback-only behavioral verification passed and returned synthetic cleanup counts `households=0`, `sources=0`, and `events=0`; a separate read-only check confirmed the existing UAT family remained intact with one household, one source, and 151 events. Offline validation passed 40 focused Corralio/shared schedule tests, TypeScript, lint, production build, and diff checks; no live feed, production cron, push, or deployment was invoked.
- Deferred unchanged: disconnect/suppression, children/teams/assignment, conflicts, routing/leave-by, collaboration, TI/venue matching, geocoding, notifications, analytics infrastructure, direct provider integrations, and broad schedule-source lifecycle work.

## 2026-08-19 — Slice 3.2 secure scheduled ICS refresh (local implementation)

- Added one daily Corralio Vercel cron at `17 11 * * *` (11:17 UTC) targeting the Node-only `/api/cron/schedule-refresh` route. The route requires the exact `Authorization: Bearer ${CRON_SECRET}` contract, returns `Cache-Control: no-store`, creates only the trusted service-role Supabase client, and returns/logs bounded aggregate results without source URLs or provider errors.
- The worker claims at most 10 active ICS sources per invocation, processes them sequentially, prioritizes never-attempted sources and then the oldest attempt with stable-ID ordering, and uses a 23-hour attempt-based freshness window. `batch_full` is derived only from whether all 10 slots were claimed; no backlog count or unbounded source query was added.
- Added unapplied migration `20260819_corralio_slice32_scheduled_ics_refresh.sql`. It adds nullable attempt/error/claim metadata and three service-role-only, locked-search-path RPCs for deterministic claiming, claimed canonical persistence, and bounded failure finalization. Claims expire after 10 minutes; an expired claim is recoverable even though its attempt timestamp is recent. URL replacement invalidates an active claim so an old feed cannot persist after its secret URL changes. Authenticated users may read only the safe attempt/error fields and still cannot read claim tokens, claim timestamps, or `source_url`.
- Refresh reuses the shared SSRF-safe fetcher and normalization engine, then delegates upsert and explicit-cancellation behavior to `corralio_persist_ics_ingestion_v1`; no parallel event persistence was introduced. A successfully parsed empty feed is sent through that canonical boundary with an empty event list and only explicit cancellation IDs, so unrelated existing events are preserved. Fetch, validation, normalization, event-limit, and persistence failures preserve the prior URL/events, store only a bounded failure code, release the claim where possible, and do not block later sources.
- Persistent-failure auto-disable is deliberately deferred to Slice 3.3 when no existing policy applies. The source remains `error` and becomes eligible again after the next 23-hour window. Disconnect UI, suppression, assignments, conflicts, routing, geocoding, venue matching, collaboration, analytics, and direct sports-platform integrations remain out of scope.
- Added read-only catalog verification and rollback-only behavioral verification SQL. The migration was subsequently applied manually and its catalog privilege contract passed. The first behavioral-verification run rolled back after its fixture incorrectly assumed there were no other eligible production sources; the corrected fixture fills both claim batches with deterministically ordered synthetic rows and asserts that concurrent batches do not overlap or touch existing production sources. The corrected complete verification passed and reached `ROLLBACK`; final cleanup counts were `households=0`, `sources=0`, and `events=0`. No real calendar feed or production cron route was invoked. Validation passed 28 focused/shared schedule tests, Corralio TypeScript, lint, production build, and diff checks. No new table or index was added.

## 2026-08-19 — Slice 3.1.1 password authentication and recovery (local implementation)

- Added password-first returning-user sign-in through the existing Supabase browser client while preserving the existing Magic Link account-creation/fallback path. Invalid credentials—including unknown, passwordless, unconfirmed, and wrong-password cases—share one non-enumerating response.
- Added a small authenticated `/account` password surface. It updates the existing shared Supabase identity through `updateUser`, stores no Corralio password data, does not touch household/RLS state, and explains that the credential follows the same identity into TI/RI where those products support password login. Structured weak-password and stale-session failures map to safe application copy rather than raw provider errors.
- Added `/account/forgot-password`, `/account/reset-password`, and a server-only recovery request route. Recovery uses validated `CORRALIO_SITE_URL` infrastructure configuration to construct `/auth/confirm?brand=corralio&flow=recovery`; it never derives the origin from the request host, a forwarded host, browser input, or `NEXT_PUBLIC_*`, and it fails closed when configuration is absent or invalid.
- Extended the existing callback without changing email/Magic Link behavior: `email` and `magiclink` still return to `/`, while `recovery` or the trusted PKCE flow marker establishes the session and returns a relative 303 to `/account/reset-password`. Relative redirects retain the earlier `0.0.0.0` regression protection.
- Added a manual shared Supabase Recovery template reference with exact Corralio sentinel matching, `.ConfirmationURL` fallback, `type=recovery`, and unchanged non-Corralio fallback behavior. RI's separate server-generated recovery email remains untouched. Remote Supabase templates, redirect allowlists, Auth policies, Vercel variables, deployment, and production data were not changed.
- Validation passed: 21 focused Corralio tests, TypeScript, lint, production build, `git diff --check`, and local HTTP rendering for `/`, `/account/forgot-password`, and `/account/reset-password`.
- Local browser UAT subsequently passed the complete mobile and desktop journey: generic invalid-password handling, Magic Link regression, authenticated password setup and update, password sign-in, forgot-password request, Corralio-branded recovery email, recovery callback, mismatch validation, password reset, single-use-token enforcement, and sign-in with the replacement password. Every successful auth path remained on `localhost:3002`; no `0.0.0.0`, TI, or RI redirect returned.
- UAT confirmed identity/data continuity across Magic Link, password setup, password login, recovery, and reset: the existing household, connected schedule, and imported event remained unchanged, with no duplicate onboarding state.
- The two pre-restart recovery `503` responses were caused by the local `CORRALIO_SITE_URL` value not having been saved into the environment loaded by the running process. The route's `503` is the intentional fail-closed response for missing/invalid trusted infrastructure configuration and does not disclose account existence. Recovery passed after saving the variable and restarting. No code correction was required.
- The reported invalid-password/calendar `503` pattern is not emitted by a shared Corralio validation boundary: password errors come from the Supabase browser request and schedule actions return structured safe errors. The dev-console source-read warning referenced the tracked, present `SignInForm.tsx` and is treated as a non-blocking stale Next.js dev source-map artifact. No production defect remains open from this UAT.
- Production still requires `CORRALIO_SITE_URL=https://corralio.com` in the Corralio Vercel project, the reviewed shared Supabase Recovery template, and the production callback allowlist. Use only the designated Corralio UAT identity for future credential tests; similarly named TI/RI identities are separate auth rows.
- No schema migration, service-role password path, password signup, cross-domain SSO, account merge, or Slice 3.2 refresh behavior was added.

## 2026-08-19 — Slice 3.1 complete

- **Slice 3.1 is complete.** The production-only migration `20260818_corralio_slice31_secure_schedule_connections.sql` was manually applied. Read-only catalog checks confirmed the sport column/constraint, V2 creation and sport-update functions, service-role-only atomic replacement, authenticated sport visibility, authenticated `source_url` denial, and removal of authenticated access to the legacy direct-replacement RPC.
- The complete rollback-only verification passed without assertions. It covered source-level sport, household isolation, successful canonical persistence delegation, failed-replacement URL rollback, cross-household denial, and function/column privileges; the final synthetic cleanup counts were `auth_users=0`, `households=0`, `sources=0`, and `events=0`.
- Final local browser UAT passed at 375×812, 390×844, and 430×932. Corralio-branded Magic Link sign-in returned to `localhost` with an authenticated session in two consecutive sign-out/sign-in cycles; connected status, URL secrecy, persisted Soccer context and event icon, blocked-URL replacement preservation, navigation chooser, copy-address behavior, external Google Maps handoff, touch targets, and overflow all passed with no console errors or failed browser requests.
- Successful replacement with the private UAT feed and a location-less event were not exercised in browser data. Successful atomic replacement/rollback is covered by focused application tests and the production rollback-only SQL; location-less navigation is conditionally omitted by the implemented render path. The isolated reported 503 transport observation is not emitted explicitly by Corralio and did not produce a reproducible functional failure, so no additional defect is open.
- Automatic ICS refresh remains deliberately deferred. **Slice 3.2 is reserved for secure scheduled refresh** with bounded batches, overlap control, per-source failure isolation, and reuse of the existing SSRF-safe fetch and canonical persistence boundaries.

## 2026-08-18 — Auth callback same-origin redirect repair (local implementation)

- Local browser UAT proved the OTP request and shared Supabase Magic Link template correctly carried the Corralio callback, but a dev server started with `--hostname 0.0.0.0` caused the callback route's `new URL(..., request.url)` redirects to emit `http://0.0.0.0:3002/`. The auth cookie was attached to the callback response for the browser-facing localhost origin, then became unavailable after the cross-origin redirect.
- Corralio auth-result redirects now use bounded relative `Location` headers for success, invalid, unavailable, and expired outcomes. The browser therefore remains on the exact origin that received the callback—localhost, a controlled LAN hostname, preview, or production—without trusting `Host`/forwarded-host headers or adding environment-specific origins.
- Focused regression coverage proves all result locations remain relative, never contain `0.0.0.0` or another host, and retain auth cookies on the same 303 response. No Supabase template, allowlist, database, authorization, or email/password behavior changed.

## 2026-08-18 — Slice 3.1 secure schedule connections (local implementation)

- Added optional source-level sport metadata on `corralio_schedule_sources`; sport remains outside the shared schedule engine and imported event rows derive it through `schedule_source_id` rather than duplicating it.
- The connect form now strongly prompts with a native sport selector and clears all submitted fields after success, so the bearer-like ICS URL no longer remains visible. Connected-source cards show only safe name, sport, and status metadata and permit later sport editing.
- Calendar-link replacement uses a fresh empty URL input. The trusted server fetches and normalizes the candidate first, then a service-role-only database function atomically replaces the secret URL and delegates event upsert/explicit-cancellation behavior to `corralio_persist_ics_ingestion_v1`. Failed validation or persistence leaves the previous URL, source state, and existing events intact. The legacy authenticated direct-replacement grant is removed by the migration.
- For this pilot, initial and replacement feeds must currently produce at least one usable event. Existing events absent from a later feed are not deleted; only explicit cancellation identities use the existing deletion behavior. Stale-event lifecycle remains deferred.
- Weekend event cards resolve the source sport for a compact icon. Authorized location text opens a small user-initiated chooser for Apple Maps, Google Maps, Waze, or copying the address. Corralio performs no geocoding, coordinate lookup, routing, traffic calculation, installed-app detection, or preferred-map persistence.
- Added unapplied migration `20260818_corralio_slice31_secure_schedule_connections.sql` and rollback-only verification `scripts/analysis/corralio_slice31_secure_schedule_connections_verification.sql`. Production application and verification remain manual.
- Automatic ICS refresh is not part of Slice 3.1. A future Slice 3.2 should add a bounded protected scheduled server job, overlap control, per-source failure isolation, and reuse of the same SSRF-safe fetch and canonical persistence boundaries. Until then, imports occur at connection or explicit link replacement.

## 2026-08-18 — Shared Supabase auth-email branding contract (local implementation)

- Corralio's single `signInWithOtp` flow now supplies `/auth/confirm?brand=corralio`, allowing the shared Supabase Confirm Signup and Magic Link templates to identify Corralio by exact callback equality without trusting branding data for authorization.
- Added a pure callback builder and focused coverage for localhost and production origins. The application supplies no token hash, authorization code, entitlement, or other credential in `RedirectTo`; Supabase adds the token only in the email template.
- The Corralio confirm handler requires no behavior change: it continues to verify supported code or token-hash callbacks and safely ignores the presentation-only `brand` parameter.
- Supabase dashboard work remains manual. Both shared templates must retain `.ConfirmationURL` when `RedirectTo` is absent and use the guarded `&token_hash=...&type=email` construction when it is present. No remote template, allowlist, email, push, or deployment change was made locally.

## 2026-08-18 — Slice 3 connect schedule → This Weekend (local implementation)

- Added the first product loop: an authenticated household owner can paste an ICS/iCal subscription URL, import normalized events, and see the applicable Friday-through-Sunday events in a mobile-first **This Weekend** view.
- Kept the architecture boundary explicit:
  - the shared `packages/lib/sports-schedule` engine owns SSRF-safe fetch, ICS parsing, recurrence expansion, normalization, stable source-event identity, location/field extraction, and note sanitization;
  - the Corralio adapter owns authentication, owner-household resolution, private source reuse/creation, and translation into Corralio event columns;
  - the service-role-only database RPC owns atomic imported-event upsert, explicit cancellation deletion, and source sync status.
- Calendar URLs remain bearer-like secrets. They are accepted only by server actions/RPCs, matched only in trusted service-role code, omitted from ordinary reads, and excluded from application logs, analytics, user-visible errors, and RPC results.
- The browser receives only RLS-authorized household metadata/events. It applies TI's existing local Friday-through-exclusive-Monday definition to a narrow server-loaded candidate window, avoiding timezone onboarding in this slice.
- No analytics vendor or new analytics persistence was added because the Corralio app does not yet have an analytics abstraction.
- Added focused tests for shared-engine ingestion, household-scoped adapter input, repeat-import identity, raw-location preservation, unauthenticated denial, credential-safe errors, and weekend range filtering.
- Added `20260818_corralio_slice3_ics_persistence.sql`, which is intentionally **not applied automatically**. It must be applied in a controlled production migration before live imports are tested, then checked with `scripts/analysis/corralio_slice3_ingestion_post_migration_verification.sql`.
- Required Corralio runtime variables are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The browser derives the auth callback from the current Corralio origin; that origin must be allowlisted in Supabase Auth. Secrets remain uncommitted.
- Deferred: refresh scheduling, disconnect UI, imported-event suppression, child/team onboarding and assignment, collaboration, analytics infrastructure, conflict detection, leave-by, routing, TI matching, and canonical venue work.

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
