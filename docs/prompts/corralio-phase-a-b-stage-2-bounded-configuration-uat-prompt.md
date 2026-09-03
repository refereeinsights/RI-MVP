# Corralio Phase A+B — Stage 2 Bounded Configuration & UAT

Execute **Phase A+B Stage 2 bounded configuration and UAT only**.

Current authoritative state:

`CORRALIO PHASE A+B DATABASE VERIFICATION PASSED`

Stage 1 repository implementation and production database behavior have passed their catalog, rollback-only behavioral, real-concurrency, and cleanup-zero gates.

Do not reopen Stage 1 architecture unless Stage 2 produces concrete contradictory evidence.

This prompt authorizes controlled nonproduction configuration and UAT. It does not authorize production activation, production customer traffic, a live SMS campaign, a production deployment, a push, or unrelated product work.

## Objective

Prove as much of the implemented Phase A+B path as the authorized provider state permits:

**phone-auth request**
→ **durable request authorization and one-use permit**
→ **signed Send SMS Hook**
→ **manual phone OTP verification, only if live Telnyx test traffic is separately permitted**
→ **verified channel identity**
→ **URL-only SMS calendar intake**
→ **inbound idempotency**
→ **encrypted pending intake**
→ **bounded mock clarification**
→ **schedule connection**

This is UAT of the implemented product boundary. It is not production activation or SMS Production Readiness sign-off.

## 1. Before execution

### 1.1 Remove the incorrect local Supabase value

Remove this incorrect entry from `apps/referee/.env.local` if it is still present:

```text
SUPABASE_ACCESS_TOKEN=<short browser verification code>
```

Do not replace it with the CLI's real token. `supabase login` stores the CLI credential through its own secure credential boundary. Never print or expose that credential.

### 1.2 Reconfirm settled authority

Reconfirm without reopening:

- Phase A+B production database verification passed.
- `pendingSecret.server.ts` is the authoritative pending-URL encryption boundary.
- Gate 3 durable safety state is verified.
- Gate 3 isolated Auth/runtime mock-provider path passed.
- Slice 3.6B Phase 1 remains authoritative for required arrival.
- Existing email authentication remains present and usable.
- Email schedule intake remains deferred because authenticated Resend inbound-sender evidence is unproven.

### 1.3 Preserve unrelated work

Inspect the working tree before acting. Do not modify, stage, discard, or commit unrelated TI/RI/Corralio work.

## 2. Isolated-environment stop gate

Use only infrastructure proven distinct from the production customer surface. The intended retained resources are:

- isolated Supabase project: `azuwuouctkyppkrugnls`;
- isolated Vercel project/hostname: `corralio-gate3-isolated.vercel.app`;
- isolated Cloudflare widget: `corralio-gate3-isolated`, authorized only for that hostname.

Do not point an isolated deployment at the production Supabase project. Do not enable production Supabase Phone Auth, CAPTCHA, or hooks for this UAT.

Before configuration, audit the isolated database schema read-only. Prove it contains the minimum dependency closure needed by Phase A+B:

- Gate 3 durable SMS safety tables/RPCs;
- Corralio households and active-owner membership;
- children and teams;
- schedule sources and events;
- canonical ICS persistence/ingestion dependencies;
- required-arrival dependencies already consumed by the application;
- the Phase A+B migration objects.

The isolated project was originally created for Gate 3 and must not be assumed to contain the full Corralio schema.

If the dependency closure is missing:

1. Do not copy production data.
2. Do not connect the isolated runtime to production.
3. Do not indiscriminately apply every monorepo migration.
4. Enumerate the smallest schema-only migration closure and verify it contains no unrelated data mutation.
5. Apply that closure only if it is bounded, reviewable, and clearly authorized by this prompt.
6. Run the applicable catalog and rollback-only behavioral verifiers in the isolated project.
7. If a safe closure cannot be established, stop with `CORRALIO PHASE A+B STAGE 2 BLOCKED` and report the isolated-schema requirement.

No UAT begins until the isolated schema and isolated runtime point to the same project and every prerequisite verifier passes there.

## 3. Configuration allowlist

Configure only the minimum isolated values required for this UAT. Never copy or load the complete production `.env.local`.

Allowed isolated runtime categories:

