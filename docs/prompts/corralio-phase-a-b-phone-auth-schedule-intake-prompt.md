# Corralio Phase A+B — Phone-First Channel Identity & Deterministic Schedule Intake (v2, corrected)

**Infrastructure-and-narrow-build only. Does not authorize a full SMS onboarding conversation, AI/LLM extraction, CSV/PDF/screenshot/`.ics`-attachment ingestion, a general conversational assistant, anonymous pre-account claim infrastructure, message-based schedule-management commands (rename/disconnect/etc.), or any live-traffic/notification work. Those remain separately scoped and separately gated — see "Explicit non-goals" below.**

**Founder-reviewed and accepted, 2026-08-31.** The review cycle is closed — per the founder's own framing, "the architecture is converging; the next leverage is implementation and real-feed evidence," not another investigation. Slice 3.6B Phase 1 is complete locally and its dependency is satisfied by `34d83cf4`. This prompt is ready for its audit-first execution under the gates below. The ICS calendar-metadata micro-slice remains a soft prerequisite, not a hard blocker; Section 6.4 degrades gracefully if it has not landed.

> **v2 revision note, 2026-08-31.** This supersedes the v1 prompt filed 2026-08-30. Codex ran a security and architecture review of v1 and the founder accepted its findings, with the corrections below. v1's core scope (phone-first identity, deterministic link-based intake, infrastructure-not-onboarding-conversation) is unchanged; what changed is *how* — no tap-to-verify links, no `.ics` attachments in V1, a real bounded pending-intake state instead of "connect unassigned or nothing," a shared identity-resolution core instead of two independent webhook handlers, and a full inbound-channel-security and SMS-compliance gate list that v1 only gestured at. Read this document in full even if you reviewed v1 — do not assume unchanged section numbers mean unchanged content.
>
> **Same-day follow-up, 2026-08-31.** SMS Production Readiness is promoted to its own top-level, independently tracked gate (Section 9) — it was previously folded into Task 3 (Section 7) as though it were part of that task's engineering scope. It is not. Section numbers 9 onward shifted accordingly (Execution Gates is now Section 10, Verification is now Section 11).
>
> **Second same-day follow-up, 2026-08-31.** Section 6.2 and 6.4 amended: (a) named the existing ingestion function (`ingestCorralioSchedule()`) and assignment RPC (`corralio_update_schedule_source_assignment_v1`) this task should call, rather than describing "a shared core" and "existing primitives" in the abstract; (b) recorded that per-event title text is the only feed-evidence signal available today, pending a small, separate, independently-shippable prerequisite to preserve `X-WR-CALNAME` calendar-level metadata (currently parsed by `node-ical` and discarded) — see `2026-08-31-cpo-audit-ics-calendar-metadata.md` for the full audit and the recommendation that this land as its own prerequisite micro-slice, not inside this prompt.
>
> **Third same-day follow-up, 2026-08-31 — founder acceptance.** The CALNAME micro-slice recommendation is accepted (Do Now) and filed separately at `docs/prompts/corralio-ics-calendar-metadata-preservation-micro-slice-prompt.md`, carrying a binding acceptance rule — *"Preserve calendar-level metadata and provenance; do not derive or persist canonical team/sport values solely from `X-WR-CALNAME`. Any inference must remain confidence-scored and fall back to parent confirmation"* — that governs Section 6.4's eventual consumption of that field as much as it governs the micro-slice itself. This prompt (Phase A+B) is now founder-reviewed and accepted; see the updated status line above.
>
> **Fourth same-day follow-up, 2026-08-31 — email vendor domains confirmed.** Section 3 (item 4) and the email Task 3 (Section 7) record Resend as confirmed, with `mail.corralio.com` live for outbound send and `inbound.corralio.com` planned for receiving. DNS/MX setup proceeds independently; live webhook configuration and authenticated-message evidence remain audit gates before the later email leg.
>
> **Fifth same-day correction, 2026-08-31 — current repository authority.** Phase 1 completion (`34d83cf4`) removes the arrival stop gate; SMS intake is implemented before email intake; no specific Supabase identity-linking API is assumed before audit; and all origin implementation remains in Phase 3A. These corrections supersede conflicting language below.

> **Stage 1 execution correction, 2026-09-02 — founder authorization.** The following Stage 1 rules are authoritative wherever they conflict with older Task 0, execution-gate, verification, or implementation wording in this prompt. They authorize repository implementation, deterministic tests, and unapplied database artifacts only. They do not authorize an applied migration, live Telnyx request, handset SMS/OTP, production Phone Auth/SMS, external configuration, deployment, 10DLC change, or push.

### Authoritative Stage 1 execution rules

1. **Gate 3 status and Stage 1 override.** Gate 3's durable-state and isolated Supabase Phone Auth, Cloudflare Turnstile, signed Send SMS Hook, durable authorization, segment reservation, and mock-provider sub-gates are complete and repository-verified at `b06daada`. Use the precise status **Gate 3 isolated Auth/runtime verification passed — mock provider only**. Live Telnyx provider attempt, handset receipt, real handset OTP verification, production Phone Auth, and SMS Production Readiness remain unproven. The older Task 0 live-Telnyx requirement does not block this Stage 1 repository implementation; it moves to separately authorized post-migration/Stage 2 UAT. No live Telnyx request is authorized here.

2. **The Gate 3 harness is not the product surface.** `/gate3-isolated`, its isolated OTP-request orchestration, mock sink, `requestIsolatedSmsOtp()`, and isolated-runtime configuration remain verification-only. Do not expose, rename, or adapt them into production phone auth. Reuse only appropriate pure/proven components: durable request authorization, HMAC helpers, Send SMS Hook verification/response contract, durable hook authorization, and segment-safety primitives. The observed successful hook response is HTTP `200`, `Content-Type: application/json`, body `{}`; do not revert it to an empty `200`.

   Phase A must explicitly support both a new phone user and an existing verified phone user. It must not inherit the harness's `shouldCreateUser: false`. Create or update the channel projection only after successful Supabase OTP verification, using the server-verified Supabase user ID and server-confirmed verified phone credential. Never mark a projection verified from a browser-supplied phone claim. Authentication proves identity; household membership/RLS separately authorizes access.

