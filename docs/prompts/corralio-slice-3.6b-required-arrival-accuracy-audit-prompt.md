# Corralio Slice 3.6B — Stage 1: Required-Arrival Accuracy & Arbiter Group-Identity Audit

**Audit-and-narrow-build only. Does not authorize Mapbox, traffic-aware leave-by, or any 3.6B notification work — those remain gated on this audit's findings and on 3.6A's own results. Does not modify Slice 3.6A (Weekend Ready Web Push) in any way.**

> **Amendment Log, 2026-08-28 (CPO).** Following the founder's "Planning Intelligence, Arrival, Traffic & Proactive Value" direction (Section 7: the required-arrival hierarchy must be provenance-explainable — Corralio should be able to state whether an arrival requirement came from the event/feed, a group preference, a team preference, a source preference, or the Corralio default), Task 1 below is amended to require the resolved arrival buffer carry an explicit provenance tag alongside its value. This is additive to the design already specified below — it does not change the precedence order, and it does not require solving Task 2's group-identity question to ship. See Section 3 (updated) and Section 7 (test 7, new).

## 0. Why This Exists

Founder direction, 2026-08-28 ("Corralio Planning Intelligence"): Corralio's differentiation is the full loop — know the commitment, know when the family actually needs to arrive, know normal travel time, account for traffic, tell the family when to leave, understand the usable gap, recommend what fits. Notifications matter because they deliver this intelligence at the moment it's useful, not as a re-engagement gimmick. Required-arrival accuracy is foundational to all of it: a traffic-aware "leave by" is only as trustworthy as the arrival time it's built on, and today that arrival time is a single manually-set number per team, not something Corralio derives from what it actually knows about the commitment.

The founder specifically asked whether source/team/group-specific arrival preferences can improve the existing hierarchy, using one officiating parent working football, soccer, and basketball through different Arbiter groups — each with a different real required-arrival time — as the proving case, while being explicit this must generalize to ordinary family sports commitments, not become referee-specific, and must not be solved by fuzzy title-matching.

## 1. Confirmed Starting Facts (verify independently before relying on them)

These were established by direct repository inspection and a check of ArbiterSports' own public help documentation. Repository/live-evidence reality still wins if either turns out stale — re-confirm both before building on them:

* **The existing arrival-buffer hierarchy is team-only.** `arrival_buffer_minutes` lives on `corralio_teams` (nullable, 0–120, 5-minute step, parent-editable in `FamilySection.tsx`), and is read by both `leaveBy.ts` and `whatFits.server.ts`. There is currently no way to set an arrival-time preference on a schedule source, a household-level unassigned source (e.g., Arbiter Officials), or anything below the team. An unassigned source falls back to whatever global default `leaveBy.ts` uses today.
* **ArbiterSports issues one combined calendar feed, not one feed per sport/group.** Per ArbiterSports' own help documentation ("Subscribing to an Arbiter Calendar Feed" and "How To Set Preferences," `arbitersportshelp.zendesk.com`), Calendar Sync produces a single iCal URL per official covering everything they're assigned to and accepted as an official — there is no documented per-sport or per-assigning-group feed option. This rules out "just treat each group as a separate Corralio source" as a shortcut: a referee working three sports through Arbiter will show up as one Corralio schedule source, not three.
* **Whether individual events in that combined feed carry a reliable, structured group/sport identifier is genuinely unknown.** Public ArbiterSports documentation does not describe VEVENT-level field structure (no confirmation either way on `CATEGORIES`, organizer fields, or a consistent naming convention). The only Arbiter fixture in this repository (Slice 3.7) is a zero-event blank calendar and cannot answer this. This is a real evidence gap, not a rhetorical one.

## 2. Two Separate Questions — Do Not Conflate Them

**Question A (generalizes broadly, answerable now):** Can Corralio express an arrival-time preference more granular than "per team," for any family commitment, not just Arbiter? Yes, structurally — nothing blocks adding the same kind of override at the schedule-source level. This helps every unassigned household source (Arbiter Officials today, any future one), and every team whose games happen to need a different buffer than another team's, using the exact pattern already proven in production for `corralio_teams`.

