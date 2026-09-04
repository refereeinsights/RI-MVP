# Corralio Security and Privacy

**Status:** Canonical security and privacy principles
**Last reviewed:** August 30, 2026 (added Email and SMS channel sections with explicit retention policies; see synchronization note below)

**Synchronization note (2026-08-30):** This document previously existed outside the repository and is filed here for the first time as part of reconciling Corralio's canonical documents against repository truth. `CORRALIO_FOUNDER_MENTOR_HANDOFF.md` has cited this document by name since its own last update; that citation is now real. This update adds explicit Email and SMS principles at the founder's request, since both channels will carry meaningfully more PII than the content-free push notification shipped in Slice 3.6A (names, schedule/event detail, contact identifiers). **Adding these principles is a go-forward policy decision, not a launch-timing decision** — whether and when Email or SMS actually ship remains separately tracked as open founder decisions in `CORRALIO_CPO_EXECUTION_STATE.md`. Build against this policy once either channel is authorized; do not read this section as authorization to build either channel now.

Security and privacy are product boundaries, not an appendix. This document defines accepted principles; implementation details still require schema, threat-model, and product/legal review.

## Core principles

- Store only what the product needs.
- Default family planning data to private and household-scoped.
- Separate public tournament/venue intelligence from private household context.
- Enforce authorization through server-side checks and RLS, not UI assumptions.
- Preserve raw schedule information only where needed and protected.
- Treat enrichment as optional; an event remains useful if matching fails.
- Do not place sensitive raw data in analytics or logs.
- Minimize notification content to what each channel's purpose requires — prefer content-free or minimal-content delivery (push) over full schedule/child detail wherever the product goal allows it, and treat any channel that must carry more content (email, SMS) as carrying proportionally more privacy obligation, not the same obligation delivered differently.

## Data classification

| Class | Examples | Default treatment |
|---|---|---|
| Public canonical intelligence | TI tournament and public venue facts | Read through a narrow trusted TI contract |
| Private household identity | Household membership, child names, team associations | Household-scoped; strict RLS |
| Private planning | Events, participation, assignments, private notes | Household-scoped; never public through TI |
| Highly sensitive location | Home/default origin, pickup point, private residence | Minimum retention; strict RLS; no public enrichment |
| Commercial trust data | Hotel program, fee, beneficiary configuration | Server-side only; never trusted from browser input |
| Secrets and access capabilities | Auth/share/handoff tokens | Never analytics; protected logging; revocable/expiring where appropriate |
| Contact identifiers and notification content | Email address, phone number, rendered email/SMS message bodies | Household-scoped; strict RLS; bounded retention distinct from delivery metadata (see Notification Channels) |

## Household ownership and RLS

New Corralio planning data should be household-owned rather than simply copying TI's current single-user Planner ownership model.

- A user may access a household only through an authorized membership relationship.
- Child, team, event, origin, note, and assignment records inherit household access.
- Cross-household reads and writes must be denied by RLS and server authorization.
- Service-role access must remain isolated to trusted server operations.
- Future invitations or shares must not imply broader edit membership unless explicitly accepted and authorized.

The final schema and policy set remain implementation work and must be verified with positive and negative authorization tests.

## Children's data

Treat child names, teams, schedules, locations, practices, games, tournament participation, private notes, and household assignments as sensitive private information.

- Do not expose them through public TI surfaces.
- Do not index them for public search.
- Do not include raw values in analytics or ordinary logs.
- Minimize child identifiers in support and operational tooling.
- Any public/share view must explicitly select a minimum safe field set.
- This applies identically when a child's name or schedule detail is being rendered into an email or SMS body, not only when it is stored or displayed in-product — see Notification Channels below.

## Home and origin locations

Home/default origin is highly sensitive:

- Never expose it publicly or through TI.
- Never include it in public shares by default.
- Never treat it as a venue candidate.
- Avoid raw-address logging and analytics.
- Prefer server-side routing.
- Store only the precision and duration the product requires.
- Apply strict household RLS.

A home address must not become trusted public evidence through repetition, geocoding, routing, or schedule imports.

