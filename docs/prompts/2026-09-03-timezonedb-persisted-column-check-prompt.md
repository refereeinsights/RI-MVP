# TimeZoneDB — Check Persisted `venues.timezone` Before Calling (TI Planner Route)

**Date:** 2026-09-03
**Status:** Founder-authorized, Do Now — narrow, low-risk fix. Independent of Corralio Phase A+B; safe to run in parallel with Phase A+B Stage 2 configuration/UAT.
**Scope:** `apps/ti-web` only. Does not touch `apps/corralio` (confirmed zero TimeZoneDB references anywhere in `apps/corralio` — grep run 2026-09-03) or `apps/referee`'s admin venue routes (see "Why not referee" below).

---

## Outcome

`apps/ti-web/app/api/planner/timezone/route.ts` — the API route the TI planner UI (`app/_components/planner/PlannerClient.tsx`) calls on every planner page load to resolve a venue or tournament's timezone — currently ignores the persisted `venues.timezone` column when a `venue_id` is supplied, and calls the live TimeZoneDB API every time (mitigated only by a per-process in-memory `Map` cache that resets on every serverless cold start). Fix it to check the persisted column first and skip the live call entirely when it's already populated.

## Why

Confirmed directly in the repository this session, not inferred:

- `public.venues.timezone` (`text`, nullable) has existed since `supabase/migrations/20260214_venues_enhancements.sql`.
- `apps/ti-web/app/api/planner/timezone/route.ts`'s `coordsForVenueId()` selects only `latitude,longitude` from `venues` — never `timezone` — then unconditionally calls `timeZoneFromCoordinates()`, which hits `https://api.timezonedb.com/v2.1/get-time-zone` unless the in-memory `Map` already has that exact rounded coordinate cached in the current process.
- Every other place in this monorepo that resolves a venue's timezone already checks the persisted column first and writes a newly-resolved value back: `apps/referee/app/api/admin/venues/[id]/route.ts` (`needsTimezone` guard), `apps/referee/app/api/admin/venues/address-verify/route.ts` (`normalizeText(venue.timezone)` guard before calling), and `apps/referee/app/api/admin/owls-eye/run/route.ts` (`venueTimezone` guard before calling). The TI planner route is the one exception to a pattern already established elsewhere in this codebase — bring it into line with existing convention, not inventing a new one.
- `public.tournaments` has **no** `timezone` column (confirmed by migration search). Tournament-ID lookups in this same route have no persisted value to check and must keep calling TimeZoneDB exactly as today — do not add a `tournaments.timezone` column or otherwise change tournament-path behavior; that's a separate, larger schema decision, out of scope here.
- This was flagged as the single highest-confidence, lowest-risk cost/latency reduction across the whole portfolio API review (`docs/corralio/cpo/2026-09-02-portfolio-api-economics-stage2-decision-packet.md` §14: "Cost leverage is assessed HIGH wherever a persisted-but-unused cache column already exists and isn't being checked first ... those are the cases where meaningful spend reduction requires no new infrastructure, only a code change to use what's already there").

## Build

In `apps/ti-web/app/api/planner/timezone/route.ts`:

1. In `coordsForVenueId()` (or a new sibling lookup — implementer's call on the cleanest shape), also select `timezone` from `venues`. If it's a non-empty, `Intl`-valid IANA string (reuse the existing `safeTimeZone()` validator already in this file), return it immediately and skip `timeZoneFromCoordinates()` entirely for that request — no network call, no TimeZoneDB hit.
2. When the persisted column is null/invalid and a live lookup is performed for a `venue_id` request, best-effort persist the resolved value back to `venues.timezone` (the route already imports `supabaseAdmin`, which has write access) so the next request for that venue short-circuits at step 1. Do not block or fail the response if the write fails — log and continue; the response to the current request is unaffected either way.
3. Tournament-ID lookups (`coordsForTournamentId()`) are unchanged — no persisted column exists, continue to always resolve via `timeZoneFromCoordinates()`.
4. Do not touch `apps/referee/src/lib/google/timezoneFromCoordinates.ts` or any of its admin-route callers — they already check-first/persist-back correctly.
5. Do not unify the two independent TimeZoneDB call implementations (`apps/referee`'s `timezoneFromCoordinates.ts` vs. this route's local `timeZoneFromCoordinates()`) into a shared module. Real duplication, but a separate refactor with its own risk/testing surface — not part of this fix.
6. Leave the existing in-memory `Map` cache in place as a secondary layer; it's harmless and still helps within a single warm process for coordinate-only (no venue/tournament ID) requests, which have no persisted column to check at all.

## Do not build

- No `tournaments.timezone` column.
- No shared/unified TimeZoneDB client module across `apps/referee` and `apps/ti-web`.
- No change to `apps/referee`'s admin venue routes — they're not the gap.
- No change to any Corralio code — confirmed zero TimeZoneDB usage there.
- No retirement of TimeZoneDB as a provider, no new caching infrastructure beyond "check the column that already exists."

## Verification

- TypeScript, lint, and `apps/ti-web` production build pass.
- A venue with a populated `timezone` column produces zero TimeZoneDB network calls when its planner timezone is requested by `venue_id` (verify via a test double / mock on `fetch`, or via `corralio_external_api_calls`-style call tracking if `trackExternalCall` gets added to this route — not required, just don't regress silently).
- A venue with a null `timezone` column still resolves correctly via the live call on first request, and the column is populated afterward (spot-check via a direct row read in a test/dev environment).
- Tournament-ID requests behave identically to today (no regression).
- `git diff --check` passes.

## Evidence / Done when

Persisted-column check ships for venue-ID planner-timezone lookups; tournament-ID lookups unchanged; build/lint/tests pass; no Corralio, `apps/referee`, or schema changes included.

## Source

`docs/corralio/cpo/2026-09-02-portfolio-api-economics-stage2-decision-packet.md` §7, §14; founder-supplied portfolio venue/planning API rationalization brief (chat, 2026-09-03, Section 7 — Timezone; not yet filed in-repo as of this prompt); direct repository read of `apps/ti-web/app/api/planner/timezone/route.ts`, `apps/referee/src/lib/google/timezoneFromCoordinates.ts`, and its four admin-route callers, 2026-09-03.