- isolated Supabase URL, public key, and service-role key;
- `CORRALIO_SITE_URL` fixed to the isolated HTTPS origin;
- isolated Turnstile public site key;
- `CORRALIO_PHONE_AUTH_ENABLED=true`;
- `CORRALIO_PHONE_AUTH_SMS_HOOK_ENABLED=true`;
- `CORRALIO_PHONE_AUTH_SMS_PROVIDER=mock` or `telnyx` only as permitted below;
- `CORRALIO_SMS_INTAKE_ENABLED=true`;
- `CORRALIO_SMS_INTAKE_PROVIDER=mock` only;
- the isolated Send SMS Hook signing secret;
- the dedicated channel-identity HMAC secret;
- the pending-secret active key version, its one isolated encryption key, and the independent fingerprint key;
- isolated Telnyx credentials only if the live-Telnyx gate passes;
- synthetic HMAC allowlist and bounded durable SMS policy.

Do not deploy a database connection string. Do not add unrelated application/provider secrets. Confirm the isolated runtime contains no Telnyx credential before every mock-only test.

## 4. SMS safety controls

Preserve the verified Gate 3 controls:

```text
CORRALIO_SMS_SEND_MODE=test_allowlist
global test segments/day=20
destination test segments/day=5
maximum segments/message=1
```

Only founder-controlled, explicitly allowlisted destinations may receive a message. Persistent PostgreSQL policy remains authoritative. No in-memory/file fallback is allowed.

At-most-one Telnyx provider attempt per authorized hook is the invariant. Never claim exactly-once delivery. Once provider-attempt authorization is granted, the segment remains consumed for that UTC test day even if the provider result is ambiguous.

### Per-session call ceilings

These are stricter than the durable daily limits:

- `signInWithOtp()` calls: maximum **3**;
- Telnyx outbound OTP attempts: maximum **3**;
- live inbound handset messages: maximum **3**;
- live outbound clarification/status replies: **0**;
- controlled ICS fixture fetches: maximum **4**;
- expected Geocodio calls: **0**;
- expected ORS calls: **0**;
- expected Mapbox calls: **0**;
- expected Overture calls: **0**;
- expected HotelPlanner calls: **0**;
- expected push calls: **0**.

Do not automatically consume any ceiling. Use the minimum needed. Stop as soon as evidence is sufficient.

## 5. Telnyx authorization gate

Before any live Telnyx attempt, verify current account evidence for one of:

1. the applicable 10DLC campaign is approved for this traffic; or
2. explicit written Telnyx authorization exists for the exact bounded pre-campaign test traffic.

Also prove the selected sender/profile is dedicated or safe for isolated testing and that changing its webhook cannot interrupt production/customer messaging.

If these requirements are not met:

- make no Telnyx request;
- perform every mock/offline/database test that remains safe;
- do not attempt manual OTP completion;
- return `CORRALIO PHASE A+B STAGE 2 BLOCKED`, identifying live OTP/handset evidence as the remaining blocker.

Do not bypass this gate. The task does not authorize 10DLC submission, campaign changes, or broad account reconfiguration.

## 6. Mock-versus-live evidence boundary

Keep these claims separate:

- A mock Send SMS Hook proves signature verification, durable authorization, segment reservation, response contract, and at-most-one provider invocation. It does not expose the OTP and cannot prove manual OTP verification.
- A synthetic correctly signed inbound webhook proves parser, signature, replay, identity, pending-intake, and ingestion behavior. It is not an observed Telnyx delivery.
- A real Telnyx inbound message proves provider delivery to the isolated webhook only when the Telnyx gate passed.
- `CORRALIO_SMS_INTAKE_PROVIDER=mock` controls reply delivery. The implemented Stage 1 route intentionally makes no live clarification/status send.

Stage 2 must not claim live clarification delivery, handset receipt, or production readiness from mock evidence.

## 7. Phone-auth UAT

Only if the Telnyx authorization gate passes, use founder-controlled/disposable allowlisted destinations to verify:

### New phone user

- phone-only signup works with no email;
- a fresh Turnstile token is passed once;
- durable request authorization occurs before `signInWithOtp()`;
- manual six-digit OTP semantics are used;
- successful `verifyOtp(type: "sms")` establishes the Supabase identity and session;
- household creation follows the existing `corralio_ensure_owner_household`/RLS path;
- the channel projection is created only from the server-confirmed verified Auth phone.

### Existing phone user

Use a second authorized OTP request only if needed to prove sign-in returns to the same Auth identity and household without duplication.

### Phone change

Test phone change only if a second founder-controlled allowlisted destination is available and the additional OTP remains within the three-call ceiling. Verify `phone_change` OTP semantics, replacement of the active projection, and failure of the old inbound lookup.

If no second authorized destination exists, report phone change as `UNVERIFIED IN STAGE 2`; do not improvise a destination or treat that fact alone as an architecture defect.

