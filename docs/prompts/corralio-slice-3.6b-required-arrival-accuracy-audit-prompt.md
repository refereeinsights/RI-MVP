# Corralio Slice 3.6B — Phase 1 Required-Arrival Convergence + Parallel Phase 2 Arbiter Evidence Audit

**Audit-and-narrow-build only. Task 1 is the Phase 1 required-arrival build. Task 2 is a parallel, report-only Arbiter evidence audit. This prompt does not authorize Mapbox, traffic-aware routing, or any additional 3.6B notification work. It does not modify Slice 3.6A (Weekend Ready Web Push) in any way. Phase 2's evidence outcome does not control whether later traffic-aware work may proceed against the proven event → source → team → default hierarchy.**

> **Founder Decision, 2026-08-31 — authoritative correction.** Use one canonical hierarchy everywhere required arrival is resolved: valid ICS/event explicit arrival → source preference → team preference → Corralio 30-minute default. Both What Fits and This Weekend/Leave-by must consume one shared pure resolver. Provenance is typed resolver output (`ics_explicit` | `source_preference` | `team_preference` | `corralio_default`), not an operational logging or persistence requirement. Task 1 has its own database-verification gate and is not blocked by Task 2.

> **Evidence Log, 2026-08-28 (CPO), fixture 1.** A real multi-event Arbiter Officials feed export became available (founder-provided). CPO performed the Section-1/Task-2 structural inspection directly rather than leaving it fully to this Stage 1's execution — see the revised Section 1 third bullet and the new Section 4 subsection "Fixture now available: what it showed." A sanitized copy (real names/addresses replaced, structure preserved) is committed at `docs/audits/corralio-arbiter-multi-sport-sample-sanitized.ics` for Codex to inspect directly rather than re-deriving from documentation. This finding is a starting point for Task 2, not a substitute for independently verifying it — the fixture is one official's feed, and (as detailed below) it does not actually exercise a cross-sport case.
>
> **Evidence Log, 2026-08-28 (CPO), fixture 2.** A second real feed export became available, from a different link. It is structurally unrelated to the first — no `Sport:`/`Level:`/`Team:`/`Subsite:` labels at all, only `Site: <value>`, and its event titles ("Football Offseason Video," "Pre-Season Training," "Pre-Season Jamboree") indicate it is a team/program schedule, not an individual official's assignment feed. See the revised Section 1 third bullet and new Section 4.2. This changes the shape of the evidence gap: the open question is no longer only "does a signal exist," but "ArbiterSports exports multiple, structurally incompatible formats depending on product/context, and most of them may carry no sport/group signal at all."

## 0. Why This Exists

Founder direction, 2026-08-28 ("Corralio Planning Intelligence"): Corralio's differentiation is the full loop — know the commitment, know when the family actually needs to arrive, know normal travel time, account for traffic, tell the family when to leave, understand the usable gap, recommend what fits. Notifications matter because they deliver this intelligence at the moment it's useful, not as a re-engagement gimmick. Required-arrival accuracy is foundational to all of it: What Fits already honors explicit feed/event arrival before team/default behavior, but Leave-by does not consume that same truth and neither consumer has a source-level preference.

The founder specifically asked whether source/team/group-specific arrival preferences can improve the existing hierarchy, using one officiating parent working football, soccer, and basketball through different Arbiter groups — each with a different real required-arrival time — as the proving case, while being explicit this must generalize to ordinary family sports commitments, not become referee-specific, and must not be solved by fuzzy title-matching.

## 1. Confirmed Starting Facts (verify independently before relying on them)

These were established by direct repository inspection and a check of ArbiterSports' own public help documentation. Repository/live-evidence reality still wins if either turns out stale — re-confirm both before building on them:

* **The existing consumers currently diverge.** `arrival_buffer_minutes` lives on `corralio_teams` (nullable, 0–120, 5-minute step, parent-editable in `FamilySection.tsx`). What Fits already resolves valid feed/event `schedule_arrival_at` ahead of the team preference and then the Corralio default. This Weekend/Leave-by does not currently select or consume `schedule_arrival_at`; it independently subtracts drive duration and the global default from event start. There is currently no source-level preference. Confirm the exact live implementation before editing, but treat this divergence as the defect Task 1 is explicitly authorized to correct.
* **Event/feed explicit arrival already exists and is not a future tier.** Preserve it as the highest-precedence source of required arrival. Do not overwrite, backfill, or reinterpret feed-derived arrival timestamps when a source preference changes.
* **ArbiterSports issues one combined calendar feed, not one feed per sport/group.** Per ArbiterSports' own help documentation ("Subscribing to an Arbiter Calendar Feed" and "How To Set Preferences," `arbitersportshelp.zendesk.com`), Calendar Sync produces a single iCal URL per official covering everything they're assigned to and accepted as an official — there is no documented per-sport or per-assigning-group feed option. This rules out "just treat each group as a separate Corralio source" as a shortcut: a referee working three sports through Arbiter will show up as one Corralio schedule source, not three.
* **Whether individual events in that combined feed carry a reliable, structured group/sport identifier now looks unlikely as a general property, based on two real samples.** Sample 1 (an officiating-assignment feed, 7 events, all soccer) has a consistent `Sport:`/`Level:`/`Team:`/`Site:`/`Subsite:` labeled block inside `DESCRIPTION` — but `Sport:` reads the literal word "Tournament" (not the real sport) for every tournament-type assignment, and the sample never contains a second real sport, so it doesn't prove the label discriminates sport at all. Sample 2 (a different link, a team/program schedule rather than an officiating feed — training sessions, offseason video, jamborees) has none of those labels; `DESCRIPTION` contains only `Site: <value>`. Two real ArbiterSports exports, two incompatible formats. Working conclusion: ArbiterSports' export shape is product/context-dependent, not a single fixed platform contract, and any parser built against Sample 1's template will silently find nothing in a feed shaped like Sample 2 — which must degrade to "no signal," never a guess. See Section 4.1/4.2 for the full read-out.

## 2. Two Separate Questions — Do Not Conflate Them

**Question A / Task 1 (generalizes broadly, answerable now):** Can Corralio express an arrival-time preference more granular than "per team," for any family commitment, not just Arbiter, while preserving explicit event arrival? Yes, structurally — add a source preference and converge both consumers on one resolver with the canonical event → source → team → default hierarchy. This helps assigned and unassigned household sources and fixes the existing Leave-by/What Fits divergence.

**Question B (Arbiter-specific, blocked on evidence):** Can Corralio automatically tell that *this specific event* inside one combined Arbiter feed belongs to the football group versus the basketball group, so it can apply a different arrival preference *within* a single source? This is the harder, narrower question, and Section 1's findings mean it cannot be answered from documentation or inference — it requires inspecting a real, populated, multi-sport Arbiter Officials feed, which does not exist in this repository today.

Do not let Question B block shipping Question A. They are independently valuable and independently scoped below.

## 3. Task 1 — Phase 1 Required-Arrival Convergence (buildable now)

Audit first: confirm Section 1's schema and consumer claims directly. Unless repository evidence establishes a genuine blocker, store the source preference on `corralio_schedule_sources` by reusing the bounded semantics already proven for `corralio_teams.arrival_buffer_minutes` rather than designing a new preference model.

Implement one shared, pure required-arrival resolver with exactly this precedence:

1. valid ICS/event explicit arrival;
2. source preference;
3. team preference;
4. Corralio 30-minute default.

The resolver must return:

* the resolved required-arrival timestamp;
* the resolved buffer/minutes where applicable;
* typed provenance: `ics_explicit` | `source_preference` | `team_preference` | `corralio_default`.

Both What Fits and This Weekend/Leave-by must consume this same resolver. Preserve all existing valid explicit-arrival behavior. Leave-by must be calculated as resolved required-arrival timestamp minus estimated drive duration; it must no longer independently calculate event start minus drive duration minus a separate global default. Assigned and unassigned household sources must both support the source preference.

Do not build a new preferences UI surface beyond what is needed to set this one value alongside existing connected-source management. UI data must contain only bounded connected-source metadata plus the preference; do not expose private `source_url` merely to support this control. Do not touch conflict detection, event schema, routing records, venue matching, or feed-derived explicit arrival timestamps.