3. **Secure pending calendar-URL storage.** If an ambiguous SMS intake must retain a credential-bearing calendar URL across messages, store it only using authenticated encryption with a versioned server-only encryption key. Use a separately keyed deterministic fingerprint for idempotency/deduplication; do not reuse the channel HMAC secret as the encryption key. The forced-RLS, service-only pending record must contain no plaintext URL, and no raw URL may enter identifiers, logs, analytics, or errors. Delete encrypted URL material when the intake resolves, expires, or is cancelled. If the repository lacks an acceptable server-only authenticated-encryption/key-versioning boundary, stop this portion and report the blocker. Do not persist plaintext, connect an ambiguous intake as unassigned to avoid the issue, or invent reversible obfuscation.

4. **Separate webhook idempotency domains.** Preserve `corralio_sms_webhook_claims` exclusively for Supabase Send SMS Hook/outbound provider-attempt authorization. Do not overload it for inbound Telnyx messages. Add only the smallest separate service-only Telnyx inbound event claim keyed by the vendor event/message identifier, with a closed lifecycle, bounded retention, replay/duplicate safety, and no raw phone/message body. Do not build a generic messaging-event framework.

5. **New product surfaces are disabled by default.** Production phone-auth entry UI, OTP-request route, Telnyx inbound processing, and outbound clarification delivery must fail closed unless narrowly scoped server-side configuration explicitly enables them. Default or absent configuration means disabled. No public/client-controlled flag may act as the security boundary. Existing email authentication remains fully usable regardless of these settings. Stage 1 does not activate production Phone Auth or SMS.

6. **Stage 1 proof boundary.** Before `CORRALIO PHASE A+B READY FOR DATABASE VERIFICATION`, prove behavior with deterministic unit/integration tests, injected dependencies/fakes, synthetic signed webhook fixtures, mocked Telnyx adapters, unapplied migration review, read-only catalog verifiers, rollback-only behavioral verifiers, and true-concurrency verifier artifacts wherever claims/resolution require atomicity. Do not claim live handset delivery, live Telnyx intake, carrier delivery, applied RLS, production Auth, or live OTP verification. The Stage 1 verdict means the repository implementation/database artifacts are ready to verify, not that the live channel is ready.

7. **Conservative deterministic assignment.** Do not assign from fuzzy event-title similarity alone. A V1 automatic assignment requires a versioned deterministic rule, compatible feed evidence, exactly one eligible household target, and no conflicting evidence. Document the exact rule, evidence inputs, eligibility criteria, ambiguity behavior, and positive/negative fixtures before implementation. If evidence does not uniquely satisfy the rule, create pending intake and ask the bounded clarification. If the CALNAME micro-slice has not landed, do not block this work, reimplement it inline, or compensate with fuzzy titles.

8. **Email may remain blocked.** SMS remains first. If the Stage 1 audit cannot prove the required authenticated Resend inbound-sender contract, leave the email leg unimplemented and report it blocked/deferred. Do not weaken sender authorization, configure DNS/live Resend webhooks, or let the email gap block independently valid SMS-first Stage 1 work.

9. **Settled boundaries remain unchanged.** Preserve phone-only customer lifecycle, optional email, manual OTP, Cloudflare Turnstile, URL-only SMS-first intake, bounded pending state, no general assistant/attachments/AI/origin/billing, and no production SMS activation. Required arrival remains `ics_explicit → source_preference → team_preference → corralio_default`; a parent value writes only through `corralio_update_schedule_source_arrival_v1`. Add no competing arrival schema/resolver.

10. **Stage 1 stop.** Execute repository implementation and prepare unapplied database artifacts only. Stop at exactly `CORRALIO PHASE A+B READY FOR DATABASE VERIFICATION`, or return `CORRALIO PHASE A+B BLOCKED` for a material blocker. Do not apply Phase A+B migrations, configure production Supabase/live Telnyx inbound, send SMS/OTP, deploy phone auth, modify 10DLC, implement Phase 3A, or push.

> **Required-arrival invariant:** **3.6B Phase 1 is complete and authoritative for required-arrival resolution. Phase A+B consumes that capability; it does not extend, duplicate, or reinterpret its schema, resolver, precedence, or write boundary.**

> **Founder direction, 2026-08-30, dependency satisfied 2026-08-31.** The critical-path fork is active: `Phase 1 ✓ → { this Phase A+B work || 3.6B Phase 2 (parallel/non-blocking/inconclusive on current evidence) || HotelPlanner Phase 3B evidence diagnostic } → resume 3A → 3B → 4 → 5`. Phase A+B reuses Phase 1's completed arrival capability; it does not reopen it.

## 0. Why This Exists

Corralio's core loop starts with "Connect schedules," and that step today requires a parent to already be an authenticated web user navigating settings UI. The founder's direction is to let a parent begin the Corralio relationship — verify identity, connect a first schedule, receive real value back — without installing a PWA, granting notification permission, or providing an email address, using channels (phone/SMS, email) a parent already has open. This prompt builds the pieces of infrastructure that make that possible: a phone-capable identity/authentication layer, a bounded service-only channel-identity mapping shared by both inbound channels, and a deterministic (calendar/subscription-URL-based) schedule-intake path reachable from outside the authenticated web app.

**This is explicitly infrastructure, not the finished onboarding experience.** The founder's own instruction, restated in the v2 correction: *"Do not build a general conversational assistant."* The target experience is *"I told Corralio I wanted to connect my kid's schedule, and Corralio guided me through only the information it actually needed"* — not *"I filled out signup over SMS,"* and not *"Corralio imported an ambiguous calendar and made me go organize it on the website."* Required arrival is ready and authoritative at `34d83cf4`. Sport/team inference maturity, secure temporary-location capture (Phase 3A), and per-source-platform evidence remain separate capabilities. Build the plumbing — including the one bounded clarification loop specified in Section 6.3 — without duplicating any of those capabilities.