Slice 3.6B Phase 3A's temporary-routing-origin design applies this principle directly to event leave-by: "use current location" is permissioned per-use, triggered only by a user gesture, sent to the routing provider for that one estimate, and retains neither the raw coordinates nor the derived route. A typed alternate address may be stored only against its owning household event, becomes inactive at the event end (or start when no end exists) plus 24 hours, and is removed by bounded cleanup. Temporary origins never affect What Fits or become venue evidence.

## Public versus private location boundary

Corralio must distinguish private household/routing locations from public sports venues before venue matching or evidence collection.

```text
raw event location
        ↓
privacy/non-venue classification
        ↓
canonical match attempt
        ↓
candidate evidence only when public-venue eligible
```

Home addresses, pickup points, private residences, and routing-only locations must never enter venue candidate queues, public venue search, venue analytics, or canonical creation.

Placeholder and logistical values such as `TBD`, `Home`, `Away`, `Unknown`, `N/A`, `Parking Lot`, or `Meet at hotel` must not be promoted merely because they recur. Field/court-only values remain event sub-locations unless tied to a known public facility.

## Schedule and event data

- Preserve schedule-provided location when needed for the user's event.
- Keep the raw value protected in the household/event domain.
- Store source/provenance without leaking credentials embedded in source URLs.
- Do not block event creation or display on venue/tournament enrichment.
- Treat source errors as evidence limitations, not permission to overwrite canonical data.
- Define schedule retention and source-disconnection behavior before scale.

## Venue authority

Corralio must not directly create or modify canonical public venue records.

It may eventually contribute restricted observations, candidate evidence, alias suggestions, field/court observations, and possible corrections. Trusted TI/RI/shared administrative services retain canonical promotion authority.

Future evidence must preserve source platform/type, source reference, observation time, match method, signal summary, and privacy classification. Repeated records from one user or feed are not independent evidence.

## Tournament data boundary

Corralio should consume the minimum public tournament intelligence it needs through a narrow read-only contract. Do not distribute private TI or service-role table access through UI components.

- TI remains authoritative for canonical tournament facts.
- Corralio owns private family associations and planning additions.
- Cache and availability behavior must not allow stale private authorization state.

## TI to Corralio handoff

Use server-generated, server-validated context. Never trust browser-supplied commercial fees, beneficiaries, Hotel Program configuration, privileged state, or sensitive tournament claims.

The exact token/transport contract remains an open implementation decision. It must address expiration, replay, revocation, key rotation, least-data payloads, safe failure, and logging redaction before launch.

## HotelPlanner security

- Keep commercial program, fee, beneficiary, and target resolution server-side.
- Reuse established safe HotelPlanner handoff behavior.
- Do not expose trusted configuration to the browser.
- Do not authorize fee routing from query parameters or client state.
- Keep secrets and signed context out of analytics and ordinary logs.
- The opaque, single-use attribution token design (`docs/reference/corralio-hotelplanner-attribution-design.md`) is this principle applied to attribution specifically: the household's real, persistent identifier is never placed in a URL or third-party Custom field, only a fresh opaque token resolved against a Corralio-owned mapping table.

## Notification Channels: Push, Email, and SMS

Corralio's notification channels differ meaningfully in privacy exposure and must be governed accordingly, not treated as interchangeable delivery mechanisms for the same content. As channel content grows richer, the retention and minimization obligations grow with it — they do not stay constant across channels.

### Push (implemented, Slice 3.6A)

Deliberately content-free today: "Your weekend is ready" / "Open Corralio to see your family plan." carries no child, team, event, schedule, time, or location data. This remains the model whenever content-free delivery satisfies the product goal. A future schedule-change or traffic-aware push that must reference a specific time or event should still disclose the minimum needed to be actionable (e.g., a leave-by time) rather than a full event/child summary, consistent with the core principle above.

### Email (go-forward channel; whether/when it ships for launch is a separate, open founder decision)

Email is expected to carry more content than push by necessity — a content-free "your weekend is ready" email offers little standalone value the way a mobile badge does, and email's product case depends on a parent being able to act directly from the message. This materially raises the PII surface: an email may name a specific child, team, event, time, and location, sent to an address that is itself directly identifying.