### 3.1 Source-preference database and security boundary

Implement the source preference as:

* nullable `smallint`;
* 0–120 minutes inclusive;
* five-minute increments;
* no backfill;
* a narrow owner-authorized write RPC;
* no broad authenticated update grant;
* forced RLS preserved;
* verified denial across households.

Clearing the source preference must restore team/default behavior without mutating events, teams, routing records, venues, or feed-derived arrival timestamps.

### 3.2 Provenance boundary

Provenance is typed in-memory resolver output. Do not add an analytics event, persisted provenance column, or operational log merely to record it. Do not introduce dynamic logging containing household, schedule-source, team, event, arrival-time, or preference data. A parent-facing provenance UI is not required unless an existing concrete consumer makes it necessary for this bounded implementation.

## 4. Task 2 — Parallel Phase 2 Arbiter Evidence Audit (report only)

Start from the two sanitized real fixtures already in the repository. One contains the labeled Arbiter Officials structure; the other is a structurally different team/program export. Neither is a genuine multi-sport Officials proving feed, neither proves cross-sport discrimination, and neither authorizes a group-level parser or preference tier.

Check whether a newer, genuine multi-sport Arbiter Officials feed has since been added to the authorized repository evidence. Do not solicit or require new private feed credentials merely to complete Task 1. If no newer genuine proving feed exists, close Task 2 as **inconclusive**. Do not fabricate evidence or treat absence of such a feed as a blocker to Task 1.

If a real multi-sport feed becomes available: inspect actual VEVENT structure across events from different sports/groups within it. Look specifically for any field — `CATEGORIES`, organizer/contact fields, a consistent structured prefix, or any other machine-parseable, non-fuzzy signal — that reliably and deterministically distinguishes which group/sport an event belongs to. A signal only counts if it is structurally guaranteed by the feed format, not a pattern that merely happens to hold in the sample. Report exactly what was found, including if the honest answer is "no reliable structured signal exists in this feed."

**Do not infer group or sport from `SUMMARY`/`DESCRIPTION` text pattern-matching, keyword lists, or any other fuzzy/heuristic method, under any circumstances** — this was the founder's explicit instruction, and Slice 3.7's own `SUMMARY;LANGUAGE=en-us` bug is a concrete reminder that even structured-looking ICS text fields from this vendor have already misled a naive parser once.

If no real multi-sport feed is available and none can reasonably be obtained: report that plainly as the audit outcome. Do not simulate or fabricate a plausible-looking multi-sport fixture to manufacture an answer — a synthetic fixture proves nothing about what ArbiterSports' real feed actually contains.

### 4.1 Fixture now available: what it showed (CPO read-out, 2026-08-28 — verify independently)

A real feed export became available and is committed, sanitized, at `docs/audits/corralio-arbiter-multi-sport-sample-sanitized.ics` (real official/co-official names and site addresses replaced with placeholders; every other structural detail — field presence, field order, which fields are present vs. omitted per event, and the literal `Sport:`/`Level:` values — preserved exactly). Independently re-inspect the sanitized file directly rather than trusting this summary alone:

* `DESCRIPTION` on every event follows the same labeled block: `Sport: <value>\nLevel: <value>\n[Team: <value>\n]Site: <value>\nSubsite: <value>\n\n` followed by one `<Name>  Position: <Role>` line per assigned official. `Team:` is present in 6 of 7 events and cleanly absent (not blank) in the seventh — the template is real and consistent, but not every field is guaranteed present on every event.
* This is a genuine structured convention, not fuzzy `SUMMARY` guessing — parsing an explicit `Sport: <value>` label is reading a labeled field, not inferring one from ambiguous free text, so a small deterministic block parser (split on `\n`, match known `Label: ` prefixes) does not violate the founder's no-fuzzy-matching instruction. It is, however, *not* an RFC5545-standard property (no `CATEGORIES`, no `X-` field) — it is Arbiter's own export template living inside an otherwise-free-text field, and is therefore more exposed to silently breaking on a future Arbiter export-format change than a true calendar property would be. Treat it as real but comparatively fragile evidence.
* **The critical caveat: `Sport:` is not reliable for distinguishing sport on tournament-type assignments.** All three club-tournament events in this sample carry the literal value `Sport: Tournament` — not the actual sport — while the four high-school season assignments correctly carry `Sport: Girls Soccer - HS`. If this official also worked football tournaments, the evidence available here suggests those would likely also read `Sport: Tournament`, indistinguishable from the soccer tournaments by this field alone.
* **The sample does not actually test the founder's proving case.** Every event in this fixture is, in real life, the same sport (soccer) — youth club soccer tournaments and high-school soccer respectively. It demonstrates the feed's structure convincingly, but it cannot yet confirm or deny whether any field reliably discriminates between two genuinely *different* sports (e.g., football vs. soccer vs. basketball) for the same official — that is still open. If a second real sample covering a different sport for the same or another official becomes available, re-run this comparison against it before treating cross-sport discrimination as resolved.
* Working conclusion pending that further evidence: `Sport:`/`Level:`/`Team:` are usable, real, non-fuzzy signals for whether an assignment is a standard single-sport season game versus a tournament assignment, and for level/age-group within a known sport — but not, on the evidence so far, a dependable way to tell two different sports' tournament assignments apart from each other. Task 1's source-level override is unaffected either way; this finding bears only on Task 2's future group-tier question, which stays open for a narrower and more specific reason than "no structure exists."

### 4.2 Second fixture: a structurally different Arbiter export (CPO read-out, 2026-08-28 — verify independently)

A second real feed export, from a different subscription link, is committed sanitized at `docs/audits/corralio-arbiter-sample-2-team-calendar-sanitized.ics` (real addresses replaced with placeholders; this sample contained no personal names to sanitize). Independently re-inspect it directly:

* `DESCRIPTION` here is only ever `Site: <value>\n` — no `Sport:`, `Level:`, `Team:`, `Subsite:`, and no official/role roster lines. `SUMMARY` values ("Football Offseason Video," "Pre-Season Training," "Training Session," "Pre-Season Jamboree-...") and the complete absence of a roster indicate this is a team/program schedule (coach or team-staff context), not an "Arbiter Officials" assignment feed like Sample 1 — a different ArbiterSports product/export path, not a second instance of the same one.
* Every event in this sample is football, so it likewise cannot test cross-sport discrimination. Combined with Sample 1 (single-sport, soccer), neither real sample obtained so far actually exercises the founder's original proving case (one official, multiple different real sports). Do not treat the sport-discrimination question as resolved either direction without a sample that genuinely spans two different sports for the same official.
* **Separate confirmed ingestion risk:** compound placeholder locations such as `LOCATION: (unknown) (unknown), (unknown) (unknown)  (unknown)` are not excluded by the current exact-value `NON_PLACE` handling and Arbiter ingestion is now reachable. Record this explicitly as: **Arbiter compound unknown-location exclusion: confirmed current ingestion risk; not fixed by Phase 1.** Do not expand this required-arrival slice into venue/geocoding work.
* Net effect on Section 1's finding: this doesn't just fail to close the group-identity question, it changes what kind of problem it is. The evidence increasingly points toward "ArbiterSports has no single consistent export contract to parse against" rather than "one format exists and we haven't found the right field yet." That's a materially different conclusion for whether to keep investing in automatic detection at all versus leaning entirely on Task 1's manual source-level control as the durable answer — flag this explicitly in the Task 2 report rather than defaulting to "needs more samples" without saying so.

## 5. Explicit Non-Goals (this Stage 1 audit)

Do not: build any new per-event or per-group manual override UI (existing feed/event explicit arrival remains supported); implement Mapbox or traffic-aware routing; implement any additional 3.6B notification; modify Slice 3.6A; modify conflict detection, event schema, venue matching, or schedule ingestion beyond consuming existing explicit arrival through the shared resolver; add SignUpGenius or another source platform; add entitlement/Pro logic; or build anything referee-specific. Do not add analytics, provider-ledger vocabulary, or external calls.

## 6. Privacy / Security

Follow existing patterns exactly: the arrival-buffer value is ordinary household-owned, RLS-scoped data, no different in sensitivity from the existing team-level field. Any Arbiter fixture obtained for Task 2's audit must be treated with the same discipline as Slice 3.7's fixtures — no real household/individual-official identity retained in the repository, tests, or this audit's own written output beyond what's already the established pattern for prior ICS audits.