### Existing email authentication

Verify the existing email-auth surface and deterministic tests/build remain intact. No real email delivery is required or authorized merely for this regression check. Do not merge phone and email identities automatically.

## 8. Channel-identity UAT

Verify:

- Supabase Auth remains authoritative for the raw phone;
- Corralio stores only the approved HMAC lookup projection;
- projection occurs only after server-confirmed phone verification;
- ordinary authenticated clients cannot enumerate or read channel identities;
- inbound lookup resolves the intended user;
- membership is resolved fresh before mutation;
- cross-household access fails;
- phone change, if exercised, deactivates the old projection.

Never print a raw phone value while proving these assertions.

## 9. Controlled ICS fixture

Use one public, credential-free, synthetic ICS subscription fixture:

- no secret or private subscription token;
- no customer/family data;
- no event locations where practical, ensuring expected geocoding/routing calls remain zero;
- stable events sufficient to prove parsing and persistence;
- explicit owner and teardown path;
- no redirect to an unapproved host.

Declare the expected fetch count before UAT. The normal ambiguous path is expected to fetch once for inspection and once for final ingestion after clarification. Duplicate/replayed inbound events must add zero fetches.

Do not send attachments, PDFs, CSVs, screenshots, or arbitrary schedule prose. Send only the exact approved fixture URL.

## 10. SMS intake and idempotency UAT

Exercise the implemented URL-only path:

```text
verified/synthetic signed inbound event
→ separate inbound-event claim
→ sender channel lookup
→ fresh household authorization
→ URL validation
→ controlled ICS inspection
→ deterministic assignment decision
```

Verify a replay of the same inbound event:

- returns bounded duplicate behavior;
- creates no second claim/intake/source;
- performs no additional fixture fetch;
- remains separate from the Supabase Send SMS Hook claim domain.

Unknown senders and malformed content must stop before calendar retrieval and household mutation without revealing account existence.

## 11. Assignment and CALNAME boundary

The pure rule `corralio-sms-assignment-v1` remains:

- exact normalized CALNAME equals a complete active team name;
- at least one event title contains that same exact complete team name;
- exactly one eligible household target satisfies both;
- no fuzzy matching and no conflicting evidence.

Repository fact: the real Stage 1 adapter currently supplies `calendarName: null` because the separately authorized CALNAME preservation micro-slice has not landed. Therefore:

- real Stage 2 intake must not auto-assign;
- compatible automatic-assignment behavior may be tested only at the pure deterministic rule boundary;
- the product-path UAT must produce bounded clarification rather than guessing.

For an initial connection, pass the selected assignment into the existing `ingestCorralioSchedule` path. Do **not** call `corralio_update_schedule_source_assignment_v1` merely to create the initial assignment. That RPC remains the canonical boundary for later reassignment of an already-connected source.

Where practical, use one child with two same-sport teams to prove they remain distinct and ambiguity does not collapse them.

## 12. Pending-intake and bounded clarification UAT

Exercise at least one ambiguous path and prove:

- the raw URL is normalized and encrypted through `pendingSecret.server.ts`;
- only the AES-256-GCM envelope and independently keyed fingerprint persist;
- no plaintext URL appears in database state, logs, analytics, or errors;
- one bounded clarification is recorded through the mock reply seam;
- reply correlation is deterministic;
- a numeric assignment choice resolves at most one pending intake;
- decryption occurs only in trusted server code at resolution;
- final ingestion uses the existing shared ingestion core;
- the envelope is removed on resolve, cancellation, or expiration;
- resolved/expired/cancelled intake cannot be replayed.

Example mock clarification shape:

> Which team is this schedule for? Reply with a number: 1. Avery - Spokane Select; 2. Avery - Mead Panthers; 3. Keep it unassigned

Do not generalize this into conversational SMS. Because live reply delivery is not implemented, report this as mock clarification evidence even if the incoming URL/choice arrived through real Telnyx.

## 13. Required-arrival non-regression

Phase A+B implemented no SMS arrival-question/reply flow. A numeric SMS is an assignment choice, not an arrival buffer. Do not send or interpret `45` as an arrival preference.

Verify only that Phase A+B did not change:

```text
ics_explicit
→ source_preference
→ team_preference
→ corralio_default
```

Do not create a new arrival tier, column, writer, question, parser branch, or resolution rule. `corralio_update_schedule_source_arrival_v1` remains the existing authenticated source-preference writer but is not part of SMS intake UAT.

## 14. Home/origin and email intake

Do not implement or UAT home/origin here. Phase 3A owns that capability. Never request a home address through SMS.

