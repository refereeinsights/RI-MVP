# Corralio Phase A+B — Phone-First Channel Identity & Deterministic Schedule Intake (v2, corrected)

**Infrastructure-and-narrow-build only. Does not authorize a full SMS onboarding conversation, AI/LLM extraction, CSV/PDF/screenshot/`.ics`-attachment ingestion, a general conversational assistant, anonymous pre-account claim infrastructure, message-based schedule-management commands (rename/disconnect/etc.), or any live-traffic/notification work. Those remain separately scoped and separately gated — see "Explicit non-goals" below.**

**Do not begin implementation from this document. This is the corrected prompt awaiting founder review before it is sent to Codex.**

> **v2 revision note, 2026-08-31.** This supersedes the v1 prompt filed 2026-08-30. Codex ran a security and architecture review of v1 and the founder accepted its findings, with the corrections below. v1's core scope (phone-first identity, deterministic link-based intake, infrastructure-not-onboarding-conversation) is unchanged; what changed is *how* — no tap-to-verify links, no `.ics` attachments in V1, a real bounded pending-intake state instead of "connect unassigned or nothing," a shared identity-resolution core instead of two independent webhook handlers, and a full inbound-channel-security and SMS-compliance gate list that v1 only gestured at. Read this document in full even if you reviewed v1 — do not assume unchanged section numbers mean unchanged content.
>
> **Same-day follow-up, 2026-08-31.** SMS Production Readiness is promoted to its own top-level, independently tracked gate (Section 9) — it was previously folded into Task 3 (Section 7) as though it were part of that task's engineering scope. It is not. Section numbers 9 onward shifted accordingly (Execution Gates is now Section 10, Verification is now Section 11).
>
> **Second same-day follow-up, 2026-08-31.** Section 6.2 and 6.4 amended: (a) named the existing ingestion function (`ingestCorralioSchedule()`) and assignment RPC (`corralio_update_schedule_source_assignment_v1`) this task should call, rather than describing "a shared core" and "existing primitives" in the abstract; (b) recorded that per-event title text is the only feed-evidence signal available today, pending a small, separate, independently-shippable prerequisite to preserve `X-WR-CALNAME` calendar-level metadata (currently parsed by `node-ical` and discarded) — see `2026-08-31-cpo-audit-ics-calendar-metadata.md` for the full audit and the recommendation that this land as its own prerequisite micro-slice, not inside this prompt.

> **Founder direction, 2026-08-30, reconfirmed and corrected 2026-08-31.** Confirms and refines the critical-path slot recommended across three CPO investigations this session (`2026-08-30-cpo-investigation-email-sms-priority-channels.md`, `2026-08-30-cpo-review-heysammi-addendum-sms-first.md`, `2026-08-30-cpo-investigation-phone-first-authentication.md`): the critical path forks after 3.6B Phase 1 ships — `Phase 1 → { this Phase A+B work || 3.6B Phase 2 (Arbiter audit, parallel/non-blocking) || HotelPlanner Phase 3B evidence diagnostic (parallel) } → resume 3A → 3B → 4 → 5`. Dispatch order: 3.6B Stage 1 goes to Codex first; this prompt follows it. Founder's own framing for why this is now foundational, not a notification side project: *"SMS/phone isn't feature creep anymore: it changes how families enter Corralio, while Phase 1 determines whether the planning information they receive is trustworthy. They reinforce each other."*

## 0. Why This Exists

Corralio's core loop starts with "Connect schedules," and that step today requires a parent to already be an authenticated web user navigating settings UI. The founder's direction is to let a parent begin the Corralio relationship — verify identity, connect a first schedule, receive real value back — without installing a PWA, granting notification permission, or providing an email address, using channels (phone/SMS, email) a parent already has open. This prompt builds the pieces of infrastructure that make that possible: a phone-capable identity/authentication layer, a bounded service-only channel-identity mapping shared by both inbound channels, and a deterministic (calendar/subscription-URL-based) schedule-intake path reachable from outside the authenticated web app.

