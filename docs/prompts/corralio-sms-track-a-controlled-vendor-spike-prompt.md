# Corralio — Controlled Telnyx Vendor-Contract Sub-Spike

You are executing the smallest safe pre-implementation Telnyx provider-contract sub-spike for Corralio.

This is not the full SMS implementation, phone-auth implementation, production SMS enablement, or a 10DLC submission task. It
is only one component of the canonical Phase A+B Task 0 / Gate 3.

## Repository and founder state

- Telnyx account, Corralio Messaging Profile, and U.S. local Corralio number exist by founder report.
- Telnyx profile-level STOP / START / HELP are configured by founder report.
- The provider-level daily spend cap is `$5/day` by founder report and must be verified read-only.
- A 10DLC brand exists; the campaign is not approved unless a current read proves otherwise.
- Legal/compliance surfaces exist locally but are not deployed.
- No Telnyx adapter, public webhook, consent store, Send SMS Hook, phone-auth UI, or application SMS ledger exists yet.
- Cloudflare Turnstile is founder-approved for future Stage 1 phone authentication. It is not configured and is outside this
  Telnyx-only sub-spike.

## Goal

Establish, with explicitly classified evidence:

1. whether Corralio can authenticate to Telnyx with the configured API key;
2. whether the intended Messaging Profile and Corralio number can be resolved and their association verified;
3. the documented outbound request and bounded response contract relevant to the future adapter;
4. the documented inbound and delivery-status webhook contracts;
5. the signature headers, public-key verification, timestamp freshness, and event/message identifiers needed for replay and
   idempotency controls;
6. the documented and account-observable STOP / START / HELP responsibilities of Telnyx versus Corralio; and
7. what remains unproven or prohibited before 10DLC campaign approval.

## Required founder inputs and execution authorization

Before any provider read, require presence of the applicable values without printing them:

- `TELNYX_API_KEY`
- `TELNYX_MESSAGING_PROFILE_ID`
- `TELNYX_PUBLIC_KEY`
- `TELNYX_PHONE_NUMBER`
- `CORRALIO_SMS_CHANNEL_HMAC_SECRET`
- `CORRALIO_SMS_TEST_ALLOWLIST`
- `CORRALIO_SMS_SEND_MODE=test_allowlist`
- `CORRALIO_SMS_TEST_DAILY_SEGMENT_LIMIT=20`
- `CORRALIO_SMS_TEST_DESTINATION_DAILY_SEGMENT_LIMIT=5`
- `CORRALIO_SMS_MAX_SEGMENTS_PER_MESSAGE=1`

The founder must also provide or confirm:

- the single founder-controlled destination is normalized to E.164 and present in the secret allowlist;
- the provider `$5/day` limit is enabled and must not be raised;
- current 10DLC campaign status;
- whether Telnyx has given explicit written authorization for applicable pre-campaign outbound test traffic; and
- separate explicit authorization for each individual live inbound or outbound test in this run.

This prompt's approval is not live-send authorization. Working credentials, an existing number, a submitted registration, or a
successful read do not imply permission to send.

If a value needed for the requested phase is absent or malformed, report only its name and stop that phase. Never disclose its
value.

## Hard scope boundary

Do not:

- implement Track A product behavior, channel identity, consent persistence, schedule intake, phone Auth, or a Supabase Send SMS
  Hook;
- expose a public SMS endpoint or enable `/sms`;
- configure Telnyx, Cloudflare, Supabase, DNS, a tunnel, or any external dashboard;
- deploy, submit or activate a campaign, send production traffic, or contact a non-allowlisted destination;
- add marketing, bulk, scheduled, automatic-retry, or looping behavior; or
- commit, push, or retain secrets/raw provider evidence.

The only repository implementation permitted is the smallest isolated test runner, locked persistent segment ledger, minimized
fixtures, and focused offline tests required to make this sub-spike safe.

## Evidence classification and minimization

Label every material finding exactly one of:

- `DOCUMENTED` — supported by current provider documentation but not observed against Corralio's account;
- `OBSERVED BY READ-ONLY API` — observed against Corralio's account without SMS delivery or external mutation;
- `OBSERVED LIVE` — actually exercised and directly observed in the authorized test environment; or
- `UNPROVEN` — not established by sufficient evidence.

