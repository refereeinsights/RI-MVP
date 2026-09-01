# Corralio SMS Track A Test-Environment Readiness Audit

Date: 2026-08-31
Scope: readiness and configuration contract only
Decision: **BLOCKED**

## A. Current Track A verdict

**BLOCKED**

The repository is ready for a founder to provision the missing test inputs, but it is not ready to execute the mandatory live
vendor spike. Corralio contains no Telnyx adapter, signed messaging webhook, SMS consent/send-gating schema, phone-auth UI, Send
SMS Hook implementation, or test-cap ledger. The canonical Phase A+B prompt deliberately requires a capped live provider spike
before Stage 1 product/schema implementation begins.

This creates one important sequencing boundary: the Gate 3 spike may prove provider access, Telnyx signature behavior, bounded
send/receipt behavior, Supabase phone OTP/Send SMS Hook behavior, and dashboard configuration. It cannot prove Corralio's future
durable consent rows or centralized send gate before those Stage 1 boundaries exist. START/STOP persistence and application
suppression must first pass deterministic fixtures after Stage 1, then pass bounded vendor UAT after the human migration/config
gate. They are not prerequisites for authorizing that implementation.

No provider configuration, Supabase configuration, database state, campaign state, deployment, tunnel, or SMS was changed by
this audit.

## Repository evidence

- `docs/prompts/corralio-phase-a-b-phone-auth-schedule-intake-prompt.md` makes Task 0/Gate 3 sequential and prohibits Stage 1
  application/schema implementation until the capped vendor spike passes.
- `apps/corralio/app/components/SignInForm.tsx` implements email OTP only. `apps/corralio/lib/authCallback.ts` handles the current
  email/magic-link/recovery callback vocabulary; no phone OTP surface exists.
- No Corralio Telnyx dependency, provider adapter, inbound messaging route, Send SMS Hook target, channel-identity projection,
  webhook-idempotency store, consent store, suppression writer, or SMS cap ledger exists.
- No `supabase/config.toml` exists in this repository, and no isolated Supabase phone-auth project contract is recorded.
- A names-only inspection of local `.env.local`, `.env.local.example`, and the Corralio Vercel project's configured variable
  names found no Telnyx, CAPTCHA, SMS test-mode, SMS allowlist, or SMS channel-HMAC configuration. No value was copied or printed
  into this report.
- `/sms` is presentation-only and remains fail-closed through `CORRALIO_SMS_OPT_IN_ENABLED`; it is not an operational consent
  writer.
- Telnyx Sole Proprietor classification and the candidate Corralio sender are founder/account evidence recorded in the campaign
  packet. Number assignment to the intended messaging profile, API permissions, webhook key, campaign status, and deliverability
  remain unproven.
- The supplied readiness instruction says external 10DLC registration is in progress, while the local campaign packet says it
  is intentionally not yet submit-ready. Neither statement is live dashboard evidence. Treat the exact brand/campaign status as
  unproven until a names/status-only Telnyx read reconciles them; do not weaken the stricter submission gate in the meantime.

Current primary contracts reviewed:

- https://supabase.com/docs/guides/auth/phone-login
- https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook
- https://supabase.com/docs/guides/auth/auth-captcha
- https://supabase.com/docs/guides/auth/rate-limits
- https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks
- https://developers.telnyx.com/docs/messaging/messages/advanced-opt-in-out
- https://developers.telnyx.com/docs/messaging/10dlc/sole-proprietor

## B. Remaining prerequisites

1. A least-privilege Telnyx API key usable in the isolated test contract.
2. The test sender, its messaging-profile ID, proof that the number is assigned to that profile, and the account webhook public
   key.
3. A founder-controlled U.S. mobile destination, normalized to E.164 and expressly approved for this test.
4. Verified provider-level daily spend protection. The approximately `$5/day` limit is founder-reported, not repository-proven.
5. The isolated spike runner's test-mode and hard-cap implementation described below. It does not exist yet and cannot be
   represented as active merely by adding environment variables. Building and proving that runner offline is the first step of
   the next execution prompt; it is not Stage 1 product/schema implementation.