**Home/default-origin remains outside this scope.** Phase 3A owns its page, storage, authorization, geocoding/routing, and value exchange. Phase A+B may later link to that capability after it exists; it does not build any part of it. See Section 6.6.

## 1. Confirmed Starting Facts (verify independently before relying on them)

Established by direct repository inspection during v1 authoring — re-confirm before building if anything looks stale:

- **Household creation has no email-specific step anywhere in it.** `corralio_ensure_owner_household()` (`supabase/migrations/20260818_corralio_household_rls_foundation.sql:478-524`), a `security definer` Postgres RPC, reads `auth.uid()` and lazily creates a household + owner membership row the first time any authenticated action needs one. It's invoked from `getOwnerContext()` (`apps/corralio/app/actions.ts:46-58`) and `lib/schedules/supabaseStore.ts:31`. It has never known or cared which auth provider produced the `auth.uid()` — a phone-authenticated session hits this exact same path with zero changes required.
- **Auth today is entirely email-based.** `SUPPORTED_OTP_TYPES = new Set(["email", "magiclink", "recovery"])` (`apps/corralio/lib/authCallback.ts:3`) excludes phone. No phone-auth code exists anywhere in `apps/corralio`. `@supabase/supabase-js@^2.95.3` and `@supabase/ssr@^0.8.0` are the current versions — recent enough to support Supabase's native phone-OTP auth and Auth Hooks.
- **Supabase Auth has built-in phone sign-in** (`signInWithOtp({ phone })` → `verifyOtp({ phone, token, type: "sms" })`), and a **Send SMS Hook** that replaces Supabase's built-in SMS delivery entirely — the hook receives the phone number and the generated OTP, and application code is responsible for actually sending it via any vendor. This decouples the auth-provider decision from the SMS-vendor decision: Telnyx (the vendor baseline from `2026-08-30-cpo-review-standard-plus-pro-monetization-economics.md`) can be used for OTP delivery without adopting Twilio just because it's on Supabase's natively-integrated list (Twilio, MessageBird, Vonage, TextLocal). **V2 correction: use this mechanism only to deliver a manually-entered OTP code (Section 5). Do not use it to construct any link containing the code — see Section 5.3.**
- **SMS provider readiness is not yet proven; Resend domain facts are known.** Re-audit current Telnyx credentials/configuration and live Supabase Send SMS Hook readiness rather than relying on the original v1 absence claim. Resend is selected, `mail.corralio.com` is live for outbound send, and `inbound.corralio.com` is the planned receiving domain; its inbound signature/authenticated-sender contract remains to be proven before Task 3.
- **`corralio_schedule_sources` already supports household-level/unassigned sources.** `child_id` and `team_id` are both nullable with `constraint ... check (num_nonnulls(child_id, team_id) <= 1)` (`...household_rls_foundation.sql:92-129`). A source with both null is valid today. **V2 note: this remains true, but Section 6.4 below requires that ambiguous intake not default into this unassigned state merely to avoid building resolution — unassigned is a legitimate terminal state when the parent explicitly chooses it, not a shortcut around the pending-intake flow.**
- **The deterministic ICS ingestion pipeline (`ingest.ts`, `refresh.ts`, `teamConnection.ts`, `platforms.ts`) already exists and is unchanged by this work.** Both new intake surfaces (email, SMS) are new *front doors* onto this pipeline, not new parsing capability. **V2 scope note: both front doors now route through one shared ingestion-core function (Section 4), not two independent handlers calling the pipeline separately as v1 implied.**
- **No application-level rate limiting or CAPTCHA exists for any auth flow today.** The email-recovery route (`app/api/auth/recovery/route.ts`) relies entirely on Supabase Auth's own built-in send-rate limits (default: one OTP per 60 seconds per identifier, 1-hour expiry) and an enumeration-safe generic response pattern. There is nothing to extend — this prompt's phone-OTP send endpoint needs the same discipline built fresh. **V2 correction: CAPTCHA alone is not an acceptable cost/abuse boundary for SMS — see the independent SMS Production Readiness gate, Section 9. That gate is tracked separately from this task's engineering completion.**
- **No logging of schedule URLs or message bodies exists today, and this must not regress.** `databaseFailure()` (`lib/schedules/supabaseStore.ts:10-16`, `refreshSupabaseStore.ts:8-14`) explicitly logs only a stage name and error code, never the URL, event payload, or upstream response. Raw schedule URLs — which may carry embedded access tokens in their query string, confirmed unredacted at storage — are persisted in `corralio_schedule_sources.source_url` but never logged. **V2 note: this discipline now also applies to the new pending-intake table (Section 6.3) and the new channel-identity table (Section 4.2) — neither may hold or log a raw calendar URL, phone number, or channel value in plaintext where an ordinary log line or authenticated-client query could expose it.**
- **Required-arrival resolution is complete and shared.** Phase 1 added nullable, bounded `corralio_schedule_sources.arrival_buffer_minutes` plus the narrow owner-authorized `corralio_update_schedule_source_arrival_v1` writer. The authoritative resolver hierarchy is `ics_explicit → source_preference → team_preference → corralio_default`; What Fits and This Weekend/Leave-by consume the same resolver. No child-level preference exists or is needed here.
- **No schema existed at prompt-authoring time for pending/unresolved intake, channel identity, or webhook idempotency tracking.** Re-audit before building. Any still-missing state belongs only to Sections 4.2, 6.3, and 8 and must be minimal/purpose-built; do not overload arrival or origin tables.

## 2. Explicit Non-Goals (binding scope boundary)

Do not build any of the following as part of this prompt, even if they seem like small additions once the infrastructure exists:

