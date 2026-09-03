# Corralio Phase A+B Stage 2 — Pre-10DLC UAT Closeout

**Verdict:** `CORRALIO PHASE A+B STAGE 2 BLOCKED`

The bounded non-live portion passed. The required blocking condition is the still-pending 10DLC campaign: the canonical Stage 2 prompt forbids Telnyx/handset evidence and requires a blocked verdict until campaign approval or explicit written Telnyx permission exists.

## Isolated environment and schema

- Supabase project: `azuwuouctkyppkrugnls` (isolated; not production).
- Runtime: `corralio-gate3-isolated.vercel.app` only.
- Applied only schema copies of existing repository migrations needed to reach the Phase A+B contract. No production rows were copied.
- Closure inventory: `20260818_corralio_household_rls_foundation.sql`, `20260818_corralio_slice3_ics_persistence.sql`, `20260818_corralio_slice31_secure_schedule_connections.sql`, `20260819_corralio_slice32_scheduled_ics_refresh.sql`, `20260819_corralio_slice33_persistent_refresh_recovery.sql`, `20260823_corralio_slice41b_family_schedule_lifecycle.sql`, `20260824_corralio_slice42a_acquisition_provenance.sql`, `20260825_corralio_slice43_leave_by.sql`, `20260826_corralio_slice46_what_fits.sql`, `20260828_corralio_team_schedule_connection_fix.sql`, `20260831_corralio_slice36b_required_arrival.sql`, and `20260903_corralio_phase_ab_phone_schedule_intake.sql`. These were applied atomically from repository files; no migration-ledger row was fabricated or altered.
- Relevant catalog and rollback-only behavioral checks passed for scheduled refresh, persistent recovery, leave-by, What Fits, required-arrival Phase 1, and Phase A+B; Slice 4.1B lifecycle catalog security also passed. Cleanup-zero assertions passed.
- The combined Slice 4.2A verifier also requires the unrelated weekly-engagement table. That analytics migration was deliberately excluded rather than broadening this isolated UAT. Phase A+B's own verifier proved its acquisition dependency and service boundary.

## Non-secret configuration

The isolated app and database pointed at the same isolated project. Only the existing isolated runtime and temporary credential-free public ICS fixture were used. No Telnyx credential was introduced. Product activation flags and production configuration were unchanged.

## Phone Auth

No phone-auth call was authorized before the 10DLC gate. New-user Auth, returning-user Auth, manual OTP verification, and phone change are therefore unverified in this run.

- `signInWithOtp()` calls: `0`
- OTP verification calls: `0`
- phone-change calls: `0`

Existing email authentication remained intact: six focused callback/redirect/cookie regression tests passed.

## Channel identity and RLS

A disposable confirmed Auth identity and household were created with the Admin boundary. The HMAC-only phone projection resolved the authorized sender. Anonymous enumeration of channel identity was denied. An unknown signed sender stopped before calendar inspection or retrieval. No raw phone was persisted in the projection.

## Telnyx and mock accounting

| Measure | Result |
|---|---:|
| Telnyx attempts / accepted / delivered | 0 / 0 / 0 |
| Live Telnyx inbound messages | 0 |
| Billed SMS segments | 0 |
| Supabase Send SMS Hook deliveries | 0 |
| Mock OTP-provider invocations | 0 |
| Segment reservations | 0 |
| Unique synthetic signed inbound events | 4 |
| Replayed synthetic inbound events | 2 |
| Mock clarification/status records | 2 |

The synthetic inbound messages exercised the real signature/parser, database claims, encrypted pending-intake state, assignment resolver, and shared schedule-ingestion orchestration. They do not prove carrier delivery.

## Intake progression

The passing evidence run proved:

`unknown sender → ignored before retrieval`

`malformed content → ignored`

`valid URL without sufficient assignment evidence → clarification_pending`

`same inbound event replay → duplicate with no new retrieval/reply`

`bounded numeric choice → resolved → one assigned schedule source + two events`

`same choice event replay → duplicate`