6. A dedicated 256-bit channel-identity HMAC secret.
7. An isolated nonproduction Supabase project/configuration for phone Auth and Send SMS Hook testing. Existing Corralio
   production/shared credentials must not be reused for a destructive auth spike.
8. Cloudflare Turnstile isolated-test credentials and Supabase configuration. The founder selected Turnstile on 2026-08-31; the
   decision does not configure it or make CAPTCHA sufficient as an SMS cost boundary.
9. A recorded 10DLC/campaign status and an explicit Telnyx-supported preapproval path before any outbound U.S. long-code SMS.
10. A public HTTPS webhook endpoint after the handler exists. No routable Telnyx webhook route exists today.

## C. Founder setup checklist

1. In Telnyx, create or identify a least-privilege test API key; do not paste it into chat or a tracked file.
2. Confirm the candidate Corralio number is SMS-capable, assigned to the intended messaging profile, and record the profile ID.
3. Retrieve the account's Ed25519 webhook public key from Telnyx Keys & Credentials.
4. Confirm the messaging profile's provider-level daily spend limit is enabled and record the exact limit without exposing keys.
5. Choose one founder-controlled U.S. mobile phone, record it in E.164 only in the local/development secret store, and authorize
   that destination for the bounded spike.
6. Generate and securely store an independent 256-bit HMAC secret. Do not reuse a Supabase, Telnyx, Vercel, VAPID, cron, or
   evidence-fingerprint secret.
7. Provision Cloudflare Turnstile test credentials for the phone-OTP boundary and provide the site/secret pair through the
   Cloudflare and isolated Supabase dashboards. Do not configure either service during the Telnyx-only sub-spike.
8. Create or identify an isolated nonproduction Supabase project. Confirm it contains no production Auth users or Corralio
   household data.
9. Record current 10DLC brand/campaign status and obtain explicit Telnyx confirmation of any permitted preapproval outbound test
   path. Do not infer permission from possession of an API key or phone number.
10. Supply only the names-only readiness confirmation to Codex. Secrets remain in ignored local configuration or the relevant
    provider's encrypted environment store.

## D. Environment-variable contract

These names are new proposed repository contracts because no working SMS names exist to preserve.

| Name | Source and format | Secret? | Scope | Needed for |
| --- | --- | --- | --- | --- |
| `TELNYX_API_KEY` | Telnyx API v2 bearer credential | Yes | Isolated local/dev first; production later gets a separate value | Outbound, OTP |
| `TELNYX_MESSAGING_PROFILE_ID` | Telnyx UUID-like profile identifier | No, but server-only config | Isolated local/dev; production later | Inbound routing, outbound, delivery events |
| `TELNYX_PUBLIC_KEY` | Telnyx Ed25519 webhook public key, exactly as supplied by Telnyx | No, but server-only config | Isolated local/dev; production later | Inbound and delivery signature verification |
| `TELNYX_PHONE_NUMBER` | Messaging-enabled sender in normalized E.164 | Sensitive operational config | Isolated local/dev; production later | Inbound, outbound, OTP |
| `CORRALIO_SMS_TEST_ALLOWLIST` | Comma-separated exact normalized E.164 destinations; test phone only | Yes: personal data | Local/dev only; never a production entitlement | Any live test send |
| `CORRALIO_SMS_SEND_MODE` | Closed enum: `disabled` or `test_allowlist` | No | Every environment; default/absence means disabled | Central fail-closed send decision |
| `CORRALIO_SMS_CHANNEL_HMAC_SECRET` | Independent random 256-bit secret, base64/base64url encoded | Yes | Separate value per isolated test and production | Service-only inbound lookup projection |
| `CORRALIO_SMS_TEST_DAILY_SEGMENT_LIMIT` | Integer `20` | No | Test only | Account/application test cap |
| `CORRALIO_SMS_TEST_DESTINATION_DAILY_SEGMENT_LIMIT` | Integer `5` | No | Test only | Destination test cap |
| `CORRALIO_SMS_MAX_SEGMENTS_PER_MESSAGE` | Integer `1` during the spike | No | Test only; production requires a later decision | Loop/cost protection |
| `CORRALIO_SMS_WEBHOOK_MAX_AGE_SECONDS` | Integer `300` | No | Test and future production | Replay-window enforcement |