- **No full SMS/email onboarding conversation, and no general conversational assistant.** The one bounded exception is the single deterministic clarification loop specified in Section 6.3 (association) and the single deterministic arrival-value question specified in Section 6.5 — both are narrow, single-purpose, state-machine-driven exchanges, not an open-ended conversational surface. Do not generalize either into a chatbot.
- **No `.ics` file attachments, PDF, CSV, screenshots, or arbitrary forwarded prose.** V1 proposed `.ics` attachment intake for the email leg; this is removed in v2. **V1 is only calendar/subscription URLs** — a durable, refreshable source, matching Corralio's existing schedule-source model. A file attachment is a one-time snapshot and would require a separate product/data model for freshness, identity, deduplication, storage, and deletion that does not exist and is out of scope here. The parent-facing copy in both the email and SMS leg must accurately say Corralio needs the calendar/subscription **link**, not "your schedule" or "a file."
- **No AI/LLM extraction.** Association and arrival inference (Sections 6.4, 6.5) use the existing platform/feed-metadata evidence already available to the ingestion pipeline — not free-text or AI interpretation of message bodies.
- **No anonymous pre-account claim infrastructure.** Every household this work creates or attaches to is authenticated, from the moment of phone/email verification — there is no unclaimed/anonymous intermediate state. (The bounded pending-intake state in Section 6.3 is not an exception to this: it is always tied server-side to an already-resolved authenticated household — see Section 6.3's requirement list.)
- **No message-based schedule-management commands** (rename child, rename team, change arrival buffer beyond the one bounded intake-time question, disconnect calendar). Separately evaluated in `2026-08-30-cpo-decision-email-sms-schedule-intake-and-management.md`; not authorized here even though the underlying mutations (`renameChild`, `updateTeam`, `disconnectSchedule`) already exist.
- **No notification/brief delivery work.** Phase C remains separately scoped. Its Phase 1 arrival dependency is satisfied, but this prompt only establishes channel identity/intake; it does not build delivery.
- **No live-traffic or checkpoint-monitoring work.** Unrelated to this prompt.
- **No entitlement/billing/tier gating.** Nothing in this prompt is Plus/Pro-gated; none of it should reference or depend on billing infrastructure, which doesn't exist.
- **No home/default-origin implementation in Phase A+B.** Phase 3A owns it. No SMS collection and no URL carrying sensitive state; Section 6.6 permits only a future plain navigation link to an already-built Phase 3A capability.
- **No opaque prefetch-resistant one-time authentication link in this phase.** V1's tap-to-verify link is removed (Section 5.3). A future opaque, prefetch-resistant link design may be investigated separately, later, as its own reviewed piece of work — do not build a version of it here under a different name.

## 3. Task 0 — Vendor/Provider Spike (prerequisite, do first; scope expanded in v2)

Before writing product code, re-audit Telnyx and Supabase phone-auth configuration in a test environment with hard cost/segment caps in place (Sections 6.1 and 9):

1. **Confirm Telnyx account access and API credentials** for outbound SMS send, and confirm Telnyx's own webhook signature-verification mechanism (needed for Sections 6.1 and 8).
2. **Enable phone auth in the Supabase project and confirm the Send SMS Hook mechanism works end-to-end**: Supabase generates an OTP, the hook receives it, a test call to Telnyx's send API succeeds, and the OTP is delivered as a manually-enterable code — not embedded in any link (Section 5.3).
3. **Audit Supabase's currently supported phone+email identity/account-upgrade mechanisms directly.** Do not assume `linkIdentity()` exists, applies to phone/email, preserves the same `auth.users` identity, or is safe for this flow merely because a similarly named client API appears in general documentation. Establish the exact supported server/client boundary, reauthentication requirements, collision behavior, and effect on the existing `auth.uid()`. If no safe same-user mechanism is proven, stop Section 5.5 and return the smallest founder decision packet; do not merge users or invent an account-linking layer.
4. **Confirm what authenticated-message evidence is actually available for inbound email.** Resend and the two domain roles are confirmed, but Task 3 remains after SMS. Before implementing it, prove the exact webhook signature/replay contract, message identifier, payload bounds, and precision of any SPF/DKIM/DMARC-alignment evidence against the live test account. DNS setup may proceed independently, but configuring a live webhook is separately authorized and the email handler must not be built on an assumed `From` trust model.
5. **Confirm phone-number geography/format handling** required for E.164 normalization and any geographic policy the vendor enforces (Section 9).
6. **Confirm current A2P/10DLC registration status and expected timeline** — this feeds SMS-first Task 2 engineering and the independent SMS Production Readiness gate (Section 9). Registration timing does not reverse the implementation order or authorize production sends; re-check it at the start of SMS implementation because timing may move.

Report findings before proceeding. A Telnyx or Supabase phone-auth failure blocks the affected SMS/auth work. An unproven optional-email identity mechanism blocks only Section 5.5, and an unproven Resend sender-authentication contract blocks only Task 3; neither may reverse the SMS-first sequence or invalidate independently safe SMS work. These assumptions must be verified against live test accounts, not inferred from documentation.

## 4. Shared Architecture — Channel Identity & Ingestion Core (build once, both channels depend on it)

V1 implicitly proposed two independent webhook handlers, each resolving identity and calling the ingestion pipeline on its own. **Corrected in v2: build one shared, deterministic core; both the email and SMS front doors call it. Inbound handlers must never impersonate a user.**

**4.1 Identity resolution is channel-specific; authorization is not.**

- The existing authenticated web flow resolves identity from the Supabase session, as it does today — unchanged.
- Each inbound channel (email, SMS) resolves identity through the verified service-only channel-identity mapping in Section 4.2 — never by scanning `auth.users`, never by trusting a household/child/team ID supplied in a vendor payload.
- Regardless of which path resolved identity, the server independently resolves the caller's **current** household membership and authorization from `corralio_household_members`/RLS before any mutation — every mutation gets a fresh authorization check, not a cached or payload-supplied one.
- Both paths, once identity and authorization are resolved, call **one shared deterministic ingestion-core function**. Do not fork ingestion logic per channel.

**4.2 Channel-identity table — bounded, service-only.**

A new table mapping a verified phone number or email address to a household's user, built and queried only by server-side/service-role code — never exposed to ordinary authenticated clients as a readable raw value. Required fields and behavior:

**Credential authority:** Supabase Auth remains authoritative for the raw verified phone/email credential. The channel-identity projection exists only as a service-only inbound lookup/index and verification-state projection. Do not duplicate raw phone/email values into this table merely to support outbound delivery.

- User ID (the `auth.users` row this channel identity resolves to).
- Channel type (`phone` | `email`).
- A **secret-keyed lookup value** (HMAC of the normalized phone/email using a server-held secret) as the actual lookup key — not the raw phone number or email address in a plainly-queryable column. Inbound webhook payloads are hashed with the same secret before lookup.
- Verified/active state (a channel identity must be explicitly verified before it can resolve identity for inbound intake — an unverified or removed channel identity must not resolve).
- Created/updated timestamps.
- A uniqueness constraint (one active mapping per normalized channel value) — this is also where phone-number-recycling risk (documented, accepted, in `CORRALIO_SECURITY_PRIVACY.md`) surfaces: reassigning a channel value must go through explicit re-verification, not a silent overwrite.
- Synchronized on confirmation (new verified channel), change (phone-number update, Section 5.6), and removal (explicit disconnect) — there must be no path where this table drifts from the identity state in Supabase Auth.
- No raw channel value (phone number, email address) exposed to ordinary authenticated clients through any API — only service-role code reads the raw value, and only to construct the outbound HMAC lookup or to hand to the SMS/email vendor for delivery.

## 5. Task 1 — Phone-First Authentication (Phase A): Manual OTP, V1

**Decision: manual SMS OTP for V1. No tap-to-verify link in this phase.**

**5.1 Enable Supabase native phone-OTP auth**, delivered via the Send SMS Hook calling Telnyx (not Twilio) for the actual SMS send. This should be a configuration change plus a small server-side hook implementation, not a new auth system — reuse Supabase's session/refresh-token handling unchanged.

**5.2 Build the phone entry + manual code entry UI**, alongside (not replacing) the existing `SignInForm.tsx` email path. The code-entry field must set `autocomplete="one-time-code"` (and the corresponding input type/attributes) so mobile browsers can offer native OTP autofill from the SMS itself — this is the correct answer to "reduce typing," not a link.

**5.3 Do not implement SMS magic-link/tap-to-authenticate semantics in this phase.** This corrects v1 Section 3.3, which is removed. Concretely:

- **Never place a phone number, OTP code, token hash, session material, or any equivalent authentication credential in a URL** — not in a query parameter, not in a path segment, not in a fragment. This applies to every SMS the system sends in this phase.
- The SMS OTP message contains only the numeric code (and minimal required compliance text, Section 9) — no link.
- A future opaque, prefetch-resistant one-time authentication-link design may be investigated separately, later, as its own reviewed piece of work — do not build a version of it here under a different name or justification.

**5.4 CAPTCHA on the phone-OTP send endpoint, from day one — necessary but not sufficient. Founder decision, 2026-08-31: Cloudflare Turnstile is the approved provider for Stage 1 phone authentication.** Use Supabase's native Cloudflare Turnstile support. This selects the provider only and does not authorize Cloudflare/Supabase configuration, phone Auth, deployment, or SMS. CAPTCHA alone is not an acceptable cost/abuse boundary for SMS. Real-volume production phone-OTP send is gated by Section 9 (SMS Production Readiness) exactly like SMS-leg intake — building and testing this endpoint is engineering scope (in scope here); authorizing it to send at production volume to real users is not (governed entirely by Section 9, tracked independently).

**5.5 Optional email on a phone-first account — audit-gated, no API assumption.** Use only a mechanism proven by Task 0 to preserve the same `auth.uid()` safely across add, verify, sign-in, collision, and removal behavior. Do not name or call `linkIdentity()` unless the live SDK/provider audit proves it is the correct supported boundary for this exact phone+email case. A second `auth.users` row, automatic user merge, household reassignment, or custom identity-linking schema is not authorized. If safe same-user email addition is unproven, omit this optional mechanism from Stage 1 and return a bounded founder decision packet; phone-only authentication and SMS intake remain independently valid. Any implemented add/remove operation must synchronize the existing service-only channel-identity mapping without weakening household authorization.

**5.6 Phone-number change handling.** A signed-in user can update their phone number via Supabase's identity-update path, re-verified with a fresh OTP to the new number, and the channel-identity table (Section 4.2) is updated synchronously. This is the only phone-change behavior required in this phase — do not attempt to build any defense against carrier number-recycling (the previously-documented residual risk in `CORRALIO_SECURITY_PRIVACY.md`'s Authentication boundary section); that risk is accepted and documented, not solved.

