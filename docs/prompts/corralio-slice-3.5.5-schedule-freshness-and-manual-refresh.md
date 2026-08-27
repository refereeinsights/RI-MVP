# Corralio Slice 3.5.5 — Schedule Freshness & Manual Refresh
## Launch-Blocking Reliability Fix, Sequenced Between 3.5 and 3.6

You are working inside the existing TournamentInsights / RefereeInsights / Corralio monorepo.

Slice 3.4 (Schedule Connection Activation) is complete and has passed independent CPO live-browser UAT.

Slice 3.5 (Mobile Experience Hardening) is either in progress or complete when this slice begins — **do not start implementation on this slice until Slice 3.5 has been built. Deployment of this slice's changes happens after Slice 3.5 has been deployed, per founder direction.** Building/testing locally before that point is fine; pushing or deploying is not.

This slice does not add a new Corralio capability in the product sense. It fixes a reliability gap discovered during CPO UAT: connected schedules can go stale for up to ~24–48 hours with no way for a parent to force an update and no indication to the parent that the data might be stale.

**Founder review (2026-08-27): approved as launch-blocking, inserted into the critical path as 3.5 Mobile → 3.5.5 Schedule Freshness → 3.6 Push + Mapbox traffic-aware leave-by → physical-device/final launch UAT → pilot.** Two semantic corrections from that review are folded into this version — see Sections 2, 4, 5, and 11 below, each marked where the correction applies. The three-part shape of the fix (cadence, manual refresh, disclosure) is confirmed correct; do not expand it into webhooks or direct platform APIs — faster polling plus a manual check plus honest disclosure is the full scope of what this slice is meant to solve.

---

# 0. What Was Found, and the Evidence Behind It

During live CPO verification (2026-08-27), a retained test schedule had venue changes applied to several synthetic practice/game fixtures. Those changes were confirmed in the source platform. Corralio's own This Weekend view for the same anonymized fixtures still showed the prior synthetic placeholder locations — the change had not propagated. No household, team, source-host, event-tag, or location identifiers are retained in this prompt.

Root cause, confirmed by reading `apps/corralio/lib/schedules/refresh.ts` and `apps/corralio/vercel.json` directly, not inferred:

- Corralio has exactly one refresh path: a Vercel cron hitting `/api/cron/schedule-refresh`, scheduled `17 11 * * *` — **once per day.**
- `CORRALIO_REFRESH_FRESHNESS_HOURS = 23` — a source is only eligible to be re-claimed if its last refresh attempt was more than 23 hours ago.
- `CORRALIO_REFRESH_BATCH_LIMIT = 10` — each run claims at most 10 sources system-wide.
- There is no manual/on-demand refresh path anywhere in the app (`ConnectedScheduleList.tsx`, `actions.ts`) — confirmed by grep, not assumed.
- No staleness indicator exists anywhere in the UI. A parent has no way to know whether what they're looking at reflects this morning's schedule or last week's.

For comparison, the closest sibling feature in this same monorepo — `ti-web`'s `planner-calendar-refresh` cron, which also polls external calendar feeds for changes — runs every 4 hours (`20 */4 * * *`), not once a day. Corralio's cadence is an outlier relative to existing precedent in this codebase, not a deliberate cost decision that this slice would be overturning.

Why this matters product-wise, not just technically: a coach moving a practice to a different field is one of the most common events in youth sports, and it's exactly the kind of change a parent expects an aggregator like Corralio to have caught. A staleness window measured in days, with no way to force a check and no disclosure that the data might be old, directly undermines the product's core promise ("we've got the weekend figured out") in a way that can cost trust in a single bad afternoon — a parent driving to the wrong field on Corralio's word is a worse failure than any mobile-layout defect in Slice 3.5.

---

# 1. Product Standard

The parent should never be able to get burned by Corralio showing them a location or time that a connected source has since changed, without at least being told the data has an age. Two complementary fixes: shrink the window automatically, and let the parent close the window themselves at the moment it matters (about to leave the house).

Do not solve this by promising real-time accuracy Corralio's ingestion model can't back. GameChanger, TeamSnap, and Stack Team App are generic ICS/webcal pulls (ADR-019) — there is no generic webhook/push channel across these providers for V1. The honest fix is faster polling plus honest disclosure, not a false claim of live sync.

---

# 2. Audit First

Before changing anything, confirm directly against the live repository (do not assume any of the following — verify each):