**Question B (Arbiter-specific, blocked on evidence):** Can Corralio automatically tell that *this specific event* inside one combined Arbiter feed belongs to the football group versus the basketball group, so it can apply a different arrival preference *within* a single source? This is the harder, narrower question, and Section 1's findings mean it cannot be answered from documentation or inference — it requires inspecting a real, populated, multi-sport Arbiter Officials feed, which does not exist in this repository today.

Do not let Question B block shipping Question A. They are independently valuable and independently scoped below.

## 3. Task 1 — Source-Level Arrival Preference (buildable now)

Audit first: confirm Section 1's schema/usage claims directly, and confirm whether `corralio_schedule_sources` is the correct home for this or whether the audit finds a better-fitting existing structure. Default toward reusing the existing `corralio_teams.arrival_buffer_minutes` pattern exactly (same nullable-int, 0–120, 5-minute-step validation; same plain, honest UI treatment) rather than designing a new concept — this is a generalization of a proven pattern, not a redesign.

Define and implement a clear precedence order wherever an arrival buffer is resolved for leave-by/What Fits purposes, for example: schedule-source-level override (if set) → team-level override (if set) → existing global default. Household-level unassigned sources (which have no team) become able to carry their own override for the first time — this alone lets an official connecting a single-sport Arbiter Officials feed set one accurate arrival time for it, which is real, immediate value independent of the harder multi-sport case.

Do not build a new preferences UI surface beyond what's needed to set this one value in the same place/style the team-level control already lives (e.g., alongside the existing connected-source management, not a new settings page). Do not touch conflict detection, event schema, or venue matching — this is strictly an input to the existing leave-by/What Fits arrival-time lookup.