Email schedule intake is not required for Stage 2. Do not weaken sender authentication, configure DNS, or let deferred Resend evidence block the independently valid SMS-first engineering result. Report the email leg as deferred.

## 15. Privacy verification

Confirm no new log, report, screenshot, fixture, or retained database evidence contains:

- raw phone or email;
- raw calendar URL;
- SMS body;
- OTP;
- Turnstile token;
- webhook signature or hook payload;
- encryption/HMAC keys;
- provider credentials;
- home/origin.

Use only bounded statuses, opaque synthetic identifiers, and aggregate counts. A test report may state that a field was present and validated without printing its value.

## 16. Cleanup contract

Before UAT, reserve a unique synthetic namespace and prove it is empty. Do not delete pre-existing rows as setup.

After UAT:

- remove disposable Auth identities;
- remove synthetic households, memberships, children, teams, sources, and events;
- remove channel projections, pending intake, and inbound claims;
- remove durable request decisions, rate/cooldown state, permits, hook claims, and segment counters created by the session;
- remove synthetic allowlist entries;
- restore the complete durable SMS policy exactly, including `updated_at`;
- remove the temporary ICS fixture;
- restore/disable isolated Phone Auth, CAPTCHA, Send SMS Hook, feature flags, and Telnyx webhook configuration as appropriate;
- remove every temporary isolated runtime secret not part of the retained disabled harness.

Exact synthetic database setup and cleanup may use the authenticated linked Supabase Management API because the application service role intentionally lacks direct delete access to protected claim state. This is operator verification authority only and must not become an application cleanup route/RPC.

Independently assert cleanup zero across Auth and every touched Corralio/Gate 3 table. Do not leave test households, messages, URLs, provider routing, credentials, or enabled configuration behind.

## 17. Verification

Run:

- focused Phase A+B tests;
- pending-secret boundary tests;
- Gate 3 safety tests;
- relevant shared schedule tests;
- explicit Corralio TypeScript;
- zero-warning Corralio lint;
- Corralio production build;
- any other workspace build genuinely affected by Stage 2 corrections;
- `git diff --check`;
- privacy-safe sensitive-data/secret scan.

Report exact fixture-fetch counts, Auth calls, provider calls, segment reservations, and existing provider-ledger deltas. Do not add analytics or provider instrumentation merely to answer a UAT question; report unavailable evidence as `UNPROVEN`.

## 18. Allowed verdicts

Return exactly one:

`CORRALIO PHASE A+B STAGE 2 UAT PASSED`

or

`CORRALIO PHASE A+B STAGE 2 BLOCKED`

A pass means the implemented Stage 1 contract was proven within the explicit mock/live evidence boundaries. It does not mean production ready. If the Telnyx authorization gate does not pass, manual phone OTP and handset evidence remain blocking and the required verdict is `BLOCKED` even when all mock evidence passes.

## 19. Required report

Return:

1. Verdict.
2. Isolated environment and schema-readiness result.
3. Non-secret configuration summary.
4. Per-call phone-auth evidence for new user, returning user, and phone change if exercised.
5. Email-auth regression result.
6. Channel projection, inbound lookup, fresh authorization, and RLS result.
7. Telnyx accounting: attempts, accepted, delivered, inbound messages, replayed events, and billed segments.
8. Mock accounting: hook deliveries, provider invocations, synthetic inbound events, and mock clarification records.
9. SMS intake state progression without message or URL content.
10. Pending encryption/fingerprint/terminal cleanup result.
11. Assignment and CALNAME-boundary result.
12. Required-arrival non-regression result.
13. Privacy/security result.
14. Cleanup-zero and configuration-restoration result.
15. Tests/builds/diff/secret-scan results.
16. Exact calls used against each ceiling.
17. Email-leg status.
18. Remaining unproven work, separated into production SMS readiness, 10DLC/compliance, production deployment, physical-device/pilot UAT, Phase 3A origin, live clarification delivery, CALNAME preservation, phone change if untested, and deferred email intake.

Update `apps/corralio/notes.md` and the appropriate CPO execution/closeout documentation with the evidence-backed result. Do not commit unless separately authorized.

## 20. Stop condition

Stop immediately after the Stage 2 verdict and report.

Stage 2 does not authorize:

- production SMS or Phone Auth activation;
- production deployment;
- production customer traffic;
- 10DLC submission or campaign changes;
- subscription/entitlement work;
- new analytics;
- live clarification/status sends;
- CALNAME implementation;
- arrival or origin changes;
- email intake implementation;
- Phase 3A;
- push or commit without separate authorization.
