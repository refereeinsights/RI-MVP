# TI Tournament Hotel Support Director Enrollment Pilot

Date: 2026-08-17 (updated 2026-08-18)
Status: foundation migration applied; enrollment UX/terms v2 implemented locally with its migration unapplied

## Implemented

- Added a Hotel Support Enrollment section to the existing RI tournament editor.
- Added one-time $5/$10 invitation creation, replacement, revocation, enrollment review, approval, and decline controls.
- Added the private TI route `/hotel-support/enroll/[token]` with trusted tournament context, exact offered economics, UTC expiration, canonical terms, required confirmations, and a mobile-first form.
- Added an application and database activation guard: a new Active Tournament Support transition or rate change requires an Approved enrollment for the same tournament and exact rate. Approval itself never activates routing.

## Security and evidence model

- Raw invitation tokens contain 32 random bytes and are returned only once. The database stores only their SHA-256 hashes.
- Invitation creation transactionally revokes any prior active invitation; a partial unique index provides the concurrency backstop.
- Submission uses a service-role-only RPC, locks the invitation row with `SELECT ... FOR UPDATE`, and relies on a unique `invitation_id` acceptance constraint for idempotency.
- Director acceptance evidence is separate from mutable founder review. Database triggers reject UPDATE and DELETE on acceptance and audit evidence; review decisions are terminal.
- The canonical `tournament_hotel_support_v1` terms are a code-owned string with SHA-256 `061b23e19d783841f3600ce7967b06545e0dc6f6d8e42435830ff09bca9fe33c` stored at acceptance.
- New tables and RPCs are service-role-only. The RI server authenticates admins before service-role actions. TI public pages never receive authoritative tournament, rate, expiration, or terms form fields.
- Enrollment responses are private/no-store, noindex/nofollow, and no-referrer. No enrollment analytics were added.

## Migration status

Migration: `supabase/migrations/20260817_ti_hotel_support_director_enrollment.sql`

The founder manually applied the foundation migration on 2026-08-18. It added four service-role-only tables, supporting indexes, four restricted workflow RPCs, immutable/terminal-state triggers, and a guard trigger on the existing `ti_tournament_hotel_programs` table. Read-only verification confirmed all four tables exist.

The existing hotel-program table is a prerequisite. Run the read-only preflight first:

`scripts/analysis/ti_hotel_support_enrollment_preflight.sql`

After manual application, run:

`scripts/analysis/ti_hotel_support_enrollment_post_migration_verification.sql`

The migration creates new empty tables and indexes without scanning historical click data. Adding the guard trigger briefly requires a table lock on `ti_tournament_hotel_programs`; that table is small, but application should still be scheduled deliberately. Before any enrollment data exists, rollback can remove the new trigger, functions, and tables in dependency order. After acceptance evidence exists, do not drop or rewrite it without a separately reviewed retention/compliance process.

## Enrollment UX and terms v2 refinement

The 2026-08-18 refinement keeps the workflow and activation guard unchanged while making the director page a concise partnership enrollment:

- Uses the `Tournament Hotel Support · Enrollment` header, a restrained responsive headline, trusted tournament context, and an exact UTC expiration cutoff.
- Opens the tournament hotel page in a protected new tab so form progress is retained.
- Limits informational payment recipients to tournament organization, nonprofit/booster organization, business/club, or other organization. The migration aborts if the production assumption of zero historical `individual` acceptances is wrong.
- Reduces the form from five direct checkbox confirmations to authorization, housing eligibility, and acceptance of the complete terms.
- Stores v2 evidence as `three_checkbox_v2`: the three displayed confirmations are `true`, while the removed legacy confirmation fields are `NULL`. Their concepts remain explicitly accepted through the canonical terms version and hash.
- Adds a separate atomic, service-role-only `submit_ti_hotel_support_enrollment_v2` RPC. The v1 function remains available for compatibility and rollback safety.

Canonical v2 terms are UTF-8 plain text with eight paragraphs joined by exactly `\n\n` and no trailing newline. Trusted rate-specific SHA-256 values are:

- $5.00: `85f870fea59e35e8f42362662ea969a0ec17723ab5128994e6332b26304c96d8`
- $10.00: `3382fa937abc7a0d841d1766ad8d18b6250151267138846f9149516178ffaa8c`

V2 migration: `supabase/migrations/20260818_ti_hotel_support_enrollment_ux_v2.sql`

The v2 migration was created locally and was not applied. The existing read-only verification file was extended rather than duplicated:

`scripts/analysis/ti_hotel_support_enrollment_post_migration_verification.sql`

No Hotel Program resolution, HotelPlanner routing, approval behavior, or activation behavior changed.

## Production-backed local UAT gate

Do not run browser UAT merely because RI and TI are local. They use production Supabase.

After the founder confirms migration application, UAT still requires:

1. A founder-supplied tournament ID intended for the pilot.
2. Explicit authorization to create production invitation, acceptance, review, and audit rows.
3. Confirmation that no Hotel Program will be changed to Active and no fee-enabled HotelPlanner click will occur.
4. A retention decision for the UAT acceptance evidence, which the application intentionally cannot delete.

Expected UAT writes are one invitation row, one acceptance row, one review row, invitation state changes, and corresponding audit rows. Replacement or revocation testing creates additional preserved invitation/audit rows.

The founder created an invitation while visually testing the production-backed local workflow. No director acceptance existed when the v2 refinement began. This implementation did not submit, approve, decline, replace, or revoke an invitation.

## Validation completed without production writes

- 24 focused policy, validation, hashing, authorization, immutability, permission, no-activation, and migration-coverage tests passed.
- RI and TI TypeScript checks passed.
- RI and TI lint passed with no new errors.
- RI and TI production builds passed; the new TI enrollment route is dynamic and performed no enrollment write during build.
- Existing build warnings remain unrelated to this change.
- The v2 refinement added a 23-test offline contract suite covering canonical rate hashes, three-checkbox evidence, recipient restrictions, RPC idempotency/authority, service-role permissions, director copy, safe new-tab behavior, and responsive CSS; all 23 passed.
- Both app typechecks, both linters, `git diff --check`, and the TI production build passed for v2. The build emitted only existing unrelated warnings.
- No production migration or director enrollment submission was performed during v2 validation.

## Deferred

No automated email, director account/dashboard, public signup, tax collection, banking, payment onboarding, payout ledger, automated payout, reconciliation importer, organization beneficiary model, CRM, fee-target configuration, or fee-routing activation was added.

## Verdict

`V2 READY FOR MIGRATION REVIEW`
