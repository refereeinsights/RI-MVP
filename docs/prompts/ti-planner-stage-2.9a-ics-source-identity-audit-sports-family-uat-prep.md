# TournamentInsights Planner — Stage 2.9A (Docs-First): ICS Source Identity Audit + Sports Family UAT Prep (Repo-Validated)

You are working inside the existing `RI-MVP` monorepo at:
- `/Users/roddavis/RI_MVP/RI-MVP`

This stage is intentionally **docs-first** and **low-risk**.

## Stage context (already implemented; must not regress)

- Stage 2.3 ICS refresh behavior
- Stage 2.4A–2.4F duplicates/merge/suppression/cleanup flows
- Stage 2.5 bounded pagination + honest loaded-scope disclosures
- Stage 2.6A timezone-correct manual events + pickers + smart end defaults
- Stage 2.6B conflict highlighting (loaded-scope aware)
- Stage 2.6C schedule-first UX
- Stage 2.6D Season calendar view + source colors (Weekend Pro gated)
- Stage 2.6E entitlement alignment (exact tier strings)
- Stage 2.7 UAT hardening + typed analytics
- Stage 2.8 UAT polish + launch readiness

## Hard constraints (non-negotiable)

- **Do not implement runtime code changes in Stage 2.9A.** This stage is **audit + documentation + UAT scaffolding only**.
  - If you discover a real bug that needs a fix, write it up as a **Stage 2.9A-FIX follow-up** with exact file references and a minimal patch plan, but do not change code.
- Do not require live external platform feeds to complete this stage.
- Do not add OAuth, scraping, credential storage, or native platform APIs.
- Do not change DB schema.
- Do not change entitlement tiers. Use exact strings only: `explorer`, `insider`, `weekend_pro`.
- Do not hard-gate `/weekend-planner`.
- Do not introduce unbounded event queries or unbounded recurrence expansion.
- Do not push.

## Goal

Prepare Weekend Planner for **Stage 2.9B real-platform ICS UAT** by:

1) Auditing and documenting the **current** ICS import/refresh + identity behavior.
2) Auditing and documenting what user “overlay context” survives refresh today.
3) Creating a **Sports Family** UAT structure + compatibility matrix shell so 2.9B results can be captured cleanly and consistently.
4) Ensuring UAT docs do not overclaim platform support.

This stage must not pretend future-state behavior exists.

---

## Canonical repo-validated paths (start here; do not guess filenames)

ICS source APIs:
- Import: `apps/ti-web/app/api/planner/sources/import-ics/route.ts`
- List sources: `apps/ti-web/app/api/planner/sources/route.ts`
- Refresh: `apps/ti-web/app/api/planner/sources/[id]/refresh/route.ts`

ICS import/refresh implementation:
- Core implementation: `apps/ti-web/lib/planner/ics-import.ts`
- Fixtures/tests (for understanding only): `apps/ti-web/lib/planner/__fixtures__`, `apps/ti-web/lib/planner/ics-import.test.ts`

Planner event read path (for any “source-typed” behaviors):
- `apps/ti-web/app/api/planner/events/route.ts`

Docs to update:
- `docs/weekend-planner-current-state.md`
- `docs/qa/ti-planner-ics-uat.md`
- `docs/weekend-planner-uat.md`
- `CLAUDE.md` (primary UAT runner)

Prompt archival:
- Add this stage prompt under `docs/prompts/`.

---

## Deliverables (docs-only)

### A) “What exists today” audit (truthful, explicit)

Create/update documentation that answers:

1. Where are calendar sources stored (table names, key columns as inferred from code)?
2. How are feed URLs handled (validation, blocked-host logic, redirect handling, privacy rules)?
3. Where does parsing happen and what library is used?
4. What is the identity strategy used on refresh today (exact keys/conditions used)?
   - What happens for:
     - same source + same UID
     - same source + different UID
     - different source + same UID
     - missing UID
     - recurring (`RRULE`, `RECURRENCE-ID`, `EXDATE`) if encountered