**This is explicitly infrastructure, not the finished onboarding experience.** The founder's own instruction, restated in the v2 correction: *"Do not build a general conversational assistant."* The target experience is *"I told Corralio I wanted to connect my kid's schedule, and Corralio guided me through only the information it actually needed"* — not *"I filled out signup over SMS,"* and not *"Corralio imported an ambiguous calendar and made me go organize it on the website."* Concretely — sport/team auto-detection confidence, the resolved-arrival-with-provenance model (3.6B Stage 1), secure temporary-location capture (Phase 3A), and per-source-platform evidence about what signal is actually available (Schedule-Source Compatibility & Evidence Matrix) are all real dependencies of a richer onboarding conversation, and none of them are ready. Build the plumbing — including the one bounded clarification loop specified in Section 6.3 — so a fuller conversation can be layered on later without reworking the auth, channel-identity, or ingestion layer underneath it.

**The one deliberate web exception is home/default-origin collection**, because that interaction has a clear, immediate value exchange ("Add your starting location → get drive time and leave-by") and because it is too sensitive to collect over SMS. See Section 6.6.

## 1. Confirmed Starting Facts (verify independently before relying on them)

Established by direct repository inspection during v1 authoring — re-confirm before building if anything looks stale:

- **Household creation has no email-specific step anywhere in it.** `corralio_ensure_owner_household()` (`supabase/migrations/20260818_corralio_household_rls_foundation.sql:478-524`), a `security definer` Postgres RPC, reads `auth.uid()` and lazily creates a household + owner membership row the first time any authenticated action needs one. It's invoked from `getOwnerContext()` (`apps/corralio/app/actions.ts:46-58`) and `lib/schedules/supabaseStore.ts:31`. It has never known or cared which auth provider produced the `auth.uid()` — a phone-authenticated session hits this exact same path with zero changes required.
- **Auth today is entirely email-based.** `SUPPORTED_OTP_TYPES = new Set(["email", "magiclink", "recovery"])` (`apps/corralio/lib/authCallback.ts:3`) excludes phone. No phone-auth code exists anywhere in `apps/corralio`. `@supabase/supabase-js@^2.95.3` and `@supabase/ssr@^0.8.0` are the current versions — recent enough to support Supabase's native phone-OTP auth and Auth Hooks.
- **Supabase Auth has built-in phone sign-in** (`signInWithOtp({ phone })` → `verifyOtp({ phone, token, type: "sms" })`), and a **Send SMS Hook** that replaces Supabase's built-in SMS delivery entirely — the hook receives the phone number and the generated OTP, and application code is responsible for actually sending it via any vendor. This decouples the auth-provider decision from the SMS-vendor decision: Telnyx (the vendor baseline from `2026-08-30-cpo-review-standard-plus-pro-monetization-economics.md`) can be used for OTP delivery without adopting Twilio just because it's on Supabase's natively-integrated list (Twilio, MessageBird, Vonage, TextLocal). **V2 correction: use this mechanism only to deliver a manually-entered OTP code (Section 5). Do not use it to construct any link containing the code — see Section 5.3.**
- **No SMS/email vendor account exists yet.** No Telnyx or Resend credentials, no environment variables, no provider config anywhere in the monorepo — confirmed via grep across every `.env*`, `package.json`, and `vercel.json` during v1 authoring. Task 0 (Section 3) is a real prerequisite, not a formality, and its scope has grown in v2 (Section 3).
- **`corralio_schedule_sources` already supports household-level/unassigned sources.** `child_id` and `team_id` are both nullable with `constraint ... check (num_nonnulls(child_id, team_id) <= 1)` (`...household_rls_foundation.sql:92-129`). A source with both null is valid today. **V2 note: this remains true, but Section 6.4 below requires that ambiguous intake not default into this unassigned state merely to avoid building resolution — unassigned is a legitimate terminal state when the parent explicitly chooses it, not a shortcut around the pending-intake flow.**
- **The deterministic ICS ingestion pipeline (`ingest.ts`, `refresh.ts`, `teamConnection.ts`, `platforms.ts`) already exists and is unchanged by this work.** Both new intake surfaces (email, SMS) are new *front doors* onto this pipeline, not new parsing capability. **V2 scope note: both front doors now route through one shared ingestion-core function (Section 4), not two independent handlers calling the pipeline separately as v1 implied.**
- **No application-level rate limiting or CAPTCHA exists for any auth flow today.** The email-recovery route (`app/api/auth/recovery/route.ts`) relies entirely on Supabase Auth's own built-in send-rate limits (default: one OTP per 60 seconds per identifier, 1-hour expiry) and an enumeration-safe generic response pattern. There is nothing to extend — this prompt's phone-OTP send endpoint needs the same discipline built fresh. **V2 correction: CAPTCHA alone is not an acceptable cost/abuse boundary for SMS — see the independent SMS Production Readiness gate, Section 9. That gate is tracked separately from this task's engineering completion.**
- **No logging of schedule URLs or message bodies exists today, and this must not regress.** `databaseFailure()` (`lib/schedules/supabaseStore.ts:10-16`, `refreshSupabaseStore.ts:8-14`) explicitly logs only a stage name and error code, never the URL, event payload, or upstream response. Raw schedule URLs — which may carry embedded access tokens in their query string, confirmed unredacted at storage — are persisted in `corralio_schedule_sources.source_url` but never logged. **V2 note: this discipline now also applies to the new pending-intake table (Section 6.3) and the new channel-identity table (Section 4.2) — neither may hold or log a raw calendar URL, phone number, or channel value in plaintext where an ordinary log line or authenticated-client query could expose it.**
- **`corralio_teams.arrival_buffer_minutes` exists; no schedule-source-level or child-level arrival-buffer field exists.** Confirmed in `supabase/migrations/20260826_corralio_slice46_what_fits.sql:5-10`. Relevant to Section 6.5's arrival-value precedence chain.
- **No schema exists yet for pending/unresolved intake, channel identity, or webhook idempotency tracking.** All three are new in v2 (Sections 4.2, 6.3, 7.4) — there is no prior art in the repository to reuse for these; design them as new, minimal, purpose-built tables rather than overloading an existing one.

