# CPO Decision Document — Email/Text Schedule Intake + Lightweight Schedule Management

**2026-08-30 · Chief Product Officer**

Product/CPO analysis only. No SMS infrastructure, email ingestion, conversational AI, or new schedule-management functionality was built during this review. This document determines what changes to existing roadmap decisions, if any, and what the smallest useful surface is — it does not authorize building any of it.

---

## 1. Current-state evidence

Verified directly against the live repository this session; every claim below is cited, not assumed.

| Area | Verified evidence |
|---|---|
| **Schedule source ownership** | `corralio_schedule_sources` already supports household-level/unassigned sources as a first-class schema state, not a special case: `child_id` and `team_id` are both nullable with `constraint ... check (num_nonnulls(child_id, team_id) <= 1)` (`supabase/migrations/20260818_corralio_household_rls_foundation.sql:92-129`). A source with both null is valid today. **No new entity is needed to represent "household/adult" schedule ownership — it already exists in the data model exactly as the founder's prompt hoped it would.** |
| **Rename child** | Exists and is wired to a real table: `renameChild` (`apps/corralio/app/actions.ts:537-559`) updates `corralio_children.display_name`, scoped by household and non-archived status. |
| **Rename team** | Exists, folded into a broader action: `updateTeam` (`actions.ts:606-632`) updates `corralio_teams.display_name`, `sport`, and `arrival_buffer_minutes` in one call — there is no separate "rename team" primitive, it's one of three fields `updateTeam` can change. |
| **Arrival buffer** | The column (`corralio_teams.arrival_buffer_minutes`, smallint, 0-120 step 5) was added in `supabase/migrations/20260826_corralio_slice46_what_fits.sql:5-10` and is mutable via `updateTeam`. **It lives only on `corralio_teams` — not on `corralio_schedule_sources` or households.** This confirms, with a schema citation rather than a repeated assumption, the gap noted in prior CPO docs: an unassigned/household-level schedule source has no arrival-buffer field to set anywhere in the schema today. |
| **Disconnect calendar** | Exists, and is deliberately non-destructive: `disconnectSchedule` (`actions.ts:385-399`) calls RPC `corralio_disconnect_schedule_source_v1` (`supabase/migrations/20260823_corralio_slice41b_family_schedule_lifecycle.sql:21-71`), which sets `sync_status = 'disconnected'` and clears refresh-claim fields — it does not delete the source row or touch already-imported events. The existing web UI (`ConnectedScheduleList.tsx:157-165`, a `LifecycleConfirmation` component) already gates this behind an explicit confirm dialog with copy explaining events aren't erased. |
| **SMS/email infrastructure** | Still zero code, zero vendor config anywhere in the monorepo (reconfirmed this session, consistent with every prior pass). |
| **Authentication** | Currently email-only (`SUPPORTED_OTP_TYPES` excludes phone); a phone-first migration is already designed, not yet built, per `2026-08-30-cpo-investigation-phone-first-authentication.md`. |
| **Schedule URL/credential handling** | The raw schedule URL is persisted verbatim in `corralio_schedule_sources.source_url`, including any query-string tokens it may carry (only userinfo-style `user:pass@host` credentials are rejected at intake — `packages/lib/sports-schedule/server.ts:79` — query-string tokens are not stripped or redacted). Deliberate anti-logging discipline exists at every failure path: `databaseFailure()` in both `supabaseStore.ts:10-16` and `refreshSupabaseStore.ts:8-14` logs only a stage name and error code, explicitly never the URL, event payload, or upstream response (`supabaseStore.ts:10-16`'s own comment states this). No `console.*` call anywhere in `lib/schedules/` or `packages/lib/sports-schedule/` includes a URL variable. |
| **Existing settings UI** | `/family` (`apps/corralio/app/family/page.tsx`) already has working UI for child rename, team rename + arrival buffer (`FamilySection.tsx`), and calendar disconnect with confirmation (`ConnectedScheduleList.tsx`). **No UI exists to rename a schedule source's own display name** — not needed for any of the founder's four example commands, all of which target child/team/source-connection state, not the feed's own label. |

## 2. Product assessment

**Messaging schedule intake.** Real pain, already evidenced independently of this document: the entire SMS-first channel work this session (the priority-channels investigation, the HeySammi competitive review, the phone-first auth decision) is built on exactly this friction — a parent has to find and use Corralio's connection UI before Corralio can help at all. Frequency: once or a handful of times per family (per child/team, at season start or when a new team forms) — a low-frequency, high-leverage moment, not a recurring habit. Primary impact: **Activation.** Major risk: the "clerical work" promise (owner/sport/team inference) is only as good as the underlying platform-detection logic already in `platforms.ts` — if inference fails often, the "just send a link" pitch degrades into a support burden, not a friction reducer.

**Messaging schedule management.** Real but unproven pain — **there is no existing evidence, from this or any prior session investigation, that navigating to `/family` to rename a child or adjust an arrival buffer is an observed drop-off point.** It's a plausible convenience, not a documented problem. Frequency: lower than intake — these are corrections and adjustments, not a repeated task. Primary impact: **Retention/accuracy at the margin**, and possibly a trust signal ("I can just text a fix") more than a measurable behavior-frequency win. Major risk: the ambiguity-resolution and confirmation UX (Section 4) is real design and engineering work even though the underlying mutations already exist — the founder's own examples ("disconnect soccer" with two soccer sources) show this isn't free just because `renameChild`/`updateTeam`/`disconnectSchedule` already exist as primitives.

**These are genuinely different hypotheses, per the prompt's own framing, and the evidence treats them differently: intake has an activation thesis already backed by this session's broader SMS-first work; management commands do not yet have an equivalent evidence base.**

## 3. Minimum data contract

| Field | Classification | Basis |
|---|---|---|
| Calendar/ICS URL | **Required** | No connection is possible without it |
| Schedule owner/association | **Required only when it cannot be safely inferred** | The schema already supports child, team, or unassigned/household (Section 1) — ask "who is this for?" only on ambiguity, never force a choice the message already answered (e.g., "Jake baseball" names both a likely child and sport) |
| Source platform | **Inferred** | Existing platform-detection logic already does this for the web connection flow |
| Feed/calendar name, sport, team name | **Inferred where the feed/message provides enough signal; confirmed with the parent, not silently assumed** | Matches the founder's own example copy ("We found Jake's Spokane Select baseball schedule") |
| Arrival buffer | **Defaulted** | Reuses the existing 30-minute constant already in `leaveBy.ts` (`LEAVE_BY_ARRIVAL_BUFFER_MINUTES = 30`) — this is not a new default being invented for this feature, it's the same number the product already uses everywhere else |
| Location, venue, tournament, timezone, event dates | **Never requested from the parent** | Comes from the schedule feed and existing enrichment pipeline, unchanged |

## 4. Supported action matrix

| Action | Support? | Confirmation? | Ambiguity handling | Existing backend primitive? | Recommended phase |
|---|---|---|---|---|---|
| Rename child | Yes | No — low-risk, immediately visible, reversible by the same command | If the household has two children whose current name plausibly matches, ask which; otherwise resolve on exact match | `renameChild` (`actions.ts:537-559`) | TEST NEXT |
| Rename team | Yes | No, same reasoning as above | Ask which team if the household has more than one plausible match (e.g., two "soccer" teams for different children) | `updateTeam` (`actions.ts:606-632`) | TEST NEXT |
| Change arrival buffer | **Partial** — full support only for team-attached sources | No — reversible, low-risk | Ask which team if the child has more than one | `updateTeam`'s `arrival_buffer_minutes` parameter — **does not exist for unassigned/household sources; this is a real, confirmed schema gap (Section 1), not an assumption** | TEST NEXT for team-attached; **DEFER** for unassigned-source buffers until the schema gap is deliberately closed (a small, real addition, not a given) |
| Disconnect calendar | Yes | **Yes, explicit — reuse the existing `LifecycleConfirmation` pattern and copy discipline already proven in the web UI**, since "disconnect" reads as consequential to a parent even though it's technically non-destructive | Ask which, exactly as the founder's own "disconnect soccer" example anticipates, when more than one source matches | `disconnectSchedule` → `corralio_disconnect_schedule_source_v1` RPC (already non-destructive by design) | TEST NEXT |

**All four reuse existing, already-trusted server-side mutations.** The architecture principle the founder asked to evaluate — separate the intent/action layer from the channel — is not a new pattern to build, it already exists in practice: the web UI, the eventual message-based interface, and any future surface would all call the same `renameChild`/`updateTeam`/`disconnectSchedule` functions. The genuinely new work for Hypothesis B is entity resolution (matching a name in a message to the right household entity), ambiguity detection, and confirmation copy — not new business logic.

## 5. Channel recommendation

| Channel | Recommendation | Why |
|---|---|---|
| Existing in-app UI | **Do Now — unchanged** | Already built and working for 3 of 4 actions; nothing here proposes removing it |
| In-app natural-language input ("Tell Corralio what changed...") | **Test Next** | Lower-risk proving ground than SMS/email for the intent-resolution layer — same authenticated session, no channel-identity or inbound-message security surface to build first; could validate the entity-resolution/ambiguity logic before extending it to SMS/email |
| Email | **Test Next for intake; Defer for management commands** | Intake is already the subject of active, scoped work (Phase A/B of the priority-channels investigation); management commands via email have no committed channel-identity work to attach to yet and no proven demand (Section 2) |
| SMS | **Test Next for intake, sequenced behind email per the existing priority-channels recommendation; Defer for management commands** | Same reasoning as email, plus SMS's added A2P lead-time and per-message cost make it the wrong place to prove an unproven management-commands hypothesis first |

## 6. Existing-decision reconciliation

**This document does not itself change the SMS-deferred classification — that classification was already superseded by the founder's own SMS-first decision two exchanges ago, and this document's job is to point out where the canonical docs haven't caught up, not to relitigate the decision.** Specifically:

- `CORRALIO_CPO_EXECUTION_STATE.md`'s DEFERRED list still names "SMS infrastructure + entitlement/Pro model (ADR-011-gated, no billing infra exists...)" — this line predates the SMS-first founder decision and needs updating to reflect that SMS ingestion/notification work is now an active, phased, founder-directed initiative (Phase A–D of the priority-channels investigation), not a deferred backlog item. Billing/entitlement gating is correctly still deferred — that part of the line remains accurate — but bundling SMS infrastructure itself into the same deferred line is now stale.
- `CORRALIO_SECURITY_PRIVACY.md`'s SMS section header (already flagged as stale in the phone-first-auth work) still reads "currently roadmap-deferred to Phase 3" — same issue, already noted, not yet resolved.

**What this document specifically adds that wasn't already decided: messaging-based schedule *management* commands (Hypothesis B) are new scope, separate from the already-decided intake/notification work, and should not inherit intake's founder-decided status by association.** Recommend the founder treat Hypothesis B as its own, not-yet-decided question — Section 9 below classifies it independently rather than assuming it rides along with SMS-first.

## 7. Privacy/security review

**New risk, specific to this feature and not previously assessed: forwarded schedule URLs pass through a third-party email/SMS vendor's infrastructure before reaching Corralio, which the existing paste-into-web-form flow never did.** Today, a schedule URL only ever transits Corralio's own TLS connection. Under email/SMS intake, the same URL — which may carry an embedded access token in its query string, confirmed as unredacted-at-storage in Section 1 — also transits and is potentially retained by Resend/Telnyx (or whichever vendors are selected) as part of normal message handling. This is the same "third-party retention" caution already written into `CORRALIO_SECURITY_PRIVACY.md` for email/SMS generally, but this review sharpens it into a concrete, specific instance: **the vendor evaluation for email/SMS ingestion should explicitly ask each candidate vendor about message-body retention and deletion controls, because the message body in this specific feature is a secret-bearing calendar URL, not a generic notification.** This is a new, named requirement for that already-recommended spike, not a new spike.

**Existing protections hold and don't need weakening:** the URL is never logged today (Section 1) and that discipline should extend unchanged to whatever new intake path is built — the inbound message handler must not log the raw message body either. Analytics must never receive the URL, consistent with both this document's own Measurement section and the existing security doc's rule.

**Confirmation discipline for management commands is a privacy control, not just a UX nicety:** the founder's own framing — a message must never become authorization merely because it names a valid child/team — is the right rule and requires the same verified-phone/email-to-authenticated-household chain already designed in the phone-first-auth investigation. No new authorization model is needed; this feature simply must not bypass the one already designed.

## 8. Recommended experiment

**Two separate experiments, matched to the two separate hypotheses — deliberately not one combined test.**

**Intake:** don't design a new experiment — piggyback on the bounded pilot and the smallest-launch-worthy version already recommended in the priority-channels investigation (Phase A + Phase B's email leg). *Population:* the existing 10-15 family bounded pilot, once that phase ships. *Experience:* offer email-based schedule connection as an alternative to the existing web flow, not a replacement. *Duration:* the pilot's own existing window — no new timeline needed. *Events measured:* exactly the funnel already specified (intake initiated → valid URL detected → parsed → owner resolved → sport/team inferred → correction required → connected → time-to-connect → This Weekend viewed → second schedule connected), compared directly against the same funnel through the existing UI for the same cohort. *Illustrative success threshold (a hypothesis for the founder to set, not evidence-backed):* completion rate within roughly 10 points of the existing UI's rate, and meaningful voluntary uptake (say, 30%+ of the cohort tries it when offered both). *Illustrative failure threshold:* a majority of attempts need manual correction or support intervention, or completion rate is dramatically below the UI's (e.g., under half).