## 7. Required Tests

Add/update deterministic tests covering at minimum:

1. full `ics_explicit → source → team → default` precedence;
2. explicit arrival always beats source and team preference;
3. source preference beats team preference;
4. assigned sources;
5. unassigned/household sources;
6. What Fits and This Weekend/Leave-by consume the same resolver;
7. Leave-by subtracts estimated drive duration from resolved required arrival;
8. existing What Fits behavior remains intact;
9. source-preference validation: nullable `smallint`, 0–120 inclusive, five-minute increments;
10. narrow writer authorization;
11. cross-household denial;
12. provenance correctness for all four typed tiers;
13. clearing a source override restores team/default behavior;
14. source-preference changes do not mutate events, teams, routes, venues, or feed-derived arrival timestamps.

Do not add any test that depends on a specific Arbiter group-identity signal being present — Task 2 is a report, not an implemented behavior, unless its own findings justify a separate follow-on slice.

## 8. Stage and Verification Gates

### 8.1 Stage 1 repository gate

Stage 1 must:

1. audit and implement repository code;
2. prepare an unapplied forward migration;
3. prepare read-only catalog verifiers;
4. prepare rollback-only behavioral verifiers;
5. apply no database mutation;
6. stop at `SLICE 3.6B PHASE 1 READY FOR DATABASE VERIFICATION`.

Do not apply the migration, reprocess existing data, or perform database UAT before the human database gate.

### 8.2 Post-application verification

After a human confirms migration application, run the catalog verifier, rollback-only behavioral verifier, and bounded local UAT. UAT must use disposable authorized fixtures, cover assigned and unassigned sources/events, and expect exactly zero calls to Geocodio, OpenRouteService, Mapbox, Overture, HotelPlanner, push, or any other external provider.

Before the applicable terminal verdict run: focused arrival-buffer tests; all affected deterministic tests; complete Corralio test suite; explicit Corralio TypeScript validation; zero-warning Corralio lint; `git diff --check`; all four production builds (`corp-app`, `corralio-app`, `referee-app`, `ti-web`).

Also verify: no Slice 3.6A behavior changed; no traffic/Mapbox work entered the diff; no conflict-detection or venue-matching behavior changed beyond the arrival-buffer lookup.

Do not push. Do not deploy.

## 9. Notes and Durable Record

Update `apps/corralio/notes.md` with: the confirmed/corrected starting facts; the shared resolver and exact event → source → team → default hierarchy; Leave-by/What Fits convergence; source-preference security boundary; Task 2's exact evidence outcome, including **inconclusive** if no genuine multi-sport Officials feed exists; the separately tracked compound unknown-location risk; tests/builds; database gate status; and the applicable final verdict. State that Task 2 does not block Phase 1 or authorize a group-specific build.

## 10. Commit

Review the complete diff before committing. Commit only files belonging to this audit/source-level-arrival-buffer work. Use a focused local commit message. Do not push. Do not deploy.

## 11. Final Verdict

Return exactly one appropriate terminal verdict:

`SLICE 3.6B PHASE 1 COMPLETE LOCALLY`
`SLICE 3.6B PHASE 1 READY FOR DATABASE VERIFICATION`
`SLICE 3.6B PHASE 1 READY AFTER LISTED FIXES`
`SLICE 3.6B PHASE 1 BLOCKED BY AUDIT FINDING`
`SLICE 3.6B PHASE 1 NOT READY`

Include: Section 1 fact confirmation/correction; Task 1's delivered design and precedence rule; Task 2's exact audit outcome (fixture available or not; structured signal found or not; if found, what it is and how confident the finding is); explicit confirmation that no traffic-aware/Mapbox work and no 3.6A changes entered this diff; tests/builds; local commit hash(es); explicit confirmation that nothing was pushed or deployed.

**Task 1 alone establishes the required-arrival foundation for downstream planning work. Task 2 remains decision input only for any future group-specific capability; it does not control whether later traffic-aware work can proceed against the proven event → source → team → default hierarchy. This prompt does not authorize the traffic-aware build itself.**
