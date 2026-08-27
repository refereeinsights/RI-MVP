# Corralio Pre-Launch Decision Packet — Activation, Mobile Quality, Retention

**2026-08-27 · Chief Product Officer · Response to the founder's "CPO Update — Corralio Pre-Launch Product Gates" directive**

Slice 4.6 (What Fits) is confirmed complete and applied locally (`docs/corralio/cpo/2026-08-26-slice-4.6-stage1-decision-packet.md`, verdict `SLICE 4.6 STAGE 2 APPROVED`; `notes.md` and `git log` confirm `feat: Implement Corralio What Fits Stage 2` and `Complete Corralio What Fits UAT` are both in the tree). This packet reconciles the founder's shift from planning-intelligence breadth to activation/mobile/retention against the current repository, the current execution plan, and actual tested platform/feed evidence, and proposes the smallest pre-launch slice sequence. **No code, migration, or ADR was changed to produce this packet.**

Method: read the live repository directly — `apps/corralio/app`, `apps/corralio/lib`, `apps/corralio/notes.md`, `docs/corralio/*`, `docs/prompts/corralio-*`, `docs/qa/ti-planner-ics-uat.md`, `docs/reports/corralio-slice-4.4b-*` — rather than trusting prior CPO documents' narrative where the live code and the narrative disagree. Two such disagreements surfaced and are called out explicitly below because they change what this packet can honestly claim.

---

## 1. Repository facts

**Schedule connection (evidence).** `apps/corralio/app/components/ConnectScheduleForm.tsx` is a single generic form: an optional display-name field, an optional sport dropdown, and a raw `<input type="url">` labeled "Calendar link" with the help text *"Paste the calendar link provided by your team app. It may be called an iCal or ICS subscription link."* There is no platform picker, no per-platform instructions, no "Where does this schedule live?" entry point, and no source-specific failure copy — `app/actions.ts`'s `connectSchedule` returns one generic success/error message shape (`FormState`). `ConnectedScheduleList.tsx` shows connected sources with generic states (`Connected` / `Refresh delayed` / `Schedule needs attention`) and a "Replace calendar link" affordance, again with no platform identity. This matches ADR-019 ("Direct Sports Platform APIs Are Not Required for V1... existing generic ICS/iCal ingestion is sufficient") but ADR-019 is about *not building OAuth*, not about leaving the paste-a-link UX unguided — those are separable, and the repository has correctly done the first and not yet done the second.

**Platform identity storage (evidence).** `corralio_schedule_sources` stores only a free-text `display_name` the parent typed. There is no platform/source-type column, taxonomy, or enum anywhere in the schema or in `apps/corralio/lib/schedules/*`. Nothing in the product today "knows" a connected schedule is GameChanger vs. TeamSnap vs. anything else. Any platform-aware picker, instructions, or failure copy is new product surface, not a UI skin on existing data.

**Analytics (evidence, and a real gap).** The only analytics-adjacent code in the entire app is `apps/corralio/lib/weeklyEngagement.ts` plus `corralio_weekly_engagement`, shipped in Slice 4.2A: one row per household per ISO week, tracking whether the household viewed This Weekend and whether it saw a conflict. That slice's own prompt is explicit and worth restating because it constrains what comes next: *"Do not instrument activation events. No `household_created`, `schedule_connected`, `second_schedule_connected`, or similar event rows. Activation state is a report-time query against existing tables, never a logged event."* Grepping the full app for `corralio_connect_*` (the event names the Slice 3.4 Stage 1 packet approved) returns zero implementation hits — those names are approved-but-unbuilt, Stage 2 work. There is no PostHog, no `ri_analytics_events` usage, no vendor of any kind wired into Corralio. The founder's requested activation funnel does not exist today in any form.

