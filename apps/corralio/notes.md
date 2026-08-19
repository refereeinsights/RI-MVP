# Corralio Notes

## 2026-08-19 — Slice 3.1.1 password authentication and recovery (local implementation)

- Added password-first returning-user sign-in through the existing Supabase browser client while preserving the existing Magic Link account-creation/fallback path. Invalid credentials—including unknown, passwordless, unconfirmed, and wrong-password cases—share one non-enumerating response.
- Added a small authenticated `/account` password surface. It updates the existing shared Supabase identity through `updateUser`, stores no Corralio password data, does not touch household/RLS state, and explains that the credential follows the same identity into TI/RI where those products support password login. Structured weak-password and stale-session failures map to safe application copy rather than raw provider errors.
- Added `/account/forgot-password`, `/account/reset-password`, and a server-only recovery request route. Recovery uses validated `CORRALIO_SITE_URL` infrastructure configuration to construct `/auth/confirm?brand=corralio&flow=recovery`; it never derives the origin from the request host, a forwarded host, browser input, or `NEXT_PUBLIC_*`, and it fails closed when configuration is absent or invalid.
- Extended the existing callback without changing email/Magic Link behavior: `email` and `magiclink` still return to `/`, while `recovery` or the trusted PKCE flow marker establishes the session and returns a relative 303 to `/account/reset-password`. Relative redirects retain the earlier `0.0.0.0` regression protection.
- Added a manual shared Supabase Recovery template reference with exact Corralio sentinel matching, `.ConfirmationURL` fallback, `type=recovery`, and unchanged non-Corralio fallback behavior. RI's separate server-generated recovery email remains untouched. Remote Supabase templates, redirect allowlists, Auth policies, Vercel variables, deployment, and production data were not changed.
- Validation passed: 21 focused Corralio tests, TypeScript, lint, production build, `git diff --check`, and local HTTP rendering for `/`, `/account/forgot-password`, and `/account/reset-password`. The browser automation executable was unavailable, so live mobile/password/recovery UAT remains manual. Before live UAT, set local and Vercel `CORRALIO_SITE_URL`, apply the documented shared Recovery template manually, and confirm the Corralio callback allowlist. Use only `rdtest1970+parent.ryan@gmail.com`; `rdtest1970@gmail.com` is a different identity and must not be modified.
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