## 2. Explicit Non-Goals (binding scope boundary)

Do not build any of the following as part of this prompt, even if they seem like small additions once the infrastructure exists:

- **No full SMS/email onboarding conversation, and no general conversational assistant.** The one bounded exception is the single deterministic clarification loop specified in Section 6.3 (association) and the single deterministic arrival-value question specified in Section 6.5 — both are narrow, single-purpose, state-machine-driven exchanges, not an open-ended conversational surface. Do not generalize either into a chatbot.
- **No `.ics` file attachments, PDF, CSV, screenshots, or arbitrary forwarded prose.** V1 proposed `.ics` attachment intake for the email leg; this is removed in v2. **V1 is only calendar/subscription URLs** — a durable, refreshable source, matching Corralio's existing schedule-source model. A file attachment is a one-time snapshot and would require a separate product/data model for freshness, identity, deduplication, storage, and deletion that does not exist and is out of scope here. The parent-facing copy in both the email and SMS leg must accurately say Corralio needs the calendar/subscription **link**, not "your schedule" or "a file."
- **No AI/LLM extraction.** Association and arrival inference (Sections 6.4, 6.5) use the existing platform/feed-metadata evidence already available to the ingestion pipeline — not free-text or AI interpretation of message bodies.
- **No anonymous pre-account claim infrastructure.** Every household this work creates or attaches to is authenticated, from the moment of phone/email verification — there is no unclaimed/anonymous intermediate state. (The bounded pending-intake state in Section 6.3 is not an exception to this: it is always tied server-side to an already-resolved authenticated household — see Section 6.3's requirement list.)
- **No message-based schedule-management commands** (rename child, rename team, change arrival buffer beyond the one bounded intake-time question, disconnect calendar). Separately evaluated in `2026-08-30-cpo-decision-email-sms-schedule-intake-and-management.md`; not authorized here even though the underlying mutations (`renameChild`, `updateTeam`, `disconnectSchedule`) already exist.
- **No notification/brief delivery work.** Phase C (daily/event-day brief, schedule-change alerts) is separately scoped and gated on 3.6B Phase 1 shipping. This prompt only needs channel identity to exist so Phase C has somewhere to deliver to later — it does not build any delivery.
- **No live-traffic or checkpoint-monitoring work.** Unrelated to this prompt.
- **No entitlement/billing/tier gating.** Nothing in this prompt is Plus/Pro-gated; none of it should reference or depend on billing infrastructure, which doesn't exist.
- **No home/default-origin collection over SMS**, and no origin URL carrying sensitive state. See Section 6.6 — this is a web-only, post-connection, purpose-specific interaction.
- **No opaque prefetch-resistant one-time authentication link in this phase.** V1's tap-to-verify link is removed (Section 5.3). A future opaque, prefetch-resistant link design may be investigated separately, later, as its own reviewed piece of work — do not build a version of it here under a different name.

## 3. Task 0 — Vendor/Provider Spike (prerequisite, do first; scope expanded in v2)

No Telnyx or Supabase-phone-auth configuration exists yet. Before writing product code, in a test environment with hard cost/segment caps in place (Section 7.1):

1. **Confirm Telnyx account access and API credentials** for outbound SMS send, and confirm Telnyx's own webhook signature-verification mechanism (needed for Section 7.4).
2. **Enable phone auth in the Supabase project and confirm the Send SMS Hook mechanism works end-to-end**: Supabase generates an OTP, the hook receives it, a test call to Telnyx's send API succeeds, and the OTP is delivered as a manually-enterable code — not embedded in any link (Section 5.3).
3. **Confirm Supabase's phone+email identity-linking behavior directly** (`linkIdentity()`) rather than assuming it from general documentation — this determines the shape of Section 5.5.
4. **Confirm what authenticated-message evidence is actually available for inbound email**, for whichever vendor is used (e.g., SPF/DKIM/DMARC alignment passed through by the inbound-webhook provider, or an equivalent signed assertion). This is a hard prerequisite for Section 6.7 (email `From` is not authentication) — do not proceed to build the email-authorization logic in Section 6.7 until this is confirmed against the live vendor, not assumed from documentation.
5. **Confirm phone-number geography/format handling** required for E.164 normalization and any geographic policy the vendor enforces (Section 7.1).
6. **Confirm current A2P/10DLC registration status and expected timeline** — this feeds both Task 3's engineering sequencing (Section 7) and the independent SMS Production Readiness gate (Section 9); re-check it at the start of Task 3 regardless of what this spike finds, since timing may move.

Report findings before proceeding to Sections 4–7 if anything here doesn't work as expected — this is exactly the kind of assumption that needs verifying against a live account, not documentation.

## 4. Shared Architecture — Channel Identity & Ingestion Core (build once, both channels depend on it)

V1 implicitly proposed two independent webhook handlers, each resolving identity and calling the ingestion pipeline on its own. **Corrected in v2: build one shared, deterministic core; both the email and SMS front doors call it. Inbound handlers must never impersonate a user.**

**4.1 Identity resolution is channel-specific; authorization is not.**

- The existing authenticated web flow resolves identity from the Supabase session, as it does today — unchanged.
- Each inbound channel (email, SMS) resolves identity through the verified service-only channel-identity mapping in Section 4.2 — never by scanning `auth.users`, never by trusting a household/child/team ID supplied in a vendor payload.
- Regardless of which path resolved identity, the server independently resolves the caller's **current** household membership and authorization from `corralio_household_members`/RLS before any mutation — every mutation gets a fresh authorization check, not a cached or payload-supplied one.
- Both paths, once identity and authorization are resolved, call **one shared deterministic ingestion-core function**. Do not fork ingestion logic per channel.

**4.2 Channel-identity table — bounded, service-only.**

A new table mapping a verified phone number or email address to a household's user, built and queried only by server-side/service-role code — never exposed to ordinary authenticated clients as a readable raw value. Required fields and behavior:

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
- The SMS OTP message contains only the numeric code (and minimal required compliance text, Section 7.1) — no link.
- A future opaque, prefetch-resistant one-time authentication-link design may be investigated separately, later, as its own reviewed piece of work — do not build a version of it here under a different name or justification.

**5.4 CAPTCHA on the phone-OTP send endpoint, from day one — necessary but not sufficient.** Use Supabase's native hCaptcha or Cloudflare Turnstile support. This remains a requirement, but CAPTCHA alone is not an acceptable cost/abuse boundary for SMS. Real-volume production phone-OTP send is gated by Section 9 (SMS Production Readiness) exactly like SMS-leg intake — building and testing this endpoint is engineering scope (in scope here); authorizing it to send at production volume to real users is not (governed entirely by Section 9, tracked independently).

**5.5 Email as an optional, linked identity — build the mechanism, not the UI polish.** Confirm and implement `linkIdentity()` (or the equivalent confirmed in Task 0) so a phone-authenticated household can later add an email identity to the *same* `auth.users` row, not a second account. A minimal prompt ("add an email to also sign in that way") is sufficient for this phase — do not design the full "when should Corralio ask for this" conversation (Section 2's non-goal). Linking or removing an email identity must synchronize the channel-identity table (Section 4.2).

**5.6 Phone-number change handling.** A signed-in user can update their phone number via Supabase's identity-update path, re-verified with a fresh OTP to the new number, and the channel-identity table (Section 4.2) is updated synchronously. This is the only phone-change behavior required in this phase — do not attempt to build any defense against carrier number-recycling (the previously-documented residual risk in `CORRALIO_SECURITY_PRIVACY.md`'s Authentication boundary section); that risk is accepted and documented, not solved.

**Preserve the existing distinction, unchanged by this work: phone verification authenticates an identity. Household membership/RLS authorizes household access.** This task plugs a new identity source into the existing `auth.uid()`-keyed household RPC (Section 1) — it does not touch, and must not touch, the authorization model itself.

## 6. Task 2 — Deterministic Schedule Intake via URL (Phase B, email leg first)

**Decision: deterministic calendar/subscription URLs only. No `.ics` attachments in V1** (Section 2). Ship the email leg first; the SMS leg (Section 7) follows once A2P/10DLC registration clears — this is an execution-timing fact, not a reason to design the email leg as though SMS doesn't matter.

**6.1 Inbound email webhook.** Stand up the inbound-email vendor's webhook (Resend, or whichever vendor Task 0 confirms) at a Corralio-owned address. Parse the message body for a calendar/subscription URL only — no attachment parsing. See Section 7.4 for the webhook-security requirements this endpoint must meet regardless of channel.

**6.2 Route into the shared ingestion core (Section 4.1) unchanged.** A detected URL calls the same shared function the authenticated web user's paste-a-link flow, and the future SMS leg, both call. Do not write a second, email-specific ingestion code path. **This core already exists — confirm before assuming it needs to be built.** `ingestCorralioSchedule()` (`apps/corralio/lib/schedules/ingest.ts:128`) already fetches, parses, and persists a schedule for an authenticated owner, and already accepts an optional `assignment: { childId, teamId }` — the web form simply never populates it today (`connectSchedule()`, `apps/corralio/app/actions.ts:287`, calls it with no assignment, which is why every web-connected schedule lands unassigned-first). Section 4.1's "shared deterministic ingestion core" requirement is largely already satisfied by this function; verify its current shape against this description before writing a new one, and treat any real gap found (e.g., it not yet being safely callable from a service-role/webhook context) as the actual scope, not a reason to duplicate it.

**6.3 Bounded pending-intake state — build this; do not shortcut it into "connect unassigned" or a general assistant.**

Do not automatically connect an ambiguous schedule as unassigned merely to avoid implementing resolution, and do not build a general conversational assistant. Implement the smallest deterministic pending-intake state required to finish schedule association through SMS (or email reply). Conceptual state machine:

```
calendar URL received
  → authorized sender resolved (Section 6.7)
  → URL safely retrieved/parsed (Section 7.4: authorization before URL retrieval)
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

Infer schedule/team identity and sport from the feed itself where evidence is sufficiently reliable — do not silently invent or guess team or sport information when the feed doesn't support it. **As of this writing, that evidence is limited to per-event title text** (`normalizeIcsSchedule()` extracts only per-event `SUMMARY`/`LOCATION`; it does not yet read `X-WR-CALNAME` or other calendar-level metadata, even though `node-ical` already parses it and simply discards it today). A separate, small, independently-shippable prerequisite — preserving `X-WR-CALNAME` as an optional `calendarName` field on the parser's result — is recommended before or alongside this task (see the 2026-08-31 CALNAME audit) so this step has a real calendar-level signal to work with instead of per-event-title text alone. **Do not block this task on that micro-slice landing first, and do not build a provisional calendar-name extraction inline here to avoid waiting** — if it hasn't landed yet when this task is implemented, [S5]/this section's resolution logic simply has one fewer input signal available (falls back to per-event title text and asking), exactly as Section 6.5 already handles the 3.6B Phase 1 arrival-model dependency. Whichever signal is available, treat it as **input to a confidence judgment, never as authorization to write child/team/sport data without going through the confirm-if-uncertain / ask-if-low-confidence path** — a calendar name is not itself sufficient grounds to skip confirmation at anything other than genuinely high confidence.

Ask only when necessary, using the Section 6.3 pending-intake clarification loop — one deterministic question offering the household's **existing** entities (child, team, or unassigned/household) as reply options, never free-text interpretation of the answer.

**6.5 Required arrival — do not create a competing arrival schema.** Consume the completed and verified 3.6B Phase 1 required-arrival model. **If that foundation is not yet available/verified at the time this task is implemented, stop that portion of the implementation and flag it** — do not build a parallel or provisional arrival model to avoid waiting. Once available, resolve arrival value in this precedence order:

1. A trustworthy explicit schedule value (from the 3.6B Phase 1 model, if the feed itself carries one).
2. A saved source/team arrival-buffer preference (`corralio_teams.arrival_buffer_minutes`, if this source is team-attached and a value already exists).
3. A parent-provided value, collected via the one bounded SMS clarification below.
4. The 30-minute fallback constant (`LEAVE_BY_ARRIVAL_BUFFER_MINUTES`, `leaveBy.ts`).

**Arrival resolution must not block schedule connection** — a schedule connects at step 4's fallback if nothing more specific is available or answered, and the value can be refined later. The one allowed bounded SMS clarification, verbatim pattern: *"How early should Jake arrive for Spokane Select? Reply with minutes, or SKIP for 30."* This is answered and correlated through the same pending-intake mechanism as Section 6.3, not a separate ad hoc flow. Note the confirmed schema gap from Section 1: an unassigned/household-level source has no arrival-buffer field today; closing this gap (adding the field at the source level) is in scope for this task if needed to store a parent-provided value coherently — flag it plainly rather than working around it.

**6.6 Home/default origin — web-only, post-connection, purpose-specific. Do not collect this through SMS.** After a schedule connects, Corralio may send a normal Corralio URL with a product CTA (e.g., *"Add your starting location to get drive times and leave-by."*). Requirements on that URL and the page it leads to:

- The URL itself must not contain: home address, phone number, OTP, auth token, household identifier, any handoff capability, or any other sensitive/private state. It is a plain navigational link to a Corralio page, nothing more.
- **If the browser already has a valid Corralio session, show the household-scoped origin form directly.**
- **If not authenticated, require the normal phone-OTP authentication flow (Section 5) before the origin form becomes accessible** — do not create a second, weaker path into sensitive household data that bypasses authentication because it arrived via a link.
- The origin page itself must be minimal and purpose-specific — a single field to capture the starting location — not a general onboarding form or a place to add more scope over time without separate review.
- After the origin is saved, immediately show the resulting standard drive duration and estimated leave-by — the value exchange must be visible in the same interaction, not deferred.

**6.7 Sender authorization — inbound email `From` alone is not authentication.** This corrects v1 Section 4.3, which treated a recognized `From` address as sufficient. Required: authenticated-message evidence, established during the Task 0 vendor spike (Section 3, item 4) — e.g., a vendor-verified SPF/DKIM/DMARC-aligned signal, not just a header value — **plus** a verified Corralio channel identity (Section 4.2) for that address. If sender authenticity cannot be established to sufficient confidence by both of those together, do not mutate any data from the inbound message — instead, require authenticated web confirmation before anything is connected (e.g., reply directing the parent to confirm via the authenticated web app). **Do not create account-enumeration or backscatter behavior for unknown senders** — a message from an address with no matching channel identity gets a generic, non-revealing reply (or, depending on vendor cost/abuse tradeoffs confirmed in Task 0, silent drop), never a reply that confirms or denies whether a Corralio account exists for that address.

## 7. Task 3 — SMS Leg of Intake, Engineering (sequenced after Task 2)

Once phone auth (Section 5) and the shared channel-identity/ingestion-core architecture (Section 4) exist, the SMS intake leg reuses the same authorized-sender, pending-intake, and ingestion-core requirements as the email leg (Section 6.2–6.5, 6.7) — a text from a verified phone number containing a supported calendar/subscription URL routes into the same shared ingestion core the same way, correlating clarification replies through the same pending-intake mechanism (Section 6.3). Do not build SMS-specific ingestion logic distinct from the email leg's pattern.

**This section is engineering scope only.** Writing, testing, and committing this code does not authorize sending production SMS to real users. That authorization is governed entirely by Section 9 (SMS Production Readiness) — a gate tracked independently of this task's completion, of Section 8's webhook-security work, and of Section 10's execution-gate sequence.

**7.1 Registration-timing check.** Confirm current A2P/10DLC registration status and expected timeline at the start of this task's implementation work, regardless of what Task 0's spike found (Section 3, item 6) — the timeline may have moved since this prompt was written. This check is informational for sequencing the engineering work; it does not by itself satisfy Section 9.

## 8. Webhook Security Requirements (both inbound channels — acceptance criteria, not optional polish)

Applies to both the email webhook (Section 6.1) and the SMS webhook (Section 7):

- **Raw-body signature verification** on every inbound request, using each vendor's own mechanism (confirmed in Task 0) — verify before parsing, not after.
- **Timestamp/replay validation** — reject requests outside an acceptable clock-skew window.
- **Vendor message/event ID captured and used for idempotency** — a redelivered webhook must not double-process.
- **Duplicate/out-of-order handling** defined explicitly, not left to incidental behavior.
- **Bounded request/body/URL/execution limits** on everything this endpoint touches — inbound payload size, any fetched calendar URL's response size, and execution time.
- **Authorization before URL retrieval** — resolve sender identity and household authorization (Sections 4.1, 6.7) *before* the server fetches the calendar URL contained in the message, not after.
- **Sanitized logging** — extends Section 1's existing `databaseFailure()` discipline to these new handlers; no raw URL, phone number, email address, or message body in any log line, error message, or analytics event, anywhere in these code paths.
- **Safe retry/failure isolation** — a failure processing one inbound message must not affect processing of others, and must fail in a way the vendor's own retry behavior (Section 7.1/8) handles safely (idempotent, not double-effecting).

## 9. SMS Production Readiness — Independent Gate (tracked separately from Phase A+B engineering)

**This is a standing gate, not a step in the Section 10 execution sequence. Neither finishing the code (Section 10, gate 9) nor completing database verification (Section 10, gates 5–7) authorizes production SMS.** Track it on its own timeline, with its own owner — carrier registration and compliance work routinely lags or leads engineering, and "the code is done" is not evidence this gate is satisfied. It applies equally to Task 3's SMS intake leg and to Section 5's phone-OTP auth once that moves beyond test volume — both ride the same Telnyx SMS channel and are authorized together, not separately. CAPTCHA (Section 5.4) is necessary but never sufficient on its own to open this gate.

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

1. **Repository/provider-contract audit.** Re-verify every claim in Section 1 against the current repository state; re-verify Supabase's and Telnyx's current documented contracts for phone auth, Send SMS Hook, and webhook signing.
2. **Confirm provider configuration, phone geography, and the URL-only intake contract.** Confirm Task 0's findings (Section 3) are current; confirm the URL-only decision (Section 2, Section 6) is reflected in every place the email/SMS copy or parsing logic is drafted.
3. **Test-environment vendor spike with hard cost/segment caps.** Execute Task 0 (Section 3) live, in a test environment, with a hard spend cap configured before any real SMS is sent.
4. **Stage 1 code + unapplied migrations/verifiers.** Write the implementation (Sections 4–8) and any new migrations (channel-identity table, pending-intake table, arrival-buffer schema extension if needed) as unapplied/reviewable artifacts — do not apply migrations yet.
5. **Stop at `CORRALIO PHASE A+B READY FOR DATABASE VERIFICATION`.** Output exactly this marker and stop. Do not proceed to gate 6 without separate confirmation.
6. **Human-controlled migration/configuration.** Migrations are applied and provider configuration (Supabase phone-auth enablement, Send SMS Hook, Telnyx account settings) is set by a human, not by the implementation agent.
7. **Rollback-only catalog/behavior verification.** Confirm every new migration has a corresponding rollback path, and that rollback has actually been verified to work, not just written.
8. **Bounded vendor UAT with disposable identities and cleanup verification.** Test end-to-end using disposable/test phone numbers and email addresses; confirm cleanup (test channel identities, test pending-intake records, test households) is actually removed afterward, not left behind.
9. **Tests, typecheck, lint, four production builds, notes, and local commit.** Standard verification bar before this is considered done at the code level.
10. **No push, production deployment, production Auth enablement, or DNS changes without separate authorization; no live SMS campaign activation or production-volume SMS send under any circumstances until Section 9 is independently signed off.** Gate 9's local commit is the stopping point for this prompt's engineering scope; anything beyond it — pushing, deploying, flipping production Supabase Auth settings, DNS/domain changes for the inbound-email address — requires separate, explicit authorization. Completing gates 1–9 above is necessary but never sufficient to activate the live A2P/10DLC campaign or send production SMS — that requires Section 9's independent sign-off, full stop, regardless of how complete the engineering is.

## 11. Verification

Before calling any gate complete, confirm:

1. A new user can authenticate purely by phone via **manually-entered OTP** — no link, and no email is requested or required at any point in the phone-auth path.
2. No SMS sent by this system — OTP or intake-related — contains a phone number, OTP code, token, session material, or any other credential embedded in a URL (Section 5.3). Spot-check actual sent message content, don't just review the template.
3. The same `corralio_ensure_owner_household()` RPC fires for a phone-authenticated first-time user exactly as it does for an email-authenticated one, with no code path differences in household creation.
4. A calendar/subscription URL sent from a verified household's channel identity, via email or SMS, results in a schedule connected via the shared ingestion core — with no new parsing logic duplicated outside `ingest.ts`/`refresh.ts`, and no `.ics` attachment or other file type accepted.
5. A message from an unrecognized sender, or one that fails the authenticated-message-evidence check (Section 6.7), does not create or modify any household data, and does not reveal whether a matching account exists.
6. An ambiguous new schedule source (e.g., same child, same sport, different team) produces a bounded pending-intake record and one deterministic clarification message — never a silent guess, and never an automatic fall-through to "unassigned."
7. A pending-intake record correctly expires, cannot be replayed after resolution or expiry, and is idempotent against a duplicate inbound reply.
8. Required-arrival resolution follows the documented precedence (Section 6.5) and never blocks schedule connection; if the 3.6B Phase 1 arrival model is unavailable, this portion of the implementation is stopped and flagged rather than worked around.
9. The home/default-origin link contains no sensitive data, requires phone-OTP authentication when the browser has no valid session, and shows the resulting drive time/leave-by immediately after the origin is saved.
10. Every inbound webhook (email, SMS) verifies the raw-body signature and rejects replayed/duplicate events before any processing occurs.
11. No log line, error message, or analytics event anywhere in the new code paths contains a URL, phone number, email address, or message body — spot-check this directly, don't just assume the pattern was followed.
12. CAPTCHA blocks scripted repeated OTP-send attempts against the phone endpoint. This confirms engineering readiness only — it is not, and must not be treated as, evidence that Section 9 (SMS Production Readiness) is satisfied.
13. Section 9's SMS Production Readiness checklist has an explicit, separate sign-off on record before any production SMS is sent — confirm this sign-off exists as its own artifact, not inferred from Section 10's execution gates or this verification list being complete.

## Product Objective

The target experience: *"I told Corralio I wanted to connect my kid's schedule, and Corralio guided me through only the information it actually needed."* Not *"I filled out signup over SMS."* And not *"Corralio imported an ambiguous calendar and made me go organize it on the website."* The one deliberate web exception is highly sensitive home/default-origin collection (Section 6.6), because that interaction has a clear value exchange: *"Add your starting location → get drive time and leave-by."*
