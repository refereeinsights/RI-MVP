# Corralio — Telnyx Provider-Contract Sub-Spike Report

**Date:** 2026-08-31
**Scope:** Controlled Telnyx phases 1–4 only
**Result:** `PARTIALLY VERIFIED`

No live inbound or outbound SMS was authorized or attempted. The work made no Telnyx, Supabase, DNS, deployment, campaign, or public-route change. It retained no raw provider response, message, phone number, credential, or webhook payload.

## A. Telnyx sub-spike verdict

`PARTIALLY VERIFIED`

The configured account passed the offline safety gate and the intended number/profile relationship was verified through bounded read-only API calls. The documented adapter and webhook contracts are sufficient to design the later implementation. The result is partial because no configured-account send, delivery, inbound event, or webhook signature was exercised; the profile has no webhook URL; and the API did not establish the current 10DLC state. HELP is configured by founder/dashboard evidence and its incomplete API visibility is non-blocking.

### Final closeout findings

1. **Persistent atomic segment ledger: passed.** All required offline assertions passed, including process-restart persistence, global and per-destination limits, fail-closed locking/corruption behavior, ambiguous-outcome reservation retention, and the two-process 19/20 concurrent-writer test. In the race, exactly one writer reserved the final segment, the other was denied, and the persisted total was exactly 20.
2. **Telnyx API authentication: observed successfully** through bounded read-only API requests.
3. **Intended Messaging Profile: observed.** It exists, is enabled, uses webhook API v2, and has smart encoding enabled.
4. **Corralio number: observed without disclosure.** Exactly one active U.S. number matched; its settings report domestic two-way A2P SMS capability and association with the intended Messaging Profile.
5. **Webhook public key: valid/parseable.** The configured value parses as an Ed25519 public key. Synthetic signature tests passed, but no configured-account signed webhook was received.
6. **$5/day provider cap: API-observable.** The profile read exposed an enabled daily spend limit whose amount matches the founder-reported $5 cap; it is not dashboard evidence only.
7. **10DLC status: bounded but unresolved.** The documented brand-list endpoint succeeded and returned zero brands visible to this API key. The documented campaign-list path returned not found. Founder/dashboard evidence says a Sole Proprietor brand exists and the campaign is not approved. Therefore the brand/campaign API status is `UNPROVEN`, and no campaign approval or pre-campaign send authorization exists.
8. **STOP / START / HELP:** START and STOP configuration are `OBSERVED BY READ-ONLY API`, and their provider blocking/unblocking semantics are `DOCUMENTED`. HELP dashboard configuration is `FOUNDER/DASHBOARD CONFIRMED`; read-only API visibility is `UNPROVEN`/absent; actual automatic-response behavior is `UNPROVEN` until later authorized inbound UAT. The HELP visibility discrepancy is accepted and non-blocking.
9. **Outbound API contract: sufficiently established for later implementation.** Required request fields, acceptance/message identifiers, status, encoding/parts/cost, and structured error behavior are documented. Configured-account sending remains intentionally untested and unauthorized.
10. **Inbound and delivery webhook contracts: sufficiently established for later implementation.** Event types, raw-body Ed25519 verification inputs, freshness/replay requirements, event/message identifiers, status fields, quick acknowledgement, retry, duplicate, and out-of-order behavior are documented. Configured-account webhook delivery remains unproven because no webhook URL is configured and no live inbound SMS was authorized.
11. **Remaining Telnyx-specific blockers:** campaign approval or explicit written Telnyx authorization before any applicable outbound test; a future human-authorized webhook URL after the signed handler exists; configured-account signed inbound/delivery UAT; and later provider/application agreement UAT for STOP, START, and HELP. HELP API visibility itself is not a blocker. The separate Supabase/Turnstile Gate 3 work is intentionally excluded from this Telnyx-specific list.

## B. Evidence matrix