The passing deterministic run used two local injected fixture retrievals: one inspection and one final ingestion. Earlier harness-validation attempts used four public fixture HTTP fetches total, exactly the declared ceiling; no further public fixture fetch occurred. The temporary fixture was then removed and its isolated URL returns `404`.

The deliberately narrow isolated closure omitted the later venue-matching schema. Its best-effort post-persistence callback therefore emitted the existing constant, payload-free failure log while processing the location-free fixture. Ingestion still succeeded and no provider call occurred. Production already has that independently completed schema, so this is isolated-fixture context rather than evidence of a production regression.

## Pending-intake security and lifecycle

- URL envelope present while pending and did not contain plaintext.
- Fingerprint used the expected versioned keyed format.
- Exactly two candidate teams were retained for bounded clarification.
- Resolution assigned the selected team and did not guess.
- Terminal state was `resolved`, terminal timestamp was set, and encrypted URL material was deleted.
- Replay did not fetch, persist, or create another reply.

## Assignment, CALNAME, and arrival boundaries

The fixture intentionally omitted CALNAME, so the product path did not auto-assign and instead clarified. This is correct under the current contract. Real CALNAME preservation remains a separate micro-slice.

The created source had no source-level arrival override; both fixture events retained null explicit arrival. Phase A+B did not mutate arrival preferences, teams, routing, venues, or the authoritative `ics_explicit → source_preference → team_preference → corralio_default` resolver.

## Privacy and cleanup

No report or committed fixture contains a phone, calendar URL, OTP, message body, signature, credential, or provider payload. Operational output was limited to aggregate counts and bounded states.

Independent cleanup established:

- disposable Auth identities: `0`;
- all rows carrying the synthetic household ID across the isolated schema: `0`;
- synthetic inbound claims: `0`;
- non-policy rows across all eight Gate 3 durable-state tables: `0`;
- durable policy rows: exactly the retained disabled baseline row;
- external-provider ledger rows/delta: `0`;
- temporary public fixture: removed (`404`);
- isolated runtime: rebuilt successfully without the fixture;
- production environment/configuration: untouched.

## Verification

- Focused Phase A+B, pending-secret, Gate 3, and shared schedule tests: `77/77` passed.
- Existing email-auth regressions: `6/6` passed.
- Explicit Corralio TypeScript: passed.
- Corralio lint: passed with zero warnings.
- Corralio local production build: passed.
- Isolated Vercel production build/restoration: passed.
- `git diff --check`: passed before documentation closeout and again required after it.
- Sensitive-data/secret review: no exposed credential or customer data.

## Exact external-call accounting

- Public synthetic ICS fixture HTTP fetches: `4/4` ceiling, during harness-validation attempts.
- Passing deterministic local fixture retrievals: `2` (no network).
- `signInWithOtp()`: `0/3` live ceiling.
- OTP verification: `0`.
- Telnyx attempts: `0/3` live ceiling.
- Telnyx inbound: `0/2` live ceiling.
- Geocodio, ORS, Mapbox, Overture, HotelPlanner, push: `0` each.
- Existing provider-ledger delta: `0`.

## Email leg

Email schedule intake remains deliberately deferred. Existing email Auth passed its regression tests and was not modified.

## Remaining unproven work

- **Production SMS readiness / 10DLC:** campaign approval is pending; this is the active Stage 2 blocker.
- **Live bounded Stage 2:** new/returning phone Auth, manual OTP verification, carrier acceptance/receipt, one permitted inbound URL, one permitted numeric reply, and live clarification delivery await the Telnyx gate.
- **Production deployment:** not authorized; product flags remain unchanged.
- **Physical-device/pilot UAT:** handset delivery and the end-user phone flow remain unverified.
- **Phone change:** unverified in Stage 2 because no live Auth/destination was authorized.
- **CALNAME preservation:** separate approved micro-slice, not implemented here.
- **Phase 3A origin:** outside this slice.
- **Email intake:** deferred.

Once the campaign is approved (or written Telnyx permission is provided), resume only the canonical prompt's remaining bounded live portion. Do not repeat the completed isolated schema, mock-intake, regression, or cleanup work without contradictory evidence.