- The exact column(s) on `corralio_schedule_sources` (or wherever tracked) that record refresh timing, and whether **last attempt** and **last successful refresh** are already tracked as distinct timestamps. **(Founder correction, 2026-08-27):** these must be distinguishable — if today's automatic attempts all failed, the parent-facing signal must be built off the last *successful* refresh, never off "we tried recently," or a string of failures could read to a parent as "we just checked and it's fine." If the schema currently stores only one timestamp, add the missing one (last successful refresh) rather than overloading the existing column's meaning — keep it minimal per Section 9, but this one is load-bearing, not optional polish.
- The exact `claimBatch` implementation backing `CorralioRefreshStore` (likely in `apps/corralio/lib/schedules/refreshSupabaseStore.ts` or similar) — confirm how the 23-hour freshness gate and claim-timeout logic actually work at the query level before changing the constant.
- Whether `corralio_reserve_external_call_v1` / the per-household daily external-call cap (`CORRALIO_DAILY_EXTERNAL_CALL_CAP_PER_HOUSEHOLD`) applies to ICS schedule fetches at all, or only to geocoding/routing calls. (CPO's read of `refresh.ts` found no reference to that reservation system in the schedule-refresh path — confirm this is correct before assuming no cap applies.)
- Any existing rate-limiting or abuse-prevention pattern elsewhere in the app (e.g., on auth actions) that should be reused for the new manual-refresh action, rather than inventing a new pattern.

Report findings before proceeding if anything here contradicts what's described above.

---

# 3. Deliverable A — Raise Automatic Refresh Cadence

Change the refresh cadence from once daily to roughly every 4 hours, matching the `ti-web` `planner-calendar-refresh` precedent:

- Update `apps/corralio/vercel.json`'s cron schedule from `17 11 * * *` to `17 */4 * * *` (preserving the existing `:17` minute offset, now firing 6x/day instead of once).
- Reduce `CORRALIO_REFRESH_FRESHNESS_HOURS` from `23` to a value that leaves a sane buffer under the new interval (23 left a 1-hour buffer under a 24-hour cadence; apply the same logic to a 4-hour cadence rather than picking an arbitrary number — confirm the exact value against how the constant is actually consumed in the audit step above).
- `CORRALIO_REFRESH_BATCH_LIMIT` can likely stay at 10 — six runs/day × 10 gives ~60 sources/day of system-wide capacity, up from 10/day today. Sanity-check this against the current number of connected sources; flag rather than silently change if it looks insufficient or wildly oversized for the current household count.
- Confirm this does not interact badly with `CORRALIO_REFRESH_CLAIM_TIMEOUT_MINUTES` or the failure-threshold logic — re-read `refresh.ts` for any implicit assumption baked around a 24-hour cadence before changing only the two named constants.

---

# 4. Deliverable B — Manual "Refresh Now" Control

Add a household-scoped manual refresh affordance to the connected-schedule management UI (`ConnectedScheduleList.tsx` / `actions.ts`), so a parent about to leave the house can force a check rather than wait for the next automatic cycle.

Requirements:

- **Authorization.** This must be a normal authenticated server action scoped to the calling household's own source — it must NOT reuse `isCorralioCronAuthorized`/`CRON_SECRET`, which is an admin-only, session-less trust boundary by design. A parent must never be able to trigger a refresh of a source that isn't theirs.
- **Reuse the existing pipeline.** The actual fetch/normalize/persist logic already exists in `refresh.ts` and `ingest.ts` — this should call into that, scoped to a single claimed source, not duplicate the ICS fetch/parse logic.
- **Rate limiting.** A parent mashing "Refresh" should not be able to hammer the source ICS host or bypass the freshness gate's intent. Disable/gray out the control for a short cooldown after a manual refresh attempt (a few minutes is reasonable — confirm against whatever rate-limit convention the audit step turns up elsewhere in the app). The cooldown message must reflect what actually happened, not assume success — **(founder correction)** if the attempt succeeded, something like "Checked just now"; if it failed, the cooldown state should say so ("Couldn't refresh — try again shortly") rather than implying a successful check occurred. This is the same last-attempt-vs-last-successful distinction from Section 2/5, applied to the button's own state.
- **Honest feedback.** On success, show the actual result — updated event count if it changed, or "No changes found" if it didn't — and this becomes the new last-successful-refresh timestamp. On failure, use the same source-aware recovery language Slice 3.4 already established for connection failures — not raw fetch/parse errors — and do not advance the last-successful-refresh timestamp; only the last-attempt timestamp moves.
- **Loading state.** Manual refresh will take a few seconds (network fetch + parse + persist) — show a clear in-progress state per the same lightweight loading conventions used elsewhere, not a silent hang.

---

# 5. Deliverable C — Staleness Disclosure

Show the parent how fresh the data actually is, wherever a connected schedule's data is displayed (at minimum the connected-schedule management card; consider This Weekend if it doesn't add clutter — audit the existing layout before deciding where it fits).

**(Founder correction, 2026-08-27) The primary signal must be the last *successful* refresh, not the last attempt.** If today's automatic attempts all failed, "Checked just now" would falsely reassure the parent that the data is current when it isn't — the failures need to surface, not be papered over by attempt recency. Build the two states explicitly:

- **Healthy:** `Updated 2 hours ago` (or "this morning," etc.) — plain language, driven off the last-successful-refresh timestamp from Section 2's audit, not a raw timestamp or ISO string.
- **Failing:** `Couldn't refresh · Last updated yesterday` (or equivalent) — makes both facts visible at once: that recent attempts have not succeeded, and how old the underlying data actually is. Do not silently fall back to only showing one half of this.