5. What “overlay preservation” exists today (notes, venue link, suppressions, merge state, keep-separate dismissals, etc.)?
6. How are removed/canceled events handled today?
   - `STATUS:CANCELLED` / `METHOD:CANCEL`
   - missing-from-feed on refresh
7. What metadata is parsed and/or used today (`DTSTAMP`, `LAST-MODIFIED`, `SEQUENCE`, hashes, etc.)?

Each item must be labeled as one of:
- **Implemented today**
- **Partially implemented / needs verification**
- **Not implemented**

### B) Stage 2.9B compatibility matrix shell

Update `docs/qa/ti-planner-ics-uat.md` to include a matrix template with rows for:

**Source platforms**
- GameChanger
- TeamSnap
- SportsEngine / MySE
- Sports Connect / Blue Sombrero
- PlayMetrics
- LeagueApps
- Spond or Heja

**Calendar relays/clients**
- Google Calendar
- Apple Calendar
- Outlook
- generic ICS/webcal feeds

Columns (initially “Not yet tested” everywhere):
- Platform
- Sports Family alias (team/account)
- Subscription URL available? (yes/no/unknown)
- Feed type (webcal/https/other/unknown)
- Requires login cookies? (yes/no/unknown)
- UID stability (unknown)
- `SEQUENCE` present? (unknown)
- `LAST-MODIFIED` present? (unknown)
- `DTSTAMP` present? (unknown)
- Cancel semantics observed (unknown)
- Missing/deleted semantics observed (unknown)
- Recurrence behavior observed (unknown)
- Location quality (unknown)
- Notes/description quality (unknown)
- Baseline import result (unknown)
- Update result (unknown)
- Cancel/delete result (unknown)
- Overlay preservation result (unknown)
- Known quirks (blank)
- Recommendation (not yet tested)

### C) Sports Family UAT checklist (for 2.9B)

Update `docs/weekend-planner-uat.md` and add a brief link/summary in `CLAUDE.md`.

Include:
- Naming/PII-safe conventions (TI Test…, TI Feed Test…)
- Account aliasing guidance (Gmail plus-addressing)
- Standard event pattern (Practice A / Game B / Event C cancel)
- Steps to capture baseline → move/update → cancel/remove → refresh → verify overlay preservation
- Explicit reminders:
  - No OAuth / no credentials / no scraping
  - Do not overclaim support before results are captured
  - Do not hard-delete source-linked events

### D) Current-state doc update (what 2.9A adds)

Update `docs/weekend-planner-current-state.md`:
- “Stage 2.9A status: docs-only audit complete”
- Link to the compatibility matrix location
- Call out known limitations discovered by the audit (no speculation)
- Clearly define:
  - 2.9A = audit/docs/scaffolding
  - 2.9B = real platform feed testing
  - 2.9C = hardening changes based on 2.9B findings

---

## Quality bar (what “done” means)

Stage 2.9A is complete when:
- The repo’s actual ICS identity strategy is documented with code references (no guessing).
- Refresh overlay preservation behavior is documented (exactly what is and isn’t preserved).
- Cancel/missing/removed behavior is documented (even if it’s “not handled”).
- Recurrence handling is documented (even if “unsupported / limited”).
- A Sports Family checklist exists and is PII-safe.
- A compatibility matrix shell exists with “Not yet tested” defaults.
- Docs do not overclaim “sync”, “real-time”, or “integration” beyond pull-based ICS refresh.

---

## If you find a bug that should be fixed

Do not implement it in 2.9A. Instead, add a short “Stage 2.9A-FIX follow-up” section listing:
- Symptom
- Risk (why it matters for 2.9B)
- Minimal fix approach
- Exact files involved (from the repo paths above)

---

## Validation

Docs-only stage:
- No builds/tests required (you must not touch runtime code).