**Mobile / PWA (evidence).** `apps/corralio/app/manifest.ts` is a real, complete Web App Manifest — name, standalone display, theme colors, 192/512 icons. That's genuine PWA surface. But `next.config.js` has no service-worker plugin, and a full-repo grep for `service worker` / `push subscription` / `Notification(` outside of `.next` build cache and prose docs returns nothing. There is no offline caching, no install-prompt handling, and no push capability — consistent with the Slice 1 note ("added minimal manifest metadata without icons, a service worker, offline caching, or push behavior") never having been revisited. ADR-027 sets the intended posture correctly: *"Corralio begins as a mobile-first web/PWA experience... native apps are a future possibility, not a launch commitment."* Whether the actual mobile experience is good has not been verified by browser UAT in either the original CPO Baseline Assessment (which explicitly flagged "no live browser UAT was run this pass") or in this packet — that verification is Section 3's proposed slice, not something I'm asserting has already passed.

**Notifications (evidence).** Zero infrastructure. No push subscription code, no `Notification` API usage, no email-sending abstraction beyond Supabase Auth's built-in magic-link/recovery templates (which are identity emails, not product notifications). There is nothing to audit for capability gaps because nothing has been attempted yet — the audit in Section 3 below is therefore a feasibility/architecture assessment, not a code review.

**Source/platform identification (evidence).** Confirmed nowhere in the codebase — see "Platform identity storage" above.

---

## 2. Compatibility evidence

Two evidence sources exist, and they should not be blended without saying so: **TI's own tested ICS feeds** (`docs/qa/ti-planner-ics-uat.md`, a different product's planner, not Corralio) and **Corralio's retained test-household ingestion**, which the Slice 3.4 decision packet asserts exists but which was not independently queried in this session. This packet therefore treats the latter as **inference** rather than **evidence** until Codex's Stage 1 audit runs and reports only bounded, anonymized findings from `corralio_schedule_sources`/`corralio_events`.

