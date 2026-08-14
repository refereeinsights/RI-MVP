# TI Hotel Fee Program Phase 2 — implementation report

Date: 2026-08-14
Status: implemented locally; migration unapplied; no fee program activated

## Outcome

Phase 2 adds the smallest trusted configuration and routing layer on top of the immutable Phase 1 hotel-program snapshots. It does not configure a real fee destination, activate a tournament, perform a fee click, deploy code, or mutate production hotel-program configuration.

## Configuration and admin

- `ti_tournament_hotel_programs` stores at most one current fee-program row per tournament. No row means Standard / Not enrolled.
- Stored values are limited to TI Revenue or Tournament Support, $5 or $10, Pending/Active/Paused, a server-generated UUID version, timestamps, and the authorized admin ID.
- RLS is enabled; public, anonymous, and authenticated roles have no table privileges. Existing `requireAdmin()` and the service client authorize all reads and mutations.
- The existing tournament-listings edit form now contains a separated Hotel program section. It shows current and proposed effective routing, configuration availability, and the fixed beneficiary.
- Every meaningful mutation rereads current state and compares `expected_configuration_version`. A no-op changes neither the row nor its version. Economic activation/deactivation requires explicit confirmation against the reread state.

## Trusted runtime resolution

The shared resolver returns fee economics only when all of these are true:

1. The current row is valid and Active.
2. The tournament and venue are valid UUIDs.
3. The venue is linked to that tournament with `is_inferred = false`.
4. The opaque program/rate key maps to a trusted HTTPS HotelPlanner server environment value.

Pending, Paused, absent, invalid, untrusted, unavailable, or failed resolution returns the canonical `hp_standard_v1` Standard/no-fee snapshot. The database never stores fee destination URLs, and the admin browser receives availability booleans only.

## Handoff safety

`/go/hotels`, `/go/hotels/property`, and `/go/hotels/checkout` resolve standard and fee targets separately. A fee target is selected only when the fee snapshot has persisted successfully to `ti_outbound_clicks`. Missing targets or persistence failures route to the existing Standard/no-fee target; lack of any safe standard target returns a retryable error.

Tournament Support disclosure is rendered only for an effective, trusted Active Tournament Support program. TI Revenue has no tournament-support disclosure.

## Rollout order

1. Apply `20260814_ti_tournament_hotel_program_phase2.sql`; it is additive and unused by the currently deployed application.
2. Keep all fee destination environment variables unset and push/deploy the combined Phase 1 and Phase 2 code when ready.
3. Verify existing Standard/no-fee behavior before adding any program row.
4. Configure one trusted server-side fee target, redeploy if required for the environment change, and create a Pending test configuration.
5. Review the computed effective summary, then explicitly confirm activation for one controlled tournament.
6. Verify persistence and routing using a non-booking controlled handoff. Pause immediately if attribution does not match.

## Validation

- `node --import tsx --test ...` — 25 focused Phase 1/2 tests passed.
- `npx tsc -p apps/ti-web/tsconfig.json --noEmit` — passed.
- `npx tsc -p apps/referee/tsconfig.json --noEmit` — passed.
- `npm run lint --workspace ti-web` — passed.
- `npm run lint --workspace referee-app` — passed (the linter printed its existing parser advisory).
- `npm run build --workspace ti-web` — passed; restricted-network Supabase DNS warnings and existing unrelated warnings were non-fatal.
- `npm run build --workspace referee-app` — passed with existing unrelated warnings.
- `git diff --check` — passed.