**Preserve the existing distinction, unchanged by this work: phone verification authenticates an identity. Household membership/RLS authorizes household access.** This task plugs a new identity source into the existing `auth.uid()`-keyed household RPC (Section 1) — it does not touch, and must not touch, the authorization model itself.

## 6. Task 2 — Deterministic Schedule Intake via URL (Phase B, SMS leg first)

**Decision: deterministic calendar/subscription URLs only. No `.ics` attachments in V1** (Section 2). Build the SMS intake leg first because phone/SMS is the primary entry path and the phone-auth/channel-identity boundary already belongs to Phase A. Production SMS remains disabled until Section 9 receives separate sign-off; carrier timing does not justify implementing email first or designing the shared core around email assumptions. The email leg follows in Section 7 and reuses the same core.

**6.1 Inbound SMS webhook first.** Implement the Telnyx webhook against the shared channel-identity and intake boundaries in Sections 4 and 6.2–6.7. Accept only a calendar/subscription URL plus the bounded deterministic replies required by the pending-intake state. Resolve the verified phone channel identity and household authorization before fetching any supplied URL. Apply every Section 8 security/idempotency bound. Test sends must remain under the predeclared vendor-spend/segment cap; production sends remain prohibited until Section 9 is independently signed off.

**6.2 Route into the shared ingestion core (Section 4.1) unchanged.** A detected SMS URL calls the same shared function used by the authenticated web paste-a-link flow and later by the email leg. Do not write a channel-specific ingestion path. **This core already exists — confirm before assuming it needs to be built.** `ingestCorralioSchedule()` (`apps/corralio/lib/schedules/ingest.ts:128`) already fetches, parses, and persists a schedule for an authenticated owner, and already accepts an optional `assignment: { childId, teamId }`. Verify its current shape and add only the smallest safe service-only orchestration needed for webhook use; never impersonate a user and never duplicate parsing/persistence.