`CORRALIO_SMS_OPT_IN_ENABLED` is not part of the test spike. It stays absent/false.

Cloudflare Turnstile is the selected CAPTCHA provider. Stage 1 must choose a provider-explicit name for its public site key; the
secret belongs in Supabase/Cloudflare configuration or server-only environment storage and never in `NEXT_PUBLIC_*`. Do not add
an application secret variable unless the audited implementation actually performs direct server verification.

Verify each value without printing it: assert presence, validate type/length/closed enum/E.164 syntax, and for Telnyx IDs perform
only the explicitly authorized bounded provider read. Local secrets belong in an ignored `.env.local`-class file or a secret
manager. They never belong in `.env.local.example`, logs, screenshots, command output, notes, or commits.

### Why the channel HMAC is still required

The planned service-only channel projection needs deterministic inbound lookup without storing the raw phone number as an
ordinary queryable value. Normalize the verified E.164 credential, then compute HMAC-SHA-256 with
`CORRALIO_SMS_CHANNEL_HMAC_SECRET`; an unkeyed hash is vulnerable to enumeration of the small phone-number space. The HMAC is a
lookup index, not authentication, encryption, consent, or credential authority. Supabase Auth remains authoritative for the raw
verified phone credential, and every inbound mutation still requires valid Telnyx signature/replay checks plus current household
authorization.

Generate at least 32 cryptographically random bytes with a trusted password-manager/CSPRNG facility, encode them as base64 or
base64url, and write the value directly to the isolated secret store without displaying or committing it. Use a new independent
value for production. Rotation will require an explicit versioned dual-read/reindex plan; silently replacing the key would make
existing projections unreachable. No secret was generated by this audit.

## E. Telnyx dashboard packet

### Webhook values

No URL should be entered yet because the handler does not exist. The smallest future route is one signed event boundary for all
messaging events:

- Test: `POST https://<founder-approved-test-origin>/api/webhooks/telnyx/messaging`
- Future production: `POST https://corralio.com/api/webhooks/telnyx/messaging`

Use the same primary messaging-profile URL for `message.received`, `message.sent`, and `message.finalized`. Per-message callback
URLs are unnecessary for V1. The production URL is documentation, not deployment authorization.

### Verification contract

- Read the raw request bytes before JSON parsing.
- Require `telnyx-signature-ed25519` and `telnyx-timestamp`.
- Verify Telnyx's signature over `{timestamp}|{raw_json_payload}` with `TELNYX_PUBLIC_KEY`.
- Reject malformed, unsigned, invalid, or more-than-300-seconds-old events before any lookup or mutation.
- Deduplicate on top-level `data.id` with a durable unique constraint; treat retries as successful no-ops.
- Accept only the bounded event types required by this slice and return `2xx` within Telnyx's two-second requirement after a
  durable claim. Never log message text, OTPs, full phone numbers, key material, or raw payloads.

### Profile review

Before a live test, confirm the number/profile association, daily spend limit, webhook URL, smart encoding, and exact default
START/STOP/HELP keyword behavior. Telnyx's default opt-out system may automatically send responses. Therefore a live inbound
keyword test can produce outbound A2P traffic and is not automatically safe before campaign approval. Either obtain written
provider confirmation of a compliant test path or restrict preapproval work to signed fixtures/mocks and a non-keyword inbound
message that provably cannot trigger an auto-response.

A stable authorized preview/test deployment is preferred for the live webhook. Telnyx documents ngrok for local development,
but this repository has no approved tunnel contract. A tunnel requires separate founder authorization, must expose only the
single handler, must use HTTPS, and must be removed immediately after the test.

## F. Supabase dashboard packet

Perform these actions only in the isolated nonproduction project and only after the narrow Send SMS Hook target and capped send
boundary exist:

1. Confirm the project reference is not the production/shared Corralio project.
2. Auth > Providers: enable Phone. Leave existing email Auth behavior unchanged.
3. Auth > Hooks: configure the Send SMS Hook to the reviewed hook target. Supabase remains authoritative for OTP generation and
   verification; the hook only delivers the manually entered code through the centralized capped Telnyx adapter.
4. Auth > Bot and Abuse Protection: enable Cloudflare Turnstile using its isolated-test credentials.
5. Auth > Rate Limits: apply the test-only limits below and record a settings screenshot with secrets redacted.
6. Confirm the OTP is six digits. Use the platform-supported expiry setting; repository authority currently contains conflicting
   provider wording (one current page says one-hour expiry while another says verify within 60 seconds), so do not claim an exact
   expiry until the isolated dashboard/API value is inspected and recorded.
7. Keep production phone Auth disabled. Do not import production users, use production phone identities, or connect the isolated
   project to production Corralio tables.
8. After the spike, delete the disposable Auth identity and any test-only hook/configuration if the environment will not be
   retained.

The repository does not yet contain enough implementation to exercise this packet end-to-end. In particular, there is no Send
SMS Hook target or app rate-limit boundary to configure today.

## G. Test safety limits

### Provider/application spend controls

- Provider emergency ceiling: verify the founder-reported Telnyx limit of approximately `$5/day`; do not raise it.
- Application total: `20` SMS segments per UTC day across the isolated test environment.
- Destination: `5` SMS segments per UTC day for the one allowlisted E.164 destination.
- Message: `1` GSM-7 segment maximum. Reject Unicode/multipart output during the spike.
- Concurrency: one spike runner; no parallel live sends.
- Mode: absence/invalidity of the mode, caps, ledger, or allowlist fails closed before the provider call.
- Counting: atomically reserve a segment before calling Telnyx. A provider attempt consumes the reservation regardless of
  delivery outcome; retries require a new reservation and cannot exceed either cap.

These controls require implementation in the isolated spike runner before its first live send. The runner may use an ignored
local ledger with an exclusive lock, atomic reservations, and only an HMAC of the destination. Keep the current UTC day's safety
ledger through the end of that day so restarting or rerunning the spike cannot reset the cap. Merely setting the values does not
create enforcement. This harness is allowed before Stage 1; a production send gate or database schema is not.

### Test-only OTP abuse matrix

These are conservative isolated-test defaults, not production policy:

- CAPTCHA required before every OTP-send request.
- Generic response; do not reveal whether a phone identity exists.
- Per IP: at most `5` OTP-send attempts/hour.
- Per normalized phone HMAC: at most `3` OTP-send attempts/hour.
- Resend cooldown: at least `60` seconds.
- Verification attempts: at most `5` submissions per issued challenge, subject also to Supabase's provider limit.
- Per-destination and total segment caps above remain authoritative even when CAPTCHA and rate-limit checks pass.
- All rate-limit and cap checks are server-side. CAPTCHA is never treated as a spend boundary.

Before production, these values require abuse/cost evidence and a separate production-readiness decision.

### Test-phone contract

The phone is an ordinary founder-controlled U.S. mobile capable of receiving SMS. Store it only as normalized E.164 in the
test secret allowlist. It must not belong to a customer, must not be interpreted as production consent, and must not be copied
to docs/logs. Removal means deleting it from the allowlist/secret store, deleting the disposable Supabase Auth user, and rolling
back all test channel-identity, consent, webhook-idempotency, pending-intake, and household records. Retain only the
destination-HMAC/count safety ledger until its UTC-day expiry, then delete it. Confirm cleanup by identifiers/counts, not by
printing the phone.

## H. Controlled test procedure

### Gate 3A — prerequisite spike before Stage 1 implementation

1. Implement the smallest isolated spike runner and ignored, locked, atomic segment ledger. Prove configuration validation,
   destination allowlisting, all three caps, restart persistence, concurrent reservation safety, and disabled-by-default behavior
   offline. Do not add product schema or a production send path. No provider call.
2. Verify a captured official/test Telnyx fixture with a valid signature; reject bad signature, stale timestamp, replay, malformed
   JSON, and unsupported event type. No database mutation beyond disposable local fixture state.