Principles:

- Treat the recipient email address as household-owned PII, RLS-scoped like any other private household field. Never use it to match or correlate against a household's schedule-source vendor accounts, and never share it with a schedule-source or venue/tournament vendor.
- Any schedule/event/child content assembled into an email body is private planning data under this document's existing classification, not a new category — the "Private household identity" and "Private planning" rows already govern it. Sending it over email does not relax RLS/authorization discipline; content must still be assembled server-side, scoped to what that specific household is already authorized to see.
- Minimize content to what the specific email's purpose requires. A weekend-summary email does not need every private note, every arrival-buffer override, or every household's connected-source detail — only what a parent needs to act on for that message.
- Use a dedicated transactional email-sending provider (a data processor for this purpose specifically), not a marketing/analytics/audience platform. Do not route rendered email content through any tool whose primary purpose is marketing segmentation or ad targeting.
- Do not embed sensitive tokens (schedule-source URLs, handoff tokens, or any auth link beyond a single-use, short-expiry one) directly in an email body, where it could be forwarded, cached by a mail provider, or exposed through a "view in browser" cached copy.
- Honor unsubscribe/opt-out immediately and independently of household membership changes. An email communication preference is not a household-access grant and must not be silently reset by unrelated account activity.

**Email retention:**

- Rendered message body content (the actual schedule/event/child data sent in a given email) should not be retained beyond what is needed to resend or debug a specific delivery failure. Recommend a bounded window on the order of 30 days, after which rendered body content is purged — this is a CPO-recommended default pending product/legal review, not a final number.
- Delivery metadata (household reference, send timestamp, provider message ID, delivery/bounce/open status) may be retained longer for deliverability analysis, but must never itself contain message body text or child/event-identifying free text — a status code and a household reference, not a copy of what was sent.
- The email address itself follows normal household-data retention: retained as long as the household account exists, deleted or anonymized on account deletion, consistent with the export/deletion requirements below.
- Any third-party email-sending provider's own retention of message content must be reviewed at vendor-selection time and configured to the shortest retention the provider allows. Corralio's own retention policy is not sufficient on its own if the vendor independently retains a longer-lived copy of message content.

### SMS (go-forward channel; phase-gating status is being revisited under a 2026-08-30 founder SMS-first direction — see `docs/corralio/cpo/2026-08-30-cpo-review-heysammi-addendum-sms-first.md` and the priority-channels investigation; this section's principles apply regardless of when SMS ships)

SMS carries the same content-minimization and RLS principles as email, plus SMS-specific exposure.

Principles:

- Phone numbers are directly identifying PII and, for a household with children, are frequently a parent's personal mobile number — treat with the same sensitivity as home address, not as a lesser identifier than email.
- SMS carrier/aggregator relationships (A2P/10DLC registration) require registering business identity and message-use-case information with carriers ahead of sending. This is a compliance/business step with its own lead time, already flagged in the roadmap, and it is itself a data-sharing relationship with the carrier/aggregator that should be reviewed under this document's third-party-processor principles before any SMS is sent.
- Require explicit, affirmative opt-in before sending any SMS. Do not infer SMS consent from an email address, from a phone number entered for another purpose (e.g., account recovery), or from any default-on behavior. Honor STOP/opt-out keywords immediately and durably, independent of other account state.
- SMS message length naturally limits content, but the same minimization rule applies: include only what the specific message's purpose requires (e.g., "Leave by 4:28 PM for Jake's game" is a bounded, purposeful disclosure — do not pad an SMS with additional household or schedule detail beyond its stated purpose).
- Never send a schedule-source URL, credential, or any auth/handoff token via SMS.

**SMS retention:**