| Assertion | Evidence | Minimum result |
|---|---|---|
| API authentication | `OBSERVED BY READ-ONLY API` | Authenticated Telnyx reads succeeded. |
| Intended Messaging Profile | `OBSERVED BY READ-ONLY API` | Profile exists and is enabled. API version is v2 and smart encoding is enabled. |
| Intended number | `OBSERVED BY READ-ONLY API` | Exactly one active U.S. messaging number matched and is associated with the intended profile. Messaging settings report A2P, two-way domestic SMS capability. |
| Daily provider spend cap | `OBSERVED BY READ-ONLY API` | Profile-level daily cap is enabled and matches the founder-reported $5 limit. Telnyx documents a midnight-UTC reset and error `40333` when the limit is reached. |
| Provider START behavior | `OBSERVED BY READ-ONLY API` + `DOCUMENTED` | A START operation with a canonical keyword and response is configured. Telnyx documents that START/UNSTOP removes its profile-level block. |
| Provider STOP behavior | `OBSERVED BY READ-ONLY API` + `DOCUMENTED` | A STOP operation with a canonical keyword and response is configured. Telnyx documents that STOP creates a profile-level destination block and later sends fail with `40300`. |
| Provider HELP dashboard configuration | `FOUNDER/DASHBOARD CONFIRMED` | The default `HELP` keyword and a 122-character Corralio response containing support, frequency, rates, and STOP language are configured. |
| Provider HELP read-only API visibility | `UNPROVEN` | An immediate repeated bounded read returned no HELP operation, keyword, or response object. This API-observability gap is non-blocking and requires no further investigation in this spike. |
| Provider HELP auto-response behavior | `UNPROVEN` | No keyword was sent. Actual behavior is deferred to separately authorized post-implementation live inbound UAT. |
| Application consent synchronization | `DOCUMENTED` | Telnyx may classify inbound reserved keywords, but Corralio must independently persist and enforce consent. Provider suppression is not application consent. |
| 10DLC brand state | `UNPROVEN` | The documented brand-list endpoint succeeded but returned no brands visible to this API key. This conflicts with the founder-observed dashboard state and does not prove that no brand exists. |
| 10DLC campaign state | `UNPROVEN` | The documented campaign-list path returned not found rather than a bounded campaign status. No campaign approval or pre-campaign send authorization is established. |
| Outbound send request/response contract | `DOCUMENTED` | Telnyx documents `POST /v2/messages` with `from`, `to`, and `text`; the response includes a message ID, profile ID, destination status, encoding, parts, cost, and structured errors. No call was made. |
| Configured-account send acceptance, billing, and delivery | `UNPROVEN` | No outbound SMS was authorized or attempted. |
| Inbound and delivery event contracts | `DOCUMENTED` | Telnyx documents `message.received`, `message.sent`, and `message.finalized`; top-level event ID/occurred time and payload message ID support event idempotency and message correlation. |
| Configured-account webhook delivery | `UNPROVEN` | The profile read showed no webhook URL; no event was delivered. |
| Webhook signature verification | `DOCUMENTED` | Telnyx documents Ed25519 headers and signing `{timestamp}|{raw body}`. Synthetic fixture tests passed, but this is not configured-account signature evidence. |
| Webhook replay/idempotency behavior | `DOCUMENTED` | Telnyx documents quick 2xx acknowledgement, retries, possible duplicates/out-of-order events, top-level event IDs, and payload message IDs. Synthetic replay rejection passed only at the local verifier boundary. |
| Live inbound SMS | `UNPROVEN` | No inbound SMS was authorized or attempted. |
| Live evidence in this run | `OBSERVED LIVE` | None. Live SMS was explicitly prohibited. |