Apply the same honesty discipline already established for leave-by ("(est.)") and the Mapbox as-of design in the Slice 3.6 audit: never imply live sync, never hide that the underlying pull is periodic, and never let attempt activity stand in for actual freshness.

---

# 6. Scope Discipline

This slice MAY:

- change the cron schedule and the freshness constant;
- add one new authenticated, rate-limited, household-scoped manual-refresh action and its UI control;
- add a staleness/last-checked display;
- add tests and minor copy needed for the above.

This slice MUST NOT:

- add webhook/push-based ingestion for any platform;
- add direct platform OAuth/APIs (stays within ADR-019);
- implement Slice 3.6 notifications or Mapbox traffic-aware routing;
- change ICS parsing/normalization logic itself;
- change the Slice 3.4 picker, instructions, or connection-success/failure copy beyond what staleness display requires;
- redesign the connected-schedule management UI beyond adding the refresh control and staleness line;
- touch This Weekend's broader layout, conflicts, leave-by, or What Fits logic (that's Slice 3.5's territory, already scoped separately).

---

# 7. Privacy / Security

Unchanged boundaries from prior slices — do not weaken them for this feature:

- Never expose the raw ICS/calendar URL client-side.
- Never expose provider fetch/parse errors verbatim to the parent.
- The manual-refresh action must enforce household ownership server-side on every call, not just hide the button client-side for other households' sources.
- Do not log or expose the schedule URL in any new logging added for rate-limit tracking.

---

# 8. Tests

Add/update deterministic tests for:

- the updated freshness constant and cron-adjacent logic in `refresh.ts` / its store;
- manual-refresh authorization (a household cannot refresh another household's source — this is the single most important test in this slice);
- manual-refresh rate limiting (a second immediate call is rejected/no-ops correctly);
- manual-refresh success and failure UI states;
- staleness display rendering correctly across a healthy recent-success state, an older-but-succeeding state, and a failing state (recent attempts failing while an older successful timestamp is still shown) — confirm the display is driven by last-*successful*-refresh, not last attempt, including the case where every attempt today has failed;
- no regression to the existing admin-only cron authorization path (`isCorralioCronAuthorized` still gates the batch endpoint exactly as before).

---

# 9. Verification

Before declaring completion, run:

- focused affected tests;
- complete Corralio test suite;
- TypeScript;
- zero-warning lint;
- `git diff --check`;
- all four production builds (`corp-app`, `corralio-app`, `referee-app`, `ti-web`).

If no database/schema change is required beyond what's already tracked, do not add one. If a new column (e.g., to support rate-limit tracking) is genuinely necessary, keep it minimal and say why in the notes rather than folding it in silently.

---

# 10. Notes, Commit, and Deploy Sequencing

Update `apps/corralio/notes.md` with: the audit findings from Section 2, the exact cadence/constant values chosen and why, what the manual-refresh authorization/rate-limit design is, where staleness is shown and in what language, tests/builds result, and final verdict.

Commit locally with a focused commit message (or a small number of commits if the three deliverables warrant separating them).

**Do not push. Do not deploy.** Per founder direction, this slice's changes are held until Slice 3.5 has been deployed — this slice completes and commits locally in the meantime, but does not go out ahead of 3.5.

---

# 11. Completion Standard

**(Founder correction, 2026-08-27):** the original framing of this question implicitly promised that a coach's change would definitely show up "within a few hours" — but Corralio does not control how quickly TeamSnap, GameChanger, or Stack Team App update their own exported ICS feed. That upstream timing is outside this product's control and this slice must not claim otherwise, in copy or in how success is reported. The question this slice actually has to answer is narrower, and is the correct one:

> **If a connected calendar feed contains a schedule change, will Corralio detect it within the next bounded refresh window or when the parent manually refreshes — and will the parent understand when Corralio last successfully checked the source?**

That's what this product actually controls: its own polling cadence, a manual override, and honest disclosure of the last successful check. It does not control, and must not imply it controls, how promptly the upstream provider's feed reflects a coach's edit.

A slice that shrinks the cadence but adds no manual control, or adds a manual control but no last-successful-refresh disclosure, has not fully answered that question — all three deliverables are load-bearing, not independently optional.

---

# 12. Final Verdict

Return exactly one:

`SLICE 3.5.5 COMPLETE LOCALLY`
`SLICE 3.5.5 READY AFTER LISTED FIXES`
`SLICE 3.5.5 BLOCKED BY AUDIT FINDING`
`SLICE 3.5.5 NOT READY`

Report: audit findings from Section 2 (including whether last-attempt and last-successful-refresh were already distinct columns or had to be added), the final cadence/constant values and rationale, the manual-refresh authorization/rate-limit design, where and how staleness is disclosed and how the healthy-vs-failing distinction is implemented, tests/builds result, local commit hash(es), and explicit confirmation that nothing was pushed or deployed (this slice waits on Slice 3.5's deployment per founder direction).