| Platform family | TI real-feed evidence | Corralio ingestion evidence | Current parent-facing name | Compatibility status |
|---|---|---|---|---|
| GameChanger | PASS — 3 repeated refreshes, in-place updates (`changed=23`), partial season-window caveat, source-location coverage mixed (7/21 real feed) | Asserted connected (unverified this session) | "GameChanger" — unambiguous | **COMPATIBLE** |
| TeamSnap | PASS — 3 repeated refreshes, best location-data quality of any tested feed (100% street addresses), known `00:00` time-default edge case | Asserted connected (unverified this session) | "TeamSnap" — unambiguous | **COMPATIBLE** |
| SportsEngine / MySE | Partial PASS — update/move passed, 0% address data on the fixture payload, cancel/delete partial | None (already dropped from V1 in the existing 3.4 packet) | N/A for V1 | **MANUAL** (unchanged — this packet doesn't reopen that call) |
| Stack Team App / Sports Connect / legacy Blue Sombrero | **Not yet tested in TI.** TI's own compatibility matrix lists this row explicitly as `unknown` / `not yet tested` across every column. | A retained test connection was confirmed on 2026-08-27; identifying organization, team, and household details are intentionally omitted. | The app/store product a parent actually installs is **Stack Team App**; "Sports Connect" is the B2B backend brand a parent never sees; "Blue Sombrero" no longer exists as a product (verified by web search in the original 3.4 packet — this naming fact stands independent of the connection question) | **COMPATIBLE**, resolved below |
| Other calendar (generic ICS/webcal) | N/A by design (universal fallback) | N/A | "Other calendar" | Always available; not a compatibility claim |

**Finding, updated same-day:** the retained Stack Team App connection was confirmed directly. Identifying household, organization, team, event, and location details are deliberately excluded from this durable packet. The connection question is resolved, while the bounded Stage 1 audit remains responsible for reporting only aggregate ingestion behavior.

What this confirmation does *not* by itself establish, and what Slice 3.4 Stage 2 should still check as ordinary build diligence rather than as a gate: whether imported events have usable location data, whether refresh/cancellation behaves the way GameChanger/TeamSnap's tested feeds do, and whether any Corralio-specific parsing quirks exist for this feed format. Use bounded aggregate reads without retaining household or event details.

The naming correction (Stack Team App, not Blue Sombrero, and never three separate tiles) remains independently well-evidenced regardless.

**Recommended V1 picker: GameChanger, TeamSnap, Stack Team App, Other calendar.** Stack Team App's instructions panel should carry "also called Sports Connect" as supporting recognition copy, never a separate tile, and never "Blue Sombrero" anywhere parent-facing.

**Compatibility-status discipline going forward:** no platform in this table earns `DIRECT INTEGRATION` — everything here is a generic ICS/webcal feed, and all product and public copy must say "works with," "compatible with," or "we've tested feeds from," never "integrates with" or "official."

---

## 3. Activation gaps

What currently prevents a normal parent from connecting multiple schedules easily, in the order a parent would hit them:

1. **No "where does this live" moment.** The form opens straight to "Calendar link," which presumes the parent already knows what an ICS/iCal subscription URL is and has already found it in their team app. This is the single biggest activation cliff — already correctly identified by the original CPO Baseline Assessment in general terms, now confirmed specifically: there is no intermediate platform-selection or instructions step in the code at all.
2. **No source-specific help.** A parent who doesn't know how to get a GameChanger or TeamSnap link today has to leave Corralio and search the web — exactly the failure mode the founder's brief calls out.
3. **No reward on success.** A successful import produces whatever generic string `connectSchedule`'s `FormState.message` happens to carry — there is no "23 events added," no "Add another schedule" call to action, no "See your weekend" handoff. The loop just ends.
4. **No funnel visibility.** Because no analytics exist for this flow, nobody can currently see where parents abandon — at platform selection, at instructions, at paste, at validation, or after one schedule with no second. The founder's primary launch metric (% of new families reaching This Weekend with 2+ connected schedules) is **not currently measurable at all**, activation-critical infrastructure or not.
5. **Generic failure language.** Errors likely surface close to raw validation/parser text rather than source-aware recovery copy ("check the link," "show me where to find it," "try another source") — `FormState` is a single message string with no structured error kind for the UI to branch on yet.

None of this requires reopening ICS fetch/parse/persistence, which the existing 3.4 decision packet correctly ring-fenced. It's entirely front-of-funnel UX and instrumentation.

---

## 4. Mobile gaps

I have not run browser UAT for this packet — that's the point of Section 6's proposed slice, not something to assert without evidence. What I can say from code alone: the connect form's `<input type="url">` for pasting an ICS link has no `inputMode`/`autoComplete` mismatch that I can see (it already sets `inputMode="url"` and `autoComplete="url"`, which is correct and a good sign someone already thought about mobile paste behavior once). Beyond that single data point, every item the founder listed — touch targets, thumb reach, safe areas, loading/progress feedback during connection, success states, This Weekend density, conflict presentation, leave-by presentation, What Fits interaction, directions handoff — is **unverified**, not confirmed-bad. The CPO Baseline Assessment from three days ago flagged this same verification gap and it has not been closed since; Slice 3.1's local UAT did pass three mobile viewports for auth flows specifically, so *some* of the shell has been checked, but the full connect → weekend → conflict → leave-by → What Fits → directions chain as one continuous mobile journey has not.

**This is a genuine "we don't have evidence for this assumption" situation in both directions** — I can't tell the founder mobile is broken, and nobody should assume it's fine either.

---

## 5. Notification capability

**What can be delivered reliably today: nothing, because nothing exists.** This section is a feasibility read, not a code audit.

- **Web push via PWA:** technically available on modern mobile Safari and Chrome/Android for a page installed to the home screen, but gated behind an install step most parents will never take voluntarily, plus an explicit permission prompt most people decline by default. A push channel that only reaches installed, permission-granted users will under-cover the exact population (busy parents who never bothered to "Add to Home Screen") this product is built for.
- **In-app / badge-only:** trivially reliable, zero platform risk, but doesn't "bring a parent back" the way the founder's hypothesis needs — it only rewards someone who already opened the app.
- **Email:** the one channel that reaches 100% of signed-up households regardless of install state or permission prompts, and Corralio already has a working transactional-email pathway (Supabase Auth templates) proving email delivery works in this stack — but there is no marketing/product-notification sending abstraction today; "send a weekly digest email" is itself new infrastructure, just much smaller and lower-risk infrastructure than push.
- **"Leave soon":** the founder's own brief already flags this correctly as higher-risk. Corralio's leave-by is an *estimated*, non-live-routing figure (ADR-007, and Slice 4.6's card copy explicitly says "Estimated drive times · No live traffic"). A push notification implies a moment-of-relevance precision ("leave now") that the underlying data model cannot honestly back. I'd go a step further than "treat as higher-risk": **this should not ship in V1 at all**, not merely be deprioritized — shipping it risks a parent trusting a push notification's timing the way they'd trust a live-traffic app, and getting burned by the estimate being wrong at exactly the worst moment. Revisit only after leave-by has real-usage accuracy data, not before.
- **"Meaningful schedule change":** honestly conditioned in the founder's brief on "only if Corralio can detect and represent the change reliably" — today there's no change-detection/diffing logic anywhere in `apps/corralio/lib/schedules/*` beyond upsert-on-refresh; whether a refresh changed a *specific* field in a way worth alerting on is undetermined. This is real, unbuilt work, not a copy problem.
- **"Weekend ready":** the lowest-risk hypothesis by far — it needs no live precision claim, no change-detection, and its content ("Your weekend is ready — 7 events across 3 teams") is exactly what `weekendPlan.ts` already computes for the in-app view. The only open question is *delivery channel*, not *content logic*.

---

## 6. Recommended pre-launch slices

Smallest sequence, launch-blocking items first, no manufactured slice splits:

### Slice 3.4 — Schedule Connection Activation, Stage 2 (launch-blocking)
Build the platform-picker flow, the small typed instructions source-of-truth (a code module, per the existing Decision 3 — explicitly not a CMS), source-aware failure recovery copy, and the success-reward copy ("N events added" → "Add another schedule" → "See your weekend"), plus the approved `corralio_connect_*` funnel analytics. **Picker tile set is now settled:** GameChanger, TeamSnap, Stack Team App, Other calendar — the retained Stack Team App test connection closes the gate originally recommended. As ordinary build diligence, read only bounded aggregate imported-event behavior; do not retain household details. **Also reconcile before writing migrations:** the approved funnel-event list includes `events_imported` and `second_schedule_attempted`, which describe states already derivable from `corralio_schedule_sources`/`corralio_events` row counts — Slice 4.2A's own rule ("activation state is a report-time query against existing tables, never a logged event") argues those two should be *reported*, not logged twice, while `platform_selected`, `instructions_viewed`, and failed `link_submitted`/`feed_validated` attempts have no other trace and must be logged. Add one missing event: `corralio_connect_second_schedule_connected` (state-confirmed, not merely attempted) — it's what the primary launch metric actually needs. **Bundle in the tiny landing-preview polish** from Section 4 of the brief here (adding a subtle "via GameChanger"/"via TeamSnap" tag to two of the four static example-weekend events) — it's a copy-only change to `SignedOutLanding.tsx`'s existing array, not a reopened landing project, and it's most honest once the picker itself is running these two real, evidence-backed platforms.

### Slice 3.5 — Mobile Quality UAT & Hardening (launch-blocking, audit-first)
Run the full listed journey (landing → household → family → connect → This Weekend → conflict → leave-by → What Fits → directions) on real iPhone and Android, plus the team's existing Playwright cross-viewport/theme discipline, against the *rebuilt* Slice 3.4 connect flow specifically (auditing the old flow would be wasted work). Fix only what the audit actually finds — this is deliberately not a redesign mandate. Report PASS / PASS WITH IMPROVEMENTS / FIXES REQUIRED per the standard CPO UAT verdicts, and treat "audit finds it's already good" as a legitimate, cheap outcome, not evidence the slice was unnecessary.

### Slice 3.6 — Weekend-Ready Retention Signal, V1 (launch-blocking, decision-gated)
Ship exactly one notification hypothesis — "Your weekend is ready — N events across M teams" — through **one** channel, decided per Section 7 below. No preference center, no second trigger type in V1. "Meaningful schedule change" and "Leave soon" are explicitly **not** in this slice (see Section 5's reasoning); "schedule change" is a DEFER pending real diff-detection work, "leave soon" is a stronger REJECT-for-V1 given the estimated-routing honesty problem.

### Non-blocking, bundled where noted
- Landing preview source labels — bundled into Slice 3.4 above.
- ADR-030/033 reconciliation — see Decisions Required below; cheap, but not itself a product slice.

**Explicitly not proposed, matching the founder's non-goals list:** no direct-platform OAuth, no additional platforms beyond this table, no native app work, no help-center buildout, no route caching, no additional What Fits scope, no Pro work.

---

## Launch blocking vs. post-launch

| Item | Classification |
|---|---|
| Slice 3.4 Stage 2 (connect flow rebuild + funnel analytics, 4-tile picker) | **Launch-blocking** |
| Stack Team App ingestion spot-check (diligence, not a gate — see Decisions Required) | Non-blocking, folded into Slice 3.4 build work |
| Landing preview source-label polish | Non-blocking, bundled with 3.4 |
| Slice 3.5 (mobile UAT + bounded fixes) | **Launch-blocking** |
| Slice 3.6 (weekend-ready notification, V1) | **Launch-blocking** |
| "Meaningful schedule change" notification | Post-launch (DEFER — needs diff-detection evidence) |
| "Leave soon" notification | Post-launch, and specifically not scheduled for revisit until leave-by accuracy data exists (stronger than DEFER) |
| ADR-030/033 canonical-file reconciliation | Non-blocking but should happen soon — see below |
| Everything in the founder's explicit non-goals list | Post-launch / not evidence-justified today |

---

## Decisions required

Genuine unresolved product decisions only — everything else above is a recommendation, not a question:

1. **Notification channel for Slice 3.6.** Email digest (reliable, reaches everyone, but is new sending infrastructure) vs. web push (reaches only installed/permission-granted users, but reuses the existing PWA manifest) vs. deferring the retention test past launch entirely. **My recommendation: email digest first** — it tests the actual retention hypothesis ("does a reminder bring a parent back") without confounding the result with PWA install/permission friction, and it's smaller new-infrastructure than push. But this is a real product-cost tradeoff the founder should decide, not something I should lock unilaterally.
2. **RESOLVED, 2026-08-27, same day, later in this conversation.** The retained Stack Team App test connection was confirmed directly, closing the earlier evidence gap without preserving organization, team, household, event, or location identifiers. **Stack Team App ships as a fourth picker tile in Slice 3.4**, with no additional audit gate required. The ingestion-quality spot-check described above remains good practice but is no longer a precondition.
3. **ADR-030 and ADR-033.** These are cited by name and specific content across four different documents (two prompts, one Stage 1 report, and the existing Slice 3.4 packet itself, which leans on ADR-033 for the "connect multiple schedules" launch-gate requirement) — but neither exists in the live `CORRALIO_ARCHITECTURE_DECISIONS.md`. A prior stage report documents the exact intended text and explains why it was never applied ("the canonical ADR file has unrelated uncommitted changes"). This means part of the justification this very packet relies on (the launch-gate framing) is currently uncitable in the canonical file. This is cheap to fix — the text already exists, drafted, in `docs/reports/corralio-slice-4.4b-stage1-2026-08-25.md` — but landing it means resolving whatever uncommitted changes are blocking the file, which I haven't attempted and shouldn't attempt without the founder's go-ahead given "unrelated uncommitted changes" implies someone has in-progress edits there.

---

## Updated critical path

```
Slice 4.6 (What Fits) — COMPLETE
        │
        ▼
Slice 3.4 Stage 2 — rebuild connect flow (picker, instructions, reward, funnel analytics)
  + Stack Team App audit gate + landing label polish (bundled)
        │
        ▼
Slice 3.5 — mobile UAT across the full loop on the rebuilt flow, fix what's found
        │
        ▼
Slice 3.6 — one weekend-ready notification, one decided channel, V1 only
        │
        ▼
Bounded real-family pilot
```

Three slices, not five, and none of them reopen 4.3–4.6. This is the smallest sequence I can defend against the founder's own final test — a parent who keeps GameChanger for one kid and TeamSnap for another, connects both without leaving Corralio, sees the weekend immediately, knows when to leave, and has one honest reason to come back next weekend.