**Management commands:** a smaller, nearly-free precursor before building anything — **instrument the existing `/family` UI's rename-child, rename-team/arrival-buffer, and disconnect actions with usage-frequency analytics (sanitized event counts only, no content), which don't exist today.** This directly tests whether the underlying friction is real by observing how often parents already do these things through the UI that exists, before investing in a message-parsing layer to make it faster. If usage is rare, that's real evidence Hypothesis B is solving a problem that doesn't occur often enough to be worth the ambiguity/confirmation engineering in Section 4 — cheaper to learn this from existing-UI telemetry than from building the message version first.

## 9. Recommendation

**Email calendar intake: Test Next.** Already effectively decided by the SMS-first founder direction; this document's contribution is confirming the minimum data contract and the ownership-model evidence, not re-deciding it.

**SMS calendar intake: Test Next, sequenced behind email.** Unchanged from the existing priority-channels recommendation — this document finds no new evidence to accelerate or decelerate that sequencing.

**Messaging-based schedule changes (Hypothesis B): Test Next, but only the cheap precursor (existing-UI usage instrumentation) right now — the message-based command system itself stays Defer until that precursor shows real usage frequency, and regardless does not get built ahead of intake, since it depends on the same channel-identity work.**

**General Corralio conversational assistant: Kill.** Nothing in this review — or any prior review this session — produces evidence for this. The deterministic intent → resolve entity → validate → confirm → execute existing action pattern the founder specified is sufficient for every example given; there is no case made anywhere in this document for open-ended natural-language interpretation.

Feasibility is not the governing question, and none of the above is authorized to build — this is a classification of what's worth testing, not a build order.

---

## Sources

Corralio repository (this session): `supabase/migrations/20260818_corralio_household_rls_foundation.sql`, `supabase/migrations/20260826_corralio_slice46_what_fits.sql`, `supabase/migrations/20260823_corralio_slice41b_family_schedule_lifecycle.sql`, `apps/corralio/app/actions.ts`, `apps/corralio/app/family/page.tsx`, `apps/corralio/app/components/FamilySection.tsx`, `apps/corralio/app/components/ConnectedScheduleList.tsx`, `apps/corralio/lib/schedules/supabaseStore.ts`, `apps/corralio/lib/schedules/refreshSupabaseStore.ts`, `packages/lib/sports-schedule/server.ts`, `apps/corralio/lib/leaveBy.ts`. Prior CPO documents this session: `2026-08-30-cpo-investigation-email-sms-priority-channels.md`, `2026-08-30-cpo-investigation-phone-first-authentication.md`, `CORRALIO_SECURITY_PRIVACY.md`, `CORRALIO_CPO_EXECUTION_STATE.md`.