**6.3 Bounded pending-intake state — build this; do not shortcut it into "connect unassigned" or a general assistant.**

Do not automatically connect an ambiguous schedule as unassigned merely to avoid implementing resolution, and do not build a general conversational assistant. Implement the smallest deterministic pending-intake state required to finish schedule association through SMS first; the later email leg reuses it. Conceptual state machine:

```
calendar URL received
  → authorized sender resolved (Section 6.7)
  → URL safely retrieved/parsed (Section 8: authorization before URL retrieval)
  → schedule metadata inferred (Section 6.4)
  → association confidence evaluated
      → if sufficient: connect
      → if insufficient: persist bounded pending intake
          → ask one deterministic clarification
          → correlate reply to pending intake
          → resolve
          → connect
```

The pending-intake record must have:

- Household/user association **derived server-side** (from the already-resolved channel identity and authorization, Section 4.1) — never trusted from vendor payload data.
- An **opaque internal identifier** (not the raw calendar URL, not a guessable sequential ID) used to correlate a reply back to this specific pending intake.
- An explicit state field (e.g., `pending`, `resolved`, `expired`, `cancelled`).
- An **expiry** — a pending intake does not live forever.
- **Replay protection** — a resolved or expired pending intake cannot be re-resolved by a repeated or delayed reply.
- **Idempotency** — a duplicate inbound message for the same underlying pending intake does not create a second one or double-connect a schedule.
- **Bounded retention** — pending-intake records are not kept indefinitely once resolved or expired; define and implement a cleanup policy.
- **No raw calendar URL in analytics or logging** — consistent with Section 1's existing discipline, extended to this new table.
- **Safe cancellation/failure behavior** — an expired or cancelled pending intake must fail closed (nothing gets connected) and tell the parent plainly what to do next (e.g., resend the link), not silently disappear.