Documentation, SDK behavior, synthetic fixtures, and sample payloads never prove configured-account behavior. Only a genuinely
exercised account behavior may be `OBSERVED LIVE`.

Collect only field names, boolean presence, bounded status categories, redacted identifiers, lengths/counts, signature outcome,
timestamp/replay outcome, calculated segment count, and provider acceptance category. Do not print, persist, commit, or report:

- raw webhook payloads or provider responses;
- complete message bodies or phone numbers;
- API keys, credentials, HMAC secrets, auth tokens, or OTPs; or
- unredacted identifiers unless strictly necessary.

## Persistent atomic segment ledger

Before any live outbound request, implement and prove a locked persistent ledger whose counters survive process restarts and are
shared across separate runner processes. A procedural, shell-session, in-memory, or operator-maintained counter is prohibited.
Store no raw phone number; key the destination bucket with HMAC-SHA-256 of normalized E.164 using
`CORRALIO_SMS_CHANNEL_HMAC_SECRET`.

The ledger must atomically:

1. calculate the predicted billed segment count;
2. reject a message exceeding `CORRALIO_SMS_MAX_SEGMENTS_PER_MESSAGE`;
3. check the UTC-day global and per-destination budgets;
4. reserve the predicted segment count; and
5. only then permit the Telnyx call.

Concurrent attempts must not collectively exceed a cap. Prove the 19/20 two-writer race fails safely. If the ledger, lock, clock,
configuration, HMAC, or transaction cannot establish budget safely, fail closed before Telnyx.

An attempted provider call consumes its reservation. Retain reservations for timeouts, malformed responses, lost connections,
and other ambiguous outcomes. Release or reconcile only when provider non-acceptance is conclusively established. Prefer
conservative overcounting. Retain the non-PII UTC-day safety ledger through its expiry so a restart/rerun cannot reset the cap.

## Phase 1 — Offline safety verification

Before any Telnyx call:

1. Audit `git status` and preserve unrelated/user changes.
2. Validate all configuration formats without printing values. Prove missing/invalid mode defaults to disabled.
3. Implement and test the isolated ledger described above.
4. Prove allowlist denial, global cap, per-destination cap, one-segment cap, process-restart persistence, concurrent atomic
   reservation, ambiguous-outcome retention, and ledger-unavailable fail-closed behavior.
5. Using minimized synthetic fixtures and a local test keypair, prove the future verifier rejects missing headers, bad signatures,
   stale timestamps, malformed JSON, unsupported event types, and replayed event IDs. Clearly label these results `DOCUMENTED`
   or fixture-only—not configured-account signature proof.

Report pass/fail. Stop before provider access if any safety assertion fails.

## Phase 2 — Read-only Telnyx account verification

Perform only the minimum non-message-sending API reads required to:

- verify API authentication;
- resolve the intended Messaging Profile;
- verify the intended number is messaging-capable and associated with that profile;
- validate public-key presence/format without exposing it;
- verify the provider daily spend-limit status and amount category;
- inspect the bounded profile keyword/opt-out configuration status where the API exposes it; and
- obtain the current bounded 10DLC brand/campaign status.

Do not change any provider object. Keep only boolean/bounded status results. Label each finding `OBSERVED BY READ-ONLY API` or
`UNPROVEN`.

## Phase 3 — Documented adapter and webhook contracts

Using current primary Telnyx documentation and minimized synthetic examples, report only the fields Track A needs:

- outbound endpoint/method and required request fields;
- bounded acceptance/rejection/status fields and provider message ID;
- `message.received`, `message.sent`, and `message.finalized` field locations;
- source/destination, message body, delivery status, segment count, and error-category field locations;
- `telnyx-signature-ed25519` and `telnyx-timestamp` headers;
- raw-body signature input and five-minute freshness rule;
- top-level provider event ID for webhook idempotency and provider message ID for message correlation; and
- retry/quick-acknowledgement expectations.

Do not retain or reproduce raw payloads. These findings remain `DOCUMENTED` unless an authorized live configured-account event
actually proves them.