3. Confirm the Telnyx key, number, profile association, public key, provider spend cap, and campaign status using the minimum
   authorized reads. Do not print values or raw responses.
4. Confirm isolated Supabase phone Auth, Cloudflare Turnstile configuration, rate limits, and the available Send SMS Hook
   configuration surface.
5. If Telnyx explicitly permits one controlled preapproval outbound test, enable `test_allowlist` for one process and send one
   one-segment neutral transactional test to the allowlisted phone. Expect one Telnyx message ID/status only in sanitized state,
   one reserved cap unit, and no product/consent mutation. Stop after receipt/final status. If permission is absent, record the
   outbound and OTP portions as blocked; do not attempt them.
6. If outbound is permitted and the isolated Send SMS Hook target exists, request and manually verify one phone OTP. Expect one
   disposable Auth identity, one capped provider attempt, no OTP/phone in logs, and successful manual `verifyOtp` session.
7. Remove the disposable Auth identity and product test records. Disable test mode. Report exact segment-ledger delta and
   cleanup zero except for the intentionally retained, non-PII UTC-day safety ledger; remove that ledger after its expiry.

Passing Gate 3A authorizes Stage 1 repository implementation and unapplied migrations/verifiers. It does not authorize public
phone Auth, SMS intake, campaign submission, production sending, or `/sms` activation.

### Stage 1 deterministic verification and later bounded vendor UAT

After Stage 1 code, human migration/configuration, and catalog/behavioral verifiers:

1. Verify valid/bad/stale/replayed signature fixtures.
2. Process mocked START twice; expect one active consent state and idempotent webhook claims.
3. Process mocked HELP; expect no consent-state change and only the bounded help outcome.
4. Process mocked STOP twice; expect durable suppression and no duplicate state transition.
5. Attempt an app send while suppressed; expect rejection before Telnyx and no cap reservation.
6. Only with explicit live-test approval and 10DLC/provider permission, send live START from the allowlisted phone and verify
   provider/app agreement without printing the number or message payload.
7. Test HELP, then STOP. Verify provider block and Corralio suppression agree.
8. Attempt one outbound transaction while stopped; expect application suppression before provider.
9. Send live START again, then at most one one-segment outbound transaction; verify `message.sent`/`message.finalized` handling.
10. Run one OTP only if the isolated Auth hook, CAPTCHA, all rate limits, and campaign/test authorization are ready.
11. Disable test mode, remove the allowlist and disposable records, and prove cleanup zero.

At every step, expected logs are constant/sanitized outcome codes and opaque event/message identifiers only. Stop immediately
on a signature, idempotency, consent, suppression, cap, allowlist, or cleanup failure.

## I. What can be tested before 10DLC approval

| Test | Before approval? | Boundary |
| --- | --- | --- |
| A. Signature fixtures | Yes | Offline only; use valid/invalid/stale/replayed fixtures |
| B. Mocked inbound events | Yes | Offline/local only; no Telnyx request and no raw production payload |
| C. Live inbound SMS | Conditional | Receiving itself does not prove outbound authorization. Use only if the number/profile is ready and no keyword auto-response can create unapproved A2P traffic, or Telnyx explicitly approves the test path |
| D. Live outbound SMS | No by default | Requires campaign approval or explicit written Telnyx test authorization; API acceptance is not legal/carrier authorization |
| E. OTP SMS | No by default | It is outbound A2P traffic and needs the same authorization as D plus isolated Supabase/CAPTCHA/caps |
| F. Production transactional SMS | No | Requires campaign approval and the independent production-readiness gate |

Local fixtures do not establish provider acceptance, carrier delivery, real STOP blocking, or OTP delivery. Those remain clearly
unproven until an authorized live test occurs.

## J. Next execution prompt

The executable prompt is filed at:

`docs/prompts/corralio-sms-track-a-controlled-vendor-spike-prompt.md`

Do not run it until every named founder prerequisite is present and the invocation contains explicit authorization for the exact
number of live segments. If 10DLC is still pending and no Telnyx-approved test path is documented, run only its fixture and
read-only provider/configuration gates and stop before the first send.
