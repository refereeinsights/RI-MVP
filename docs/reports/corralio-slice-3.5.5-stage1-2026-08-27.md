# Corralio Slice 3.5.5 Stage 1 Report

## Outcome

Slice 3.5.5 is prepared for the human-controlled database gate. Stage 1 changed repository code and prepared an unapplied forward migration plus catalog and rollback-only behavioral verifiers. It did not apply SQL, fetch an ICS feed, invoke production cron, reprocess events, push, or deploy.

Verdict: `SLICE 3.5.5 READY FOR DATABASE VERIFICATION`

## Audit facts

- The applied batch claim is service-role-only, uses a ten-minute claim timeout, deterministic oldest-attempt ordering, `FOR UPDATE SKIP LOCKED`, and a hard maximum batch of ten. Its applied freshness gate is still 23 hours; changing only the TypeScript constant would not change production eligibility.
- `last_synced_at` is written only by successful canonical persistence and remains the successful-freshness timestamp. `last_refresh_attempted_at` is distinct attempt/claim metadata.
- Aggregate-only inspection found four active connected sources. All four were eligible, unpaused ICS sources; all were in `success`, none had an attempt in the preceding 24 hours, and all had a prior successful refresh. No identifiers, URLs, feed contents, event text, or private locations were printed or retained.
- Recent batch-size history is `UNPROVEN`; the repository and retained platform evidence do not contain a suitable history. No logging was added to manufacture an answer.
- The live Corralio Vercel project is Pro, its production deployment was ready, and the prior registered cron was `17 11 * * *`. No schedule-refresh invocation appeared in the retained one-day logs inspected. Cron registration therefore was not treated as execution proof. The Supabase server configuration was established after that day's scheduled time, so Stage 2 must prove the first viable invocation separately.
- ICS fetching is not represented in the existing Corralio provider/quota ledger. Stage 1 made exactly zero fixture/feed fetches and added no analytics, provider, quota, or cost instrumentation.

## Bounded operating decision

- The prepared schedule is `17 */4 * * *`; automatic eligibility is three hours, the claim timeout stays ten minutes, and the sequential batch stays capped at ten.
- This is at most six cron invocations and 60 claimed feed fetches per day. At the audited four-source population, the projected maximum is 24 feed fetches per day if every source is eligible at each invocation: five more invocations and up to 20 more fetches than the prior once-daily cadence.
- Batch size was not increased because no worst-case feed-host load, execution-duration, or higher-concurrency safety proof exists. Current population fits within one batch.
- The consecutive-failure threshold remains three, but a source cannot pause until at least 24 hours have elapsed since the first failure in the current sequence. Rapid polling therefore cannot turn three failures in 8–12 hours into a pause. Successful automatic/manual canonical persistence and validated replacement reset the failure sequence. Paused sources retain the existing replace-calendar-link recovery in V1 and are not manually retried.
- Manual refresh uses one household/source-bound, service-only row-locking claim. It shares claim state with cron and enforces a five-minute per-source database cooldown. There is no household daily cap or additional cost throttle in V1.

## Repository implementation

- The existing fetch, normalize, canonical persistence, failure finalization, and best-effort venue-matching pipeline is factored into one shared single-claim worker used by both automatic and manual refresh.
- The authenticated Server Action resolves the viewer household server-side. Only trusted server code receives a claimed source URL/token; browser results are bounded to safe outcome copy and event count.
- Family shows per-source successful freshness and failure-aware copy. This Weekend shows one conservative aggregate line. Relative time uses a fixed/injected clock, and the server passes a serialized reference time to client presentation.
- The unapplied migration adds the minimum private failure-window timestamp, revises the service-only batch claim, adds the service-only single-source claim, and revises failure finalization. It does not fetch feeds or reprocess events.
- The catalog verifier checks private metadata, ownership, grants, fixed paths, service execution, row locking, the cadence/caps, cooldown, timeout, and failure window. The behavioral verifier proves household isolation, safe outcomes, cooldown, shared-claim exclusion, three-hour eligibility, failure timing, paused behavior, and post-rollback cleanup zero without network access or a production-cron race.

## Stage 1 verification

- Corralio/shared schedule tests: 254 passed.
- Corralio TypeScript: passed.
- Corralio lint: passed with zero warnings.
- React/Next review: passed; server authorization remains in the Server Action/service boundary, client props contain no source credential, and fixed reference time avoids a relative-time hydration mismatch.
- `git diff --check`: passed.
- Production builds: `corp-app`, `corralio-app`, `referee-app`, and `ti-web` passed. RefereeInsights and TournamentInsights emitted only existing unrelated warnings.

## Human database gate

Apply `supabase/migrations/20260827_corralio_slice355_schedule_freshness.sql`, then run:

1. `scripts/analysis/corralio_slice355_catalog_verification.sql`
2. `scripts/analysis/corralio_slice355_behavioral_verification.sql`

Do not begin Stage 2 UAT until both pass. Stage 2 must still prove controlled fixture behavior, exact feed-fetch and existing-ledger deltas, presentation/authorization, and independent cleanup zero before a complete-local verdict.