## Phase 4 — STOP / START / HELP responsibility

Determine from current documentation and bounded account reads:

- what Telnyx handles automatically;
- whether provider STOP blocks later provider sends and START removes that provider block;
- whether HELP can produce a provider-managed response;
- which inbound events/keyword classifications are delivered to the application; and
- what Corralio must still persist and enforce independently.

Never infer application consent from provider suppression or keyword configuration. Do not send a live keyword during this
sub-spike if it could trigger an automatic provider/carrier response. Live START/STOP/HELP and provider/application agreement
remain part of later SMS Production Readiness after implementation.

## Phase 5 — Optional single live outbound test

Skip this phase unless every condition is independently proven:

1. destination is founder-controlled and exactly allowlisted;
2. persistent ledger is operational across processes;
3. atomic reservation and fail-closed behavior passed offline;
4. global and destination budgets permit the request;
5. the bounded message is calculated to fit one billed GSM-7 segment;
6. Telnyx has provided explicit written authorization for applicable pre-campaign test traffic, or the applicable 10DLC campaign
   is approved; and
7. the founder explicitly authorized this individual outbound test and a maximum of one live segment for it.

If allowed, use one neutral non-marketing message with no OTP, child, schedule, customer, or other personal data. Reserve one
segment atomically before the request. Make one provider call with no automatic retry. Record only an acceptance category,
redacted identifier if necessary, final bounded status if received, and ledger delta. An unclear outcome retains the reservation.

If any condition is missing, skip and identify the condition. Do not reinterpret a skip as failure of the documented contract.

## Phase 6 — Optional single live inbound test

Skip unless Telnyx/carrier rules permit it, the founder separately authorizes this individual inbound test, the founder-controlled
phone is allowlisted, and the event can be observed without configuring a webhook, tunnel, dashboard, or external service.

Use one neutral non-keyword message. Do not send `START`, `STOP`, or `HELP`, and skip if any automatic response might be emitted.
Do not claim or persist consent. If no existing observation boundary exists, do not fake one and do not change configuration;
report the live inbound contract `UNPROVEN` and identify the future signed webhook prerequisite.

## Cleanup

- Return send mode to disabled and remove the runtime allowlist after any authorized live phase.
- Remove disposable runner state and test artifacts containing sensitive data.
- Retain only the destination-HMAC/count UTC-day safety ledger until expiry, then remove it.
- Do not delete founder-owned Telnyx numbers, profiles, keys, brands, or campaigns.
- Confirm no provider/dashboard mutation, production data, public route, deployment, campaign submission, phone Auth, or Supabase
  change occurred.

## Required report

Return:

### A. Telnyx sub-spike verdict

Choose exactly one:

- `TELNYX CONTRACT VERIFIED`
- `PARTIALLY VERIFIED`
- `BLOCKED`

### B. Evidence matrix

For every material API, outbound, inbound, delivery, signature, idempotency, keyword, spend-cap, campaign, and billing assertion,
give one evidence label and the minimum supporting result.

### C. Safety results

Report offline ledger/allowlist/fail-closed/concurrency tests and exact authorized, reserved, attempted, accepted, finalized, and
delivered segment counts. Do not include sensitive values.

### D. Provider contracts

Report the minimized adapter, inbound webhook, delivery webhook, signature/replay, and STOP/START/HELP responsibility contracts.

### E. Missing founder/provider inputs

List only genuine remaining inputs or external actions.

### F. Track A implications

Describe what the later implementation must build without implementing it in this sub-spike.

### G. Full Gate 3 boundary

State verbatim:

**This Telnyx-only spike cannot authorize Track A implementation. Full Gate 3 still requires the isolated Supabase phone Auth,
Cloudflare Turnstile, rate-limit, and Send SMS Hook spike defined by the canonical Phase A+B prompt.**

Then list every remaining canonical Gate 3 requirement. Do not produce or authorize the Track A implementation prompt merely
because this Telnyx sub-spike passes.

## Terminal constraints

Do not commit, push, deploy, send without the separate individual authorization above, submit or activate 10DLC, enable `/sms`,
or configure any external service.