Primary contracts: [sending messages](https://developers.telnyx.com/docs/messaging/messages/send-message), [receiving messaging webhooks](https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks), [advanced opt-in/out](https://developers.telnyx.com/docs/messaging/messages/advanced-opt-in-out), [configurable spend limits](https://developers.telnyx.com/docs/messaging/messages/configurable-spend-limits), [messaging profile retrieval](https://developers.telnyx.com/api-reference/profiles/retrieve-a-messaging-profile), [number messaging settings](https://developers.telnyx.com/api-reference/number-settings/retrieve-a-phone-number-with-messaging-settings), [auto-response settings](https://developers.telnyx.com/api-reference/opt-out-management/list-auto-response-settings), [10DLC brands](https://developers.telnyx.com/docs/messaging/10dlc/brand-registration/index), and [10DLC campaigns](https://developers.telnyx.com/docs/messaging/10dlc/campaign-registration).

## C. Safety results

The isolated offline suite passed 6 of 6 tests:

- closed-mode/configuration validation, exact allowlist enforcement, and one-segment rejection;
- persistent per-destination and global UTC-day caps across ledger instances;
- lock-unavailable and corrupt-ledger fail-closed behavior;
- conservative retention of an ambiguous reservation;
- a two-process 19-of-20 race allowing exactly one reservation and rejecting the other; and
- fixture-only signature, missing-header, freshness, malformed-payload, unsupported-event, and replay checks.

The ledger stores destination buckets only as secret-keyed HMAC values, takes an atomic lock, persists by atomic replacement, and treats an attempted/ambiguous provider outcome as consumed. Test ledgers existed only in disposable temporary directories and were removed by the suite.

| Counter | Actual provider traffic |
|---|---:|
| Individual live SMS tests authorized | 0 |
| Segments reserved | 0 |
| Provider send attempts | 0 |
| Provider-accepted segments | 0 |
| Finalized segments | 0 |
| Delivered segments | 0 |

## D. Provider contracts

### Outbound adapter

- Send through `POST /v2/messages` using only the configured sender, normalized allowlisted destination, and bounded text.
- Reserve predicted segments atomically before calling Telnyx; make no automatic retry after an ambiguous outcome.
- Retain the provider message ID only for correlation, and classify provider acceptance separately from final delivery.
- Treat queued/accepted as provider acceptance, not delivery. Parse structured error codes into a closed operational category without logging request content.

### Inbound and delivery webhook

- Receive only `message.received`, `message.sent`, and `message.finalized` at the future signed server boundary.
- Verify `telnyx-signature-ed25519` and `telnyx-timestamp` against the exact raw body before JSON parsing, enforce the documented freshness window, then claim the top-level event ID idempotently before processing.
- Use the payload message ID to join status events to the outbound attempt. Inbound handling needs bounded source/destination, text, encoding/parts, profile ID, and errors; finalization needs destination status, parts, cost, errors, and completion time.
- Return a successful acknowledgement promptly. Expect retries, duplicates, and out-of-order status events; sequencing must use event occurrence time and monotonic application rules rather than arrival order.

### STOP / START / HELP responsibility

- Telnyx enforces its own profile-level STOP block and removes that provider block on START/UNSTOP. A blocked outbound request may return `40300`.
- Telnyx can classify reserved keywords and can send configured auto-responses. This account observably has START and STOP operations. HELP is configured by founder/dashboard evidence but is not API-observable through the bounded read used here. Actual behavior remains deferred rather than inferred.
- Corralio must still verify every signed inbound event, idempotently record the event, maintain its own durable consent state, suppress all application sends while opted out, and reconcile START/STOP state without treating provider configuration as the consent system of record.
- A future live agreement test must prove provider state and Corralio state converge for STOP, START, and HELP. It belongs after the signed webhook and durable consent implementation, not in this sub-spike.

## E. Missing founder/provider inputs or actions

1. Confirm the actual 10DLC brand and campaign state in the Telnyx dashboard or obtain a provider-supported read boundary. The current API evidence is contradictory/incomplete.
2. After a signed handler exists, configure the profile webhook URL through a separately authorized human/provider step and execute bounded signed webhook UAT.
3. Obtain campaign approval or explicit written Telnyx authorization for any applicable pre-campaign test traffic before requesting a live outbound test.
4. Separately authorize each future live inbound/outbound test. This run authorized neither.

Do not send `HELP` during this pre-campaign spike: Telnyx may auto-respond, which could create outbound traffic without individual authorization and a ledger reservation.

## F. Track A implications

The later Track A implementation needs one server-only Telnyx adapter, one centralized persistent send-budget/send-suppression gate, one raw-body signed webhook boundary, an idempotent event store, provider-message correlation, durable consent synchronized from START/STOP, and fail-closed logging that contains no phone number, message body, URL, credential, or OTP. It must keep provider acceptance, final delivery, consent, and application processing as distinct states. Nothing in this report authorizes that implementation.

## G. Full Gate 3 boundary

"This Telnyx-only spike cannot authorize Track A implementation. Full Gate 3 still requires the isolated Supabase phone Auth, Cloudflare Turnstile, rate-limit, and Send SMS Hook spike defined by the canonical Phase A+B prompt."

Remaining canonical Gate 3 work:

- use an isolated test Supabase environment and human-enable phone Auth plus the Send SMS Hook;
- configure and prove Cloudflare Turnstile at the phone-OTP send boundary;
- prove application and provider rate limits, resend cooldowns, OTP attempt limits, enumeration-safe behavior, and hard spend/segment controls together against the abuse matrix;
- prove Supabase-generated OTP → Send SMS Hook → Telnyx → manually entered code end to end under explicit live-test authorization;
- confirm E.164/geographic behavior and obtain usable 10DLC/pre-campaign authorization evidence;
- audit the supported same-user phone/email upgrade boundary without assuming `linkIdentity()`; and
- retain the separate email/Resend authenticity audit as an email-only gate that cannot reverse the SMS-first order.

No Stage 1 product/schema implementation, migration, provider configuration, deployment, campaign submission, commit, or push was authorized or performed by this sub-spike.