**6.4 Person + team/source identity — a child + sport combination is not sufficient schedule identity.** Example: `Jake → Spokane Select → Baseball` and `Jake → Mead Panthers → Baseball` must remain distinguishable — do not resolve association on child+sport alone when the household has more than one team in the same sport for the same child. **Resolving** (Section 6.3's "resolve → connect" step, and any later re-assignment) means calling the existing RPC `corralio_update_schedule_source_assignment_v1` via the same pattern `updateScheduleAssignment()` already uses (`apps/corralio/app/actions.ts:360`) — not new assignment logic. `corralio_teams.child_id` is `not null` in the schema, so once an assignment is written, the child+team pair is already structurally unambiguous going forward; the only real risk is in getting the resolution right at this step, not in storage afterward.

Infer schedule/team identity and sport from the feed itself where evidence is sufficiently reliable — do not silently invent or guess team or sport information when the feed doesn't support it. **As of this writing, that evidence is limited to per-event title text** (`normalizeIcsSchedule()` extracts only per-event `SUMMARY`/`LOCATION`; it does not yet read `X-WR-CALNAME` or other calendar-level metadata, even though `node-ical` already parses it and simply discards it today). A separate, small, independently-shippable prerequisite — preserving `X-WR-CALNAME` as an optional `calendarName` field on the parser's result — is recommended before or alongside this task (see the 2026-08-31 CALNAME audit) so this step has a real calendar-level signal to work with instead of per-event-title text alone. **Do not block this task on that micro-slice landing first, and do not build a provisional calendar-name extraction inline here to avoid waiting** — if it hasn't landed yet when this task is implemented, this section's resolution logic simply has one fewer input signal available and falls back to per-event title text plus the bounded clarification path. Whichever signal is available, treat it as **input to a confidence judgment, never as authorization to write child/team/sport data without going through the confirm-if-uncertain / ask-if-low-confidence path** — a calendar name is not itself sufficient grounds to skip confirmation at anything other than genuinely high confidence.

Ask only when necessary, using the Section 6.3 pending-intake clarification loop — one deterministic question offering the household's **existing** entities (child, team, or unassigned/household) as reply options, never free-text interpretation of the answer.

**6.5 Required arrival — consume Phase 1; do not extend it.** Phase 1 is complete and authoritative at `34d83cf4`. Call the existing shared resolver with its exact precedence and typed provenance:

1. `ics_explicit`
2. `source_preference`
3. `team_preference`
4. `corralio_default`

**Arrival resolution must not block schedule connection.** If the resolver returns only `corralio_default`, the one allowed bounded SMS clarification may ask: *"How early should Jake arrive for Spokane Select? Reply with minutes, or SKIP for 30."* A valid numeric answer is written only to the connected source's existing nullable preference through `corralio_update_schedule_source_arrival_v1`; then call the same resolver again. `SKIP`, expiry, or an unanswered prompt leaves the source preference null so team/default behavior remains authoritative. Do not add a pending-intake arrival value, direct authenticated update, new column, provenance row, resolver tier, or alternate precedence.

**6.6 Home/default origin — owned entirely by Phase 3A; no implementation here.** Phase A+B must not create or modify an origin page, form, schema, RPC, storage, geocoding/routing orchestration, or post-save leave-by behavior. Once Phase 3A exists, this intake flow may send a plain navigational CTA such as *"Add your starting location to get drive times and leave-by."* Until then, omit the CTA rather than building a temporary version. Any eventual link must obey these consumer requirements:

- The URL itself must not contain: home address, phone number, OTP, auth token, household identifier, any handoff capability, or any other sensitive/private state. It is a plain navigational link to a Corralio page, nothing more.
- **If the browser already has a valid Corralio session, show the household-scoped origin form directly.**
- **If not authenticated, require the normal phone-OTP authentication flow (Section 5) before the origin form becomes accessible** — do not create a second, weaker path into sensitive household data that bypasses authentication because it arrived via a link.
- Phase 3A remains authoritative for the origin experience and its value exchange; Phase A+B only consumes the resulting capability.

**6.7 Sender authorization — channel identity is necessary, never sufficient by itself.** For SMS, verify the Telnyx webhook signature/replay envelope and resolve the normalized phone through the service-only channel mapping before any URL fetch or mutation. For the later email leg, a recognized `From` value alone is not authentication: require verified webhook authenticity plus whatever SPF/DKIM/DMARC-aligned evidence Task 0 proves is actually available, together with the service-only email-channel mapping. Unknown or insufficiently authenticated senders must not mutate data or reveal whether an account exists.

## 7. Task 3 — Email Leg of Intake (sequenced after SMS Task 2)

After the SMS path proves the shared channel-identity, pending-intake, and ingestion-core boundaries, add the Resend email front door without changing those boundaries. Stand up the webhook for `inbound.corralio.com` only after Task 0 confirms the live payload-signing/authenticity evidence. Parse Resend's bounded parsed payload for a calendar/subscription URL only—not raw MIME, attachments, or arbitrary prose—and route it through Sections 6.2–6.7 unchanged. Do not build email-specific ingestion, association, arrival, or persistence logic.

Inbound email `From` alone is not authentication. If the live Resend contract does not provide enough authenticated-message evidence to satisfy Sections 6.7 and 8, stop the email leg and report it as blocked; do not weaken authorization or delay the already-valid SMS-first implementation.

**7.1 Resend readiness check.** Confirm the receiving domain/MX state, raw-body signature verification, replay fields, message/event identifier, payload bounds, and authenticated-sender evidence against the live test account before writing or enabling the email handler. DNS changes or live webhook configuration remain separately authorized external actions under Section 10.

## 8. Webhook Security Requirements (both inbound channels — acceptance criteria, not optional polish)

Applies to both the SMS webhook (Section 6.1) and the email webhook (Section 7):

- **Raw-body signature verification** on every inbound request, using each vendor's own mechanism (confirmed in Task 0) — verify before parsing, not after.
- **Timestamp/replay validation** — reject requests outside an acceptable clock-skew window.
- **Vendor message/event ID captured and used for idempotency** — a redelivered webhook must not double-process.
- **Duplicate/out-of-order handling** defined explicitly, not left to incidental behavior.
- **Bounded request/body/URL/execution limits** on everything this endpoint touches — inbound payload size, any fetched calendar URL's response size, and execution time.
- **Authorization before URL retrieval** — resolve sender identity and household authorization (Sections 4.1, 6.7) *before* the server fetches the calendar URL contained in the message, not after.
- **Sanitized logging** — extends Section 1's existing `databaseFailure()` discipline to these new handlers; no raw URL, phone number, email address, or message body in any log line, error message, or analytics event, anywhere in these code paths.
- **Safe retry/failure isolation** — a failure processing one inbound message must not affect processing of others, and must fail in a way the vendor's own retry behavior (Section 7.1/8) handles safely (idempotent, not double-effecting).

## 9. SMS Production Readiness — Independent Gate (tracked separately from Phase A+B engineering)

**This is a standing gate, not a step in the Section 10 execution sequence. Neither finishing the code (Section 10, gate 9) nor completing database verification (Section 10, gates 5–7) authorizes production SMS.** Track it on its own timeline, with its own owner — carrier registration and compliance work routinely lags or leads engineering, and "the code is done" is not evidence this gate is satisfied. It applies equally to Task 2's SMS intake leg and to Section 5's phone-OTP auth once that moves beyond test volume — both ride the same Telnyx SMS channel and are authorized together, not separately. CAPTCHA (Section 5.4) is necessary but never sufficient on its own to open this gate.

Production SMS — any real-volume send to a real user, whether OTP or intake-related — requires all of the following, verified against the live vendor and carrier, not assumed from documentation:

- A2P/10DLC approval completed.
- An approved sender/use case registered with the carrier/aggregator.
- An explicit consent model for SMS (documented, not assumed).
- STOP/START/HELP behavior implemented and tested.
- Durable opt-out (a STOP must persist and be honored across both auth-OTP and intake SMS, not just one).
- Telnyx webhook signature verification (Section 3, item 1; Section 8) implemented and confirmed working on every inbound Telnyx callback.
- Billed-segment accounting — visibility into actual segment counts/cost, not an estimate.
- E.164 phone-number normalization applied consistently everywhere a phone number is stored, hashed (Section 4.2), or sent to the vendor.
- Explicit geographic policy (which countries/regions are supported; reject or handle others deliberately, not by accident).
- OTP send/attempt/cooldown limits enforced server-side, independent of Supabase's own defaults.
- Provider (Telnyx) spend controls — a hard cap, not just an alert, carried forward from the test-environment cap in Section 3 into production.
- Enumeration-safe responses for SMS, mirroring the email requirement in Section 6.7.
- A defined, vendor-confirmed retention policy for SMS message content and metadata (Section 3, item 4's counterpart for SMS).

**Sign-off on this gate is a separate, explicit act** — someone with authority to authorize production SMS reviews the list above against verified evidence and says so. It is not implied by a pull request merging, a migration applying, or a UAT pass. Until it is signed off, production SMS stays off regardless of what any other section of this prompt reports as complete.

## 10. Execution Gates

Revise implementation into these explicit, sequential gates. Do not proceed past a gate without its output in hand. **These gates cover engineering completion only — they do not include, and cannot substitute for, Section 9's SMS Production Readiness sign-off.**

The durable distributed safety prerequisite is specified by
`docs/prompts/corralio-gate-3-durable-distributed-safety-state-prompt.md`.
That prompt is authoritative for the two atomic authorization boundaries, the
one-use phone send permit, durable test-policy authority, at-most-one Telnyx
provider-attempt guarantee, permanent test-day segment reservation, and the
real-PostgreSQL database-verification stop gate. Phase A+B must consume that
verified boundary; it must not duplicate, weaken, or reinterpret it.

1. **Repository/provider-contract audit.** Re-verify every claim in Section 1 against the current repository state; re-verify Supabase's and Telnyx's current documented contracts for phone auth, Send SMS Hook, and webhook signing.
2. **Confirm provider configuration, phone geography, and the URL-only intake contract.** Confirm Task 0's findings (Section 3) are current; confirm the URL-only decision (Section 2, Section 6) is reflected in every place the email/SMS copy or parsing logic is drafted.
3. **Test-environment vendor spike with hard cost/segment caps.** Execute Task 0 (Section 3) live, in a test environment, with a hard spend cap configured before any real SMS is sent.
4. **Stage 1 code + unapplied migrations/verifiers, in the approved channel order.** Implement the shared boundaries and the SMS Task 2 path first. Prove that path through focused deterministic tests before beginning the email Task 3 path. Then add email only if Task 0 proves its authentication contract; an email-leg stop must not invalidate or delay the independently valid SMS implementation. Write only the genuinely new channel-identity, webhook-idempotency, and pending-intake migrations required by the audited design as unapplied/reviewable artifacts. No arrival or origin migration is authorized. Do not apply migrations yet.
5. **Stop at `CORRALIO PHASE A+B READY FOR DATABASE VERIFICATION`.** Output exactly this marker and stop. Do not proceed to gate 6 without separate confirmation.
6. **Human-controlled migration/configuration.** Migrations are applied and provider configuration (Supabase phone-auth enablement, Send SMS Hook, Telnyx account settings) is set by a human, not by the implementation agent.
7. **Rollback-only catalog/behavior verification.** Confirm every new migration has a corresponding rollback path, and that rollback has actually been verified to work, not just written.
8. **Bounded vendor UAT with disposable identities and cleanup verification.** Test the SMS path end-to-end using disposable/test phone numbers. Test the later email path with disposable/test email addresses only if its Task 0 contract was proven and its implementation proceeded. Confirm cleanup (test channel identities, test pending-intake records, test households) is actually removed afterward, not left behind.
9. **Tests, typecheck, lint, four production builds, notes, and local commit.** Standard verification bar before this is considered done at the code level.
10. **No push, production deployment, production Auth enablement, or DNS changes without separate authorization; no live SMS campaign activation or production-volume SMS send under any circumstances until Section 9 is independently signed off.** Gate 9's local commit is the stopping point for this prompt's engineering scope; anything beyond it — pushing, deploying, flipping production Supabase Auth settings, DNS/domain changes for the inbound-email address — requires separate, explicit authorization. Completing gates 1–9 above is necessary but never sufficient to activate the live A2P/10DLC campaign or send production SMS — that requires Section 9's independent sign-off, full stop, regardless of how complete the engineering is.

## 11. Verification

Before calling any gate complete, confirm:

1. A new user can authenticate purely by phone via **manually-entered OTP** — no link, and no email is requested or required at any point in the phone-auth path.
2. No SMS sent by this system — OTP or intake-related — contains a phone number, OTP code, token, session material, or any other credential embedded in a URL (Section 5.3). Spot-check actual sent message content, don't just review the template.
3. The same `corralio_ensure_owner_household()` RPC fires for a phone-authenticated first-time user exactly as it does for an email-authenticated one, with no code path differences in household creation.
4. A calendar/subscription URL sent by SMS from a verified household's channel identity results in a schedule connected via the shared ingestion core before the email leg is considered complete. If Task 0 proves the email contract and Task 3 proceeds, the same behavior must then pass through email without changing that core. No new parsing logic may be duplicated outside `ingest.ts`/`refresh.ts`, and no `.ics` attachment or other file type may be accepted.
5. A message from an unrecognized sender, or one that fails the authenticated-message-evidence check (Section 6.7), does not create or modify any household data, and does not reveal whether a matching account exists.
6. An ambiguous new schedule source (e.g., same child, same sport, different team) produces a bounded pending-intake record and one deterministic clarification message — never a silent guess, and never an automatic fall-through to "unassigned."
7. A pending-intake record correctly expires, cannot be replayed after resolution or expiry, and is idempotent against a duplicate inbound reply.
8. Required-arrival behavior calls the completed Phase 1 resolver with `ics_explicit → source_preference → team_preference → corralio_default`; a valid bounded answer uses only the existing narrow source-preference writer, and no arrival schema/resolver logic enters the diff.
9. No origin page, schema, RPC, storage, geocoding/routing orchestration, or leave-by implementation enters the diff. If Phase 3A already exposes an authorized route, any CTA is a plain session-gated navigation link with no sensitive state; otherwise the CTA is omitted.
10. Every inbound webhook (email, SMS) verifies the raw-body signature and rejects replayed/duplicate events before any processing occurs.
11. No log line, error message, or analytics event anywhere in the new code paths contains a URL, phone number, email address, or message body — spot-check this directly, don't just assume the pattern was followed.
12. CAPTCHA challenge enforcement, application/provider rate limits, resend cooldowns, OTP attempt limits, and test-environment spend controls are verified against the abuse matrix. CAPTCHA alone is not treated as an SMS cost or abuse boundary.
13. Section 9's SMS Production Readiness checklist has an explicit, separate sign-off on record before any production SMS is sent — confirm this sign-off exists as its own artifact, not inferred from Section 10's execution gates or this verification list being complete.

## Product Objective

The target experience: *"I told Corralio I wanted to connect my kid's schedule, and Corralio guided me through only the information it actually needed."* Not *"I filled out signup over SMS."* And not *"Corralio imported an ambiguous calendar and made me go organize it on the website."* Home/default-origin collection remains a separate Phase 3A capability and is not built by this prompt.