- Rendered message body content should follow the same bounded-retention principle as email — recommend a similarly short window (on the order of 30 days) for message text, purged thereafter, distinct from delivery metadata. This is a CPO-recommended default pending product/legal review.
- Delivery metadata (household reference, timestamp, provider message ID, delivery status, carrier response code) may be retained longer on the same basis as email, and must not itself contain message body content.
- Phone numbers follow normal household-data retention (retained while the account exists; deleted/anonymized on account deletion) and must be stored separately from, and never inferable from, any other product's (TI/RI) contact records unless the household has explicitly linked those identities.
- SMS aggregator/carrier-side logs are outside Corralio's direct control. The same principle as email's third-party retention applies: review and minimize retention where the vendor contract allows it, and do not assume Corralio's own retention policy governs a carrier's independent copy.

## Authentication boundary

Corralio may share the underlying Supabase Auth tenant, but it has a distinct product/profile boundary.

- TI cookies on `.tournamentinsights.com` cannot simply be reused on `corralio.com`.
- Do not assume cross-domain SSO.
- Intentionally design cookie/domain and consent behavior.
- Enforce authorization through server and RLS rules.
- Keep account linking and product-profile creation explicit and idempotent.
- **Phone-based authentication (founder decision, 2026-08-30 — email must not be required for account creation, authentication, household access, or the full web experience):** a verified phone number authenticates an identity — it proves control of that number at the moment of verification — and must never, by itself, be treated as authorization to an existing household. Household access is granted only through the existing household-membership/RLS model, identically for phone- and email-authenticated identities. Full audit and migration design: `docs/corralio/cpo/2026-08-30-cpo-investigation-phone-first-authentication.md`.
- **Phone-number recycling is an accepted, documented residual risk of phone-based authentication, not a solved problem.** Carriers reassign dormant numbers; a reassigned number's new holder could pass phone verification and authenticate as the original household's existing identity. This is an inherent property of any phone-possession credential (shared by every SMS-first competitor), not a Corralio-specific defect. No mitigation is required before shipping phone auth, but this risk must not be silently assumed away, and should inform any future decision about how much sensitive content a phone-authenticated channel is trusted with relative to email.

## Analytics and logging

Do not send home addresses, raw private event addresses, child-sensitive schedule details, private notes, auth/share/handoff tokens, trusted HotelPlanner configuration, or rendered email/SMS message bodies to analytics.

Prefer stable internal IDs, sanitized event taxonomy, aggregated behavior, and non-sensitive metadata. Logging must redact source credentials and location values where they are not necessary to resolve an operational incident. Email and SMS delivery logs are held to the same redaction standard as any other operational log — a delivery-status record, not a copy of what was sent (see Notification Channels retention above).

## Interactive demo boundary

The unauthenticated marketing demo must use synthetic fixture data only. It must not read private household data, create persistent personal data, submit venue observations or candidate evidence, or become a separately editable planning surface. Reusing real presentation components must not weaken this isolation.

## Public sharing

Future sharing must be explicit and use a narrowly scoped, tokenized access mechanism.

- Minimize exposed fields.
- Never expose home/origin.
- Support revocation and expiry where appropriate.
- Do not imply household membership or edit access.
- Make the sharing audience and duration understandable to the user.
- Treat link possession as a security capability and keep tokens out of analytics.

## Operational requirements before scale

Before production household data is introduced, implementation work must define and verify:

- Threat model and data-flow inventory
- RLS and server-authorization tests
- Secret/token rotation and redaction
- Abuse and rate-limit controls
- Incident access and audit expectations
- Backup/restore implications for deletion requests
- Retention policy
- User and household export
- Account, household, and child-data deletion
- Product/legal and compliance requirements

Do not infer legal guarantees from this strategy document. The email/SMS retention windows above are CPO-recommended defaults, not confirmed legal requirements — they still require product/legal review before either channel ships, per this section.

## Open questions

- Minimum precision and retention for home/default origin
- Schedule-source credential and URL storage model
- Handoff/share token contracts and lifetimes
- Household invitation and recovery policies
- Support/admin access to private household data
- Export/deletion semantics across Corralio and shared TI identifiers
- Exact, legally-reviewed retention windows for email/SMS message bodies (this document proposes ~30 days as a CPO default; confirm against actual product/legal review)
- Each selected email-sending and SMS-aggregator vendor's own independent content-retention terms, and whether they can be configured shorter than their default