**Provenance requirement (added 2026-08-28).** Whatever resolves the effective arrival buffer must also expose *which tier supplied it* — e.g., a `resolvedFrom` value of `source` | `team` | `default` (with `group` and `event` reserved as future tiers pending Task 2's findings, and NOT implemented here). This must be available at minimum to internal logging/debugging now; the audit should separately note whether it is cheap to also surface it to the parent (e.g., a small "why this time" affordance) versus deferring that as its own UI decision. Do not block Task 1 on designing that parent-facing UI — deliver the underlying provenance data first, and report the UI question as an open item rather than resolving it unilaterally.

## 4. Task 2 — Arbiter Group-Identity Audit (report only, do not build against it yet)

Determine whether a real, populated, multi-sport Arbiter Officials calendar feed is available to inspect — ask the founder directly whether they, or anyone in their network, currently officiates multiple sports/groups through ArbiterSports and can provide (or has already provided) a real subscription link or exported feed for audit purposes. Do not proceed on assumption if one isn't available.

If a real multi-sport feed becomes available: inspect actual VEVENT structure across events from different sports/groups within it. Look specifically for any field — `CATEGORIES`, organizer/contact fields, a consistent structured prefix, or any other machine-parseable, non-fuzzy signal — that reliably and deterministically distinguishes which group/sport an event belongs to. A signal only counts if it is structurally guaranteed by the feed format, not a pattern that merely happens to hold in the sample. Report exactly what was found, including if the honest answer is "no reliable structured signal exists in this feed."

**Do not infer group or sport from `SUMMARY`/`DESCRIPTION` text pattern-matching, keyword lists, or any other fuzzy/heuristic method, under any circumstances** — this was the founder's explicit instruction, and Slice 3.7's own `SUMMARY;LANGUAGE=en-us` bug is a concrete reminder that even structured-looking ICS text fields from this vendor have already misled a naive parser once.

If no real multi-sport feed is available and none can reasonably be obtained: report that plainly as the audit outcome. Do not simulate or fabricate a plausible-looking multi-sport fixture to manufacture an answer — a synthetic fixture proves nothing about what ArbiterSports' real feed actually contains.

## 5. Explicit Non-Goals (this Stage 1 audit)

Do not: build any per-event or per-group manual override UI (a bigger, more speculative surface than Task 3's source-level control — do not build it until Task 2's evidence question resolves what's actually achievable); implement Mapbox or any traffic-aware routing; implement any 3.6B notification; modify Slice 3.6A in any way; modify conflict detection, event schema, venue matching, or schedule ingestion beyond the arrival-buffer lookup precedence; add SignUpGenius or any new schedule-source platform; add entitlement/Pro logic on this capability; build anything referee-specific — the source-level control from Task 1 must work identically for a non-Arbiter household source.

## 6. Privacy / Security

Follow existing patterns exactly: the arrival-buffer value is ordinary household-owned, RLS-scoped data, no different in sensitivity from the existing team-level field. Any Arbiter fixture obtained for Task 2's audit must be treated with the same discipline as Slice 3.7's fixtures — no real household/individual-official identity retained in the repository, tests, or this audit's own written output beyond what's already the established pattern for prior ICS audits.

## 7. Tests

Add/update deterministic tests covering at minimum:

1. arrival-buffer resolution precedence (source override → team override → default) for both team-assigned and unassigned sources;
2. an unassigned household source can now carry its own arrival buffer where it previously could not;
3. existing team-level-only behavior is unchanged for any source that has no source-level override set;
4. leave-by and What Fits both consume the new precedence identically — no divergent logic between the two consumers;
5. validation bounds (0–120, 5-minute step) enforced identically to the existing team-level field;
6. RLS: a source-level arrival buffer is scoped and denied cross-household exactly like existing source fields.
7. provenance tag correctness: resolving from a source override reports `source`; resolving from a team override with no source override reports `team`; resolving from neither reports `default`.

Do not add any test that depends on a specific Arbiter group-identity signal being present — Task 2 is a report, not an implemented behavior, unless its own findings justify a separate follow-on slice.

## 8. Verification

Before completion run: focused arrival-buffer tests; all affected deterministic tests; complete Corralio test suite; explicit Corralio TypeScript validation; zero-warning Corralio lint; `git diff --check`; all four production builds (`corp-app`, `corralio-app`, `referee-app`, `ti-web`).

Also verify: no Slice 3.6A behavior changed; no traffic/Mapbox work entered the diff; no conflict-detection or venue-matching behavior changed beyond the arrival-buffer lookup.

Do not push. Do not deploy.

## 9. Notes and Durable Record

Update `apps/corralio/notes.md` with: the confirmed (or corrected) starting facts from Section 1; the source-level arrival-buffer design and precedence rule actually implemented; the Task 2 audit outcome exactly as found — including "no real multi-sport fixture was available" if that is the honest outcome, and what would be needed to resolve it; tests/builds; explicit confirmation that Task 2's finding (whatever it is) does not by itself authorize any group-specific-override build — that remains a distinct future decision; final verdict.

## 10. Commit

Review the complete diff before committing. Commit only files belonging to this audit/source-level-arrival-buffer work. Use a focused local commit message. Do not push. Do not deploy.

## 11. Final Verdict

Return exactly one appropriate terminal verdict:

`SLICE 3.6B STAGE 1 COMPLETE LOCALLY`
`SLICE 3.6B STAGE 1 READY FOR DATABASE VERIFICATION`
`SLICE 3.6B STAGE 1 READY AFTER LISTED FIXES`
`SLICE 3.6B STAGE 1 BLOCKED BY AUDIT FINDING`
`SLICE 3.6B STAGE 1 NOT READY`

Include: Section 1 fact confirmation/correction; Task 1's delivered design and precedence rule; Task 2's exact audit outcome (fixture available or not; structured signal found or not; if found, what it is and how confident the finding is); explicit confirmation that no traffic-aware/Mapbox work and no 3.6A changes entered this diff; tests/builds; local commit hash(es); explicit confirmation that nothing was pushed or deployed.

**This Stage 1's Task 2 outcome is itself the founder/CPO decision input for whether and how Slice 3.6B's traffic-aware leave-by work proceeds against group-specific arrival times, or proceeds only against the team/source-level granularity Task 1 delivers. Do not treat this Stage 1 as authorizing the traffic-aware build itself — that is a separate prompt, written after this one's findings are in.**
