# Corralio Slice 4.2A — Core Usage Measurement

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

Corralio Slices through 4.2 are complete locally. The baseline includes household ownership and RLS, children and teams, connected schedules, assignment and lifecycle controls, the family-oriented `This Weekend` page, and basic temporal conflict detection presented client-side with a 200-row completeness boundary.

Slice 4.2A exists to answer one question with evidence instead of anecdote, ahead of the founder/product gate that follows Slice 4.3:

> **Are activated households (multiple connected schedules) actually using This Weekend, are they exposed to conflict intelligence, and do they come back in a later weekly period?**

This is deliberately not Slice 4.6. Do not build a general analytics platform, an admin dashboard, a vendor integration, or event-stream infrastructure. This slice creates the smallest privacy-safe behavioral record that makes the founder gate measurable, plus one immutable household-level acquisition tag for a small, informal TI Weekend Planner invitation pilot — and nothing else.

Update notes and commit locally as each stage below completes. Do not push, deploy, invoke production cron, or perform any outbound feed DNS/HTTP request at any point.

## 0. Repository prerequisite gate

Before editing, verify repository evidence that Slice 4.2 is complete:

- commit `25a5ba9e` — `feat(corralio): detect family schedule conflicts`;
- repository notes (`apps/corralio/notes.md`) contain `SLICE 4.2 COMPLETE LOCALLY`.

If the baseline is missing or conflicting, stop and report the discrepancy. Do not implement against prompt assumptions alone.

## 1. Audit first — confirm what needs no new code, and confirm how this repo actually applies migrations

Confirm directly against the applied schema (not just application code) that `corralio_households`, `corralio_schedule_sources`, `corralio_children`, and `corralio_teams` already carry `created_at`, and that active-schedule counts, assignment presence, and child/team counts per household are fully derivable from current table state with a read-only query. This has already been audited once; re-confirm it before writing any code, and stop and report if the schema has drifted from that assumption. Also confirm `corralio_households` does not already have any acquisition/provenance/source-tracking column before adding one (Section 4).

**Do not instrument activation events.** No `household_created`, `schedule_connected`, `second_schedule_connected`, or similar event rows. Activation state is a report-time query against existing tables, never a logged event. If you find yourself adding a write for anything answerable by `created_at` or a `count(*)`, stop — that write does not belong in this slice.

**There is no separate local or staging database.** `supabase/migrations/20260818_corralio_household_rls_foundation.sql`'s own header says it was "applied manually to the production Supabase project," and there is no `supabase/config.toml` or local Supabase CLI setup in this repo. Every completed Corralio slice's migration was applied this same way, by a human, to that one project — read at least the last five "complete" or "ready after listed fixes" entries in `apps/corralio/notes.md` and confirm this pattern for yourself before proceeding (look for "applied manually," "the user applied," and "Stage 2 remains explicitly gated on separate approval to apply"). This prompt's Stage 1 / Stage 2 split (Section 10) exists to match that established process exactly, not to invent a new one — do not attempt to install or configure a local Supabase instance, and do not apply either of this slice's migrations yourself under any circumstance; that step belongs to a human operator between Stage 1 and Stage 2, exactly as it has for every prior slice.

Also confirm during audit:

- there is no `loading.tsx` anywhere in `apps/corralio/app`, and `app/page.tsx` remains `export const dynamic = "force-dynamic"`;
- `apps/corralio/app/actions.ts`'s `revalidatePlanner()` calls `revalidatePath("/")` after every family/schedule mutation;
- **every** call site that resolves or creates the owner household — not just `getOwnerContext()` in `apps/corralio/app/actions.ts`, but also `resolveOwnerContext()` in `apps/corralio/lib/schedules/supabaseStore.ts`, which `connectSchedule`, `replaceScheduleLink`, and `connectTeamSchedule` all reach independently of `getOwnerContext()`. An invitee's first mutation in Corralio is expected to be connecting a schedule, which goes through `supabaseStore.ts`, not `getOwnerContext()` — Section 4 requires both paths to carry the acquisition tag, not just one.

These facts inform Sections 4, 6, and 10 below and must be independently verified against the installed Next.js version's actual documented prefetch/revalidation behavior — do not rely on this prompt's characterization alone.

## 2. Storage: new Corralio-owned objects, not shared ones

`ri_analytics_events` (RefereeInsights) and PostHog are both real, working systems in this monorepo, but neither is documented anywhere as shared cross-product infrastructure — `docs/overview/architecture/` predates Corralio entirely and scopes both explicitly to `apps/referee`. Do not write into `ri_analytics_events`, wire in PostHog, or add any third-party analytics vendor. Create new, narrow, Corralio-owned schema objects.

Independently of ownership, this slice answers a structured per-household-per-week question, not an arbitrary event stream — a purpose-built table is the right shape even if `ri_analytics_events` had been available.

## 3. Schema — weekly engagement

Write migration `supabase/migrations/20260824_corralio_slice42a_core_usage_measurement.sql`, prepared but not applied by you (Section 1, Section 10).

```sql
create table public.corralio_weekly_engagement (
  household_id uuid not null
    references public.corralio_households(id) on delete cascade,
  usage_week_start date not null,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  had_conflict boolean null,
  max_conflict_count integer null,
  conflict_check_unavailable boolean not null default false,
  primary key (household_id, usage_week_start),
  constraint corralio_weekly_engagement_conflict_consistency check (
    (had_conflict is null
     and max_conflict_count is null
     and conflict_check_unavailable is true)
    or (had_conflict is false and max_conflict_count = 0)
    or (had_conflict is true and max_conflict_count > 0)
  )
);

alter table public.corralio_weekly_engagement enable row level security;

-- Admin/internal table per supabase/MIGRATIONS_GUIDE.md Section 2B. The RPC in
-- Section 5 is SECURITY DEFINER and writes as its owner (postgres), so it needs
-- no table-level grant of its own; household-cascade delete during fixture
-- cleanup is enforced by the foreign key, not by a role's table privileges. The
-- only real caller is the read-only report in Section 7, run by a human as
-- service_role, so that is the only grant this table needs.
revoke all on table public.corralio_weekly_engagement
  from public, anon, authenticated;

grant select on table public.corralio_weekly_engagement
  to service_role;
```

- `usage_week_start` is a UTC-anchored ISO week start (`(date_trunc('week', timezone('utc', now())))::date`), computed server-side inside the RPC — never client-supplied. This is a deliberate, separate concept from the product's browser-local Friday-through-exclusive-Monday `This Weekend` window. Document this distinction explicitly in code comments and in notes: the analytics period measures longitudinal weekly return; the rendered product boundary is unchanged. Do not let one masquerade as the other, and do not add a second timezone model to the actual product to make them match.
- `had_conflict` / `max_conflict_count` / `conflict_check_unavailable` are tri-state by design, and a single household-week row can legitimately carry **both** a verified conflict outcome and an unavailable flag — a household can be shown a verified check on one view and hit the 200-row boundary on another view the same week. `conflict_check_unavailable = true` does not imply `had_conflict`/`max_conflict_count` are null; it only means at least one view that week could not be verified. Never treat these three fields as mutually exclusive buckets when reading them (Section 7).
- The `corralio_weekly_engagement_conflict_consistency` check constraint above is a defense-in-depth backstop, not the primary validation — Section 5's RPC must independently and more strictly enforce the same semantics (including full non-null requirements, which this constraint alone does not capture) before a row is ever written.
- No `updated_at` trigger needed; the RPC manages `last_viewed_at` itself.
- **Retention:** weekly engagement rows are retained for the life of the household with no separate expiry, archival, or scheduled pruning job. They cascade-delete automatically when the household is deleted, via the `on delete cascade` foreign key above — do not add a second, redundant deletion path. This data is tiny (one row per household per week) and aggregated, so indefinite retention is the right default; record this decision explicitly in notes (Section 15).

## 4. Household acquisition provenance

The founder is personally inviting a small number of existing, authenticated TI Weekend Planner users who have already shown real planning behavior in TI to continue that planning in Corralio. This is an informal invitation, not a migration feature: the invited person signs up and connects a schedule through Corralio's existing, unmodified sign-in and manual schedule-connect UI. The only product surface this slice adds is a single immutable household-level tag recording that origin. Do not build any TI data import, any new authentication flow, or any in-app UI that surfaces this value.

Write migration `supabase/migrations/20260824_corralio_slice42a_acquisition_provenance.sql`, prepared but not applied by you (Section 1, Section 10).

```sql
alter table public.corralio_households
  add column acquisition_provenance text not null default 'direct'
  check (acquisition_provenance in ('direct', 'ti_weekend_planner_opt_in'));

create or replace function public.corralio_households_lock_acquisition_provenance()
returns trigger
language plpgsql
as $function$
begin
  if new.acquisition_provenance is distinct from old.acquisition_provenance then
    raise exception 'acquisition_provenance is immutable' using errcode = '23514';
  end if;
  return new;
end;
$function$;

alter function public.corralio_households_lock_acquisition_provenance()
  owner to postgres;

create trigger corralio_households_lock_acquisition_provenance
  before update on public.corralio_households
  for each row
  execute function public.corralio_households_lock_acquisition_provenance();
```

Keep this household-level, not weekly-event-level — it belongs on `corralio_households`, never on `corralio_weekly_engagement`. Allow exactly one non-default value for now (`ti_weekend_planner_opt_in`); keep the check constraint's list short and explicit rather than building a lookup table. The trigger is a defense-in-depth backstop: the RPC below is the primary enforcement, but no code path — present or future — should be able to change this value once set, even by mistake.

**Changing `corralio_ensure_owner_household`'s signature requires a drop, not a bare `create or replace`.** `create or replace function` only replaces a function whose name **and** argument-type list match exactly; appending a new parameter — even with a default — changes the argument-type list from `(text)` to `(text, text)` and therefore *creates a second, overloaded function* rather than replacing the first. With both `corralio_ensure_owner_household(text)` and `corralio_ensure_owner_household(text, text default null)` present, a call passing only `p_display_name` becomes ambiguous between the two candidates and PostgreSQL/PostgREST will reject it as not-unique. In the same migration:

```sql
drop function public.corralio_ensure_owner_household(text);

create function public.corralio_ensure_owner_household(
  p_display_name text default null,
  p_acquisition_provenance text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_display_name text := nullif(btrim(p_display_name), '');
  v_acquisition_provenance text := case
    when p_acquisition_provenance = 'ti_weekend_planner_opt_in' then p_acquisition_provenance
    else 'direct'
  end;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if v_display_name is not null and length(v_display_name) > 100 then
    raise exception 'Household name is too long' using errcode = '22001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 1129270345)
  );

  select member.household_id
    into v_household_id
  from public.corralio_household_members member
  where member.user_id = v_user_id
    and member.role = 'owner'
    and member.status = 'active'
  limit 1;

  if v_household_id is not null then
    return v_household_id;
  end if;

  insert into public.corralio_households (display_name, acquisition_provenance)
  values (v_display_name, v_acquisition_provenance)
  returning id into v_household_id;

  insert into public.corralio_household_members (household_id, user_id, role, status)
  values (v_household_id, v_user_id, 'owner', 'active');

  return v_household_id;
end;
$function$;

revoke all on function public.corralio_ensure_owner_household(text, text)
  from public, anon, authenticated;
grant execute on function public.corralio_ensure_owner_household(text, text) to authenticated;
grant execute on function public.corralio_ensure_owner_household(text, text) to service_role;
alter function public.corralio_ensure_owner_household(text, text) owner to postgres;
comment on function public.corralio_ensure_owner_household(text, text) is
  'Idempotently creates the authenticated user V1 owner household under an advisory transaction lock.';
```

Note the explicit `case` normalization (`v_acquisition_provenance`) rather than passing a possibly-invalid or possibly-null value straight into the `insert`: `acquisition_provenance` is `not null`, and PostgreSQL does **not** substitute a column's default when a statement explicitly supplies `NULL` for it — only an omitted column or the literal `default` keyword triggers the column default. Passing raw `NULL` through would violate the `not null` constraint, not silently fall back. The `case` expression guarantees a valid non-null value reaches the `insert` in every case.

Use `v_acquisition_provenance` only in this `insert` branch, exactly as `v_display_name` is used only there — never on the idempotent early-return path where a household already exists. Combined with the trigger above, this gives the immutability requirement two independent enforcement points. If any other database object depends on the existing one-argument `corralio_ensure_owner_household(text)` and blocks the `drop`, stop and report the dependency rather than working around it.

**Both existing TypeScript call sites of this RPC must be updated to pass `p_acquisition_provenance`, not just `getOwnerContext()`:**

- `apps/corralio/app/actions.ts`'s `getOwnerContext()`;
- `apps/corralio/lib/schedules/supabaseStore.ts`'s `resolveOwnerContext()`, reached independently by `connectSchedule`, `replaceScheduleLink`, and `connectTeamSchedule` — this is the path an invited planner's first real action (connecting a schedule) is expected to take, and it does not go through `getOwnerContext()` at all. Missing this call site means every invitee whose first mutation is a schedule connection — the pilot's primary expected path — would be permanently recorded as `direct`.

Extract one small, shared, pure helper (e.g. a `resolveAcquisitionProvenanceCookie()` function reading and validating the raw cookie string, returning `'ti_weekend_planner_opt_in' | null`) so the cookie name and validation logic exist in exactly one place, and call it from both `getOwnerContext()` and `resolveOwnerContext()` independently via `next/headers`'s `cookies()`. Do not thread the value through `createSupabaseScheduleStore`'s constructor arguments or otherwise change its three call sites in `actions.ts` — reading the cookie independently at the point of use in both places is simpler and avoids a wider refactor of an established shared factory. Whether `cookies()` is actually readable from `supabaseStore.ts`'s call context (invoked only from within a Server Action's request scope, never at module load) is a real-request-path question — verify it empirically as part of Stage 2 (Section 13), not as a Stage 1 offline check, since exercising that path meaningfully requires a live request, not just a unit test.

Capture the source without any new UI. The invite link will look like `https://<corralio-host>/?src=ti_weekend_planner_opt_in`. In `apps/corralio/middleware.ts`, which already runs on every request before auth resolves: if the incoming request URL's `src` query parameter is exactly `'ti_weekend_planner_opt_in'`, set a cookie named `corralio_acq_src` with that value and these explicit attributes: `httpOnly: true`, `sameSite: "lax"`, `secure: request.nextUrl.protocol === "https:"` (key this to the actual transport, not `NODE_ENV`, so both deployed HTTPS and a locally served production build over plain HTTP behave correctly), `path: "/"`, and `maxAge: 60 * 60 * 24 * 30` (30 days). Any other or missing `src` value: do not set or clear the cookie. Perform this acquisition-cookie handling before the middleware's existing early return for missing Supabase environment configuration so attribution capture itself remains deterministic and the offline middleware tests do not need to configure or contact Supabase.

Do not surface the cookie value client-side or log it anywhere. Do not add TI IDs, planner-session IDs, or any other TI-linking identifier anywhere in this slice.

## 5. Write path — weekly engagement RPC, with an explicit trust boundary

Add one `postgres`-owned, `SECURITY DEFINER` RPC with a locked `search_path`, matching every other Corralio RPC's shape (see `corralio_ensure_owner_household`, `corralio_update_schedule_source_sport_v1`):

`corralio_record_weekly_engagement_v1(p_had_conflict boolean, p_conflict_count integer, p_conflict_check_unavailable boolean)`

- Explicitly `revoke all ... from public, anon, authenticated`, then `grant execute ... to authenticated` and `grant execute ... to service_role` — the same three-statement pattern already used for `corralio_ensure_owner_household`, not just an informal "deny anon." `PUBLIC` must be revoked explicitly; do not rely on it never having been granted.
- Explicitly set the function owner with `alter function public.corralio_record_weekly_engagement_v1(boolean, integer, boolean) owner to postgres;`; do not rely on whichever role happens to execute the migration. The catalog-verification script must assert this ownership.
- Derive the household the same way every other Corralio RPC does: the caller's active owner household from `auth.uid()`. Never accept a caller-supplied household ID. If the caller has no active owner household, return without writing (no error needed — this should be unreachable in practice per Section 6, but must fail safe if it happens).
- After resolving the household, return without writing unless it currently has at least one schedule source whose `sync_status <> 'disconnected'`. `ThisWeekend` only mounts for that same product condition, but the RPC is directly executable by `authenticated`; enforcing the condition again at the database boundary prevents a caller from manufacturing engagement for a zero-schedule household. A source disconnect racing with the client effect may therefore turn that best-effort write into a safe no-op.
- **Validate payload semantics inside the function body before writing anything, and do not let SQL's three-valued `NULL` logic silently bypass any of these checks:**
  1. raise if `p_conflict_check_unavailable` is null — this argument must always be an explicit `true`/`false`, never absent;
  2. if `p_conflict_check_unavailable` is `true`: ignore whatever `p_had_conflict`/`p_conflict_count` were passed, regardless of their values, and do not validate them further;
  3. if `p_conflict_check_unavailable` is `false`: raise if `p_had_conflict` is null; raise if `p_conflict_count` is null or negative; raise if `p_had_conflict` is true and `p_conflict_count` is not greater than zero; raise if `p_had_conflict` is false and `p_conflict_count` is not exactly zero.

  Write each of these as an explicit `is null` / `is not null` check rather than relying on a bare boolean condition — in PL/pgSQL, `if p_had_conflict then ...` and similar conditions are silently treated as false when the operand is null, which is exactly the gap that would let an all-null payload slip past validation and reach the upsert. These raises should never fire from correct caller code (Section 6) — their job is to make a future bug in the caller loud in server logs rather than silently writing an inconsistent or corrupting row, backing the same tri-state contract as the table constraint in Section 3.
- Compute `usage_week_start` server-side as specified in Section 3.
- Upsert on `(household_id, usage_week_start)`:
  - `first_viewed_at`: set only on insert, never overwritten.
  - `last_viewed_at`: set to `now()` on every call.
  - If `p_conflict_check_unavailable` is true: set `conflict_check_unavailable = true` for the row (OR-accumulate — a week where any view hit the boundary stays flagged even if a later view in the same week did not), and leave `had_conflict`/`max_conflict_count` unchanged rather than overwriting them with null.
  - Otherwise: `had_conflict := coalesce(had_conflict, false) OR p_had_conflict` (a week where the household was ever shown a conflict stays true even if a later view that week had none); `max_conflict_count := greatest(coalesce(max_conflict_count, 0), p_conflict_count)`.
- The function body must not accept or log event IDs, titles, locations, child/team names, or source URLs. Its only inputs are two primitives and a boolean derived by the caller from data it is already authorized to see.
- Return void or a simple boolean; do not return the row.

## 6. Call site — client-side, once per real mount, not server render

Do not call this from `app/page.tsx`'s server component. Reusing the pure `buildWeekendPlan` pipeline server-side to compute a conflict count for logging would resolve "this weekend" using the server process's timezone, not the family's actual browser-local timezone the client uses to render — the logged conflict state could then disagree with what the parent actually saw. The client already computes the authoritative, correctly-localized result once per mount.

Put all of this slice's write-path logic — resolving the viewer, deciding there is nothing to do without an active household, calling the RPC, and catching/logging a failure — in **one** small, pure, dependency-injected orchestration function, not split across a helper and the server action. This function must live in a module that does **not** carry a `"use server"` directive and does **not** import from `server-only` — its only imports are the `EngagementPayload`/`EngagementViewer` types (type-only imports, or a generic viewer shape that does not pull in Supabase client code), so that the offline tests in Section 9 can import and exercise it without configuring or contacting any server-side service. Something with this shape:

```ts
type EngagementPayload = {
  hadConflict: boolean | null;
  conflictCount: number | null;
  conflictCheckUnavailable: boolean;
};

type EngagementViewer = NonNullable<Awaited<ReturnType<typeof resolveCorralioViewer>>>;

async function recordWeeklyEngagement(
  deps: {
    resolveViewer: () => Promise<EngagementViewer | null>;
    callRpc: (
      viewer: EngagementViewer & { householdId: string },
      payload: EngagementPayload,
    ) => Promise<{ error: unknown }>;
    log: (message: string) => void;
  },
  payload: EngagementPayload,
): Promise<void> {
  try {
    const viewer = await deps.resolveViewer();
    if (!viewer?.householdId) return;
    const { error } = await deps.callRpc(
      { ...viewer, householdId: viewer.householdId },
      payload,
    );
    if (error) deps.log("corralio: weekly engagement write failed");
  } catch {
    deps.log("corralio: weekly engagement write failed");
  }
}
```

The exported `"use server"` action is then a one-line adapter that supplies the real `resolveViewer`, the real `callRpc` (using the authenticated Supabase client carried by the resolved viewer), and a real `log` (e.g. `console.warn`), and calls `recordWeeklyEngagement`. The real viewer behavior is important: `resolveCorralioViewer()` returns `null` on an authentication error or thrown exception, and returns a non-null viewer with `householdId: null` when an authenticated user has no household or when the membership query fails. It therefore converts every real viewer-resolution failure into one of the orchestrator's silent no-op shapes rather than throwing. Because the orchestrator's catch block can only fire when `resolveViewer` throws or rejects, the logging guarantee in this slice is scoped to **RPC failures only**: viewer-resolution failures are silently treated as no-op (same as a legitimate no-household) and do not produce a log line. The real adapter therefore passes `resolveCorralioViewer` directly as `resolveViewer` — no wrapper is needed — and the catch block fires only when the RPC itself throws or rejects. Do not attempt to distinguish auth/membership failures at this layer; the logging guarantee covers only the RPC call path, and that is sufficient for detecting systemic failures in the write path. It contains no logic of its own to test — every behavior Section 9 requires (no call without a household, exactly one sanitized log line on RPC failure, silence on success and on viewer-resolution non-throws, never throwing into the caller or surfacing UI state) lives in `recordWeeklyEngagement` and is exercised by injecting fakes for all three dependencies. This is what avoids the brittle source-text pattern already present elsewhere in this codebase (`apps/corralio/lib/familySecurity.test.ts` asserts against `actionsSource` with a regex) — do not add another test in that style for this slice.

This is best-effort telemetry, not a product feature: it must never throw into the caller, retry, or surface any UI state, on success or failure. On RPC failure, the single sanitized log line must be a constant, payload-free string — e.g. `"corralio: weekly engagement write failed"` — never the raw error object, error class/code, household ID, user ID, or conflict values. A constant string is preferred over interpolating an error code, because any dynamic value risks leaking context into log aggregators; the failure signal itself (that the write path is broken) is all this log line needs to convey. Do not add a metrics vendor or counter infrastructure for this — a single sanitized log line is sufficient.

In `app/components/ThisWeekend.tsx`, after `plan` is computed (the existing `useMemo` that calls `buildWeekendPlan`), add one `useEffect` guarded by a `useRef` sentinel so it fires exactly once per mount, only once `plan` is non-null, and does not re-fire on unrelated state changes (the directions dialog opening/closing, the copy-address state, etc.). From that effect, call the new server action with exactly one of these two fully-specified payloads — every field must be present in both branches, never partially omitted:

- unavailable: `hadConflict: null`, `conflictCount: null`, `conflictCheckUnavailable: true`, when `plan.conflictStatus === "candidate-limit-reached"`;
- verified: `hadConflict: plan.conflicts.length > 0`, `conflictCount: plan.conflicts.length`, `conflictCheckUnavailable: false`, otherwise.

Note that `ThisWeekend` only mounts when `sourceCount` is truthy in `app/page.tsx` — a household with zero connected schedules renders the existing empty state instead and never reaches this component. No additional activation guard is required beyond that existing conditional.

Next.js prefetch behavior for the installed version should still be checked empirically (hover a nav link without clicking; inspect server logs/network activity), but the thing that actually matters here — and the thing Stage 2 UAT (Section 13) must verify directly — is simpler and more robust than characterizing prefetch internals: **hovering a nav link without clicking must produce zero new or updated rows in `corralio_weekly_engagement`.** Do not word the verification or the report as "confirms no RSC/network prefetch occurs" — the framework may still perform some prefetch fetch under the hood depending on version and configuration; what this slice actually requires is that the client effect, and therefore the write, never fires from it. Report what the empirical check found, but gate correctness on the write outcome, not on an assertion about internal Next.js mechanics.

## 7. Report

Add one read-only SQL script: `scripts/analysis/corralio_weekly_engagement_report.sql`, matching the existing `scripts/analysis/` convention (read-only, run manually against the project by a human, not exposed through the app). It must produce:

**Activation** (existing tables only, no new instrumentation):
- total households;
- households with ≥1 active (non-disconnected) schedule source;
- households with ≥2 active schedule sources;
- households with ≥2 active schedule sources where at least one has a child or team assignment.

Note in the script's own comments that this activation cut reflects **current** schedule-source state, not the household's state during any past week — a household that had two active schedules two weeks ago but has since disconnected one will not appear in today's ≥2-schedule activation cut even though it correctly appeared active that week. The usage/retention figures below therefore describe currently-activated households' recent engagement, not a strict historical cohort; do not present them as the latter.

**Usage:**
- a clearly-labeled current-week pulse count (activated households with a row for the in-progress current `usage_week_start`) — label this explicitly as partial/in-progress, informational only, not to be used for any retention comparison;
- the actual retention metric, computed only from the **two most recently fully completed UTC weeks** — i.e. `date_trunc('week', timezone('utc', now()))::date - interval '7 days'` (the most recently completed week) and that value minus 7 more days (the week before it), never the in-progress current week: activated households present in the more recent of those two completed weeks; activated households present in the earlier of the two; activated households present in **both** — this last figure is the roadmap's primary metric and the one the founder/product gate should read, weekly returning families with multiple connected schedules.

**Conflict exposure**, for the same most-recently-completed UTC week used above, **intersected with the current ≥2-active-schedules activation cohort exactly as the usage figures are** — the product question is about activated households specifically, not every household with any connected schedule (a single-schedule household can still mount `ThisWeekend` and generate a `corralio_weekly_engagement` row, so without this intersection the conflict counts would silently include households outside the cohort this report is about). These are not mutually exclusive buckets — report them as overlapping sets, not a partition:
- activated households with a verified conflict check that week (`had_conflict is not null`), regardless of whether they also had an unavailable view that week;
- activated households with `had_conflict = true` (a subset of the verified group);
- activated households with `conflict_check_unavailable = true` that week, regardless of whether they also had a verified view that week;
- activated households with **both** — a verified outcome and an unavailable view in the same week — reported explicitly so the overlap is visible rather than assumed away.

No dashboard, no admin page, no scheduled email, and no breakout by `acquisition_provenance` in this report — that join is straightforward to add later once the pilot has enough data to be worth looking at, and is out of scope for this slice. This is a script a human runs.

## 8. Explicitly out of scope

Do not add: activation event instrumentation of any kind (Section 1); a shared or new admin dashboard; PostHog, Sentry-as-analytics, or any third-party vendor; writes to `ri_analytics_events`; per-click or per-page event streams; session or device tracking; leave-by, directions-opened, or any other engagement signal (reserved for Slice 4.3 on this same foundation); revenue or monetization metrics; cohort/segmentation infrastructure or reporting beyond Section 7; any TI data import or cross-domain session handoff; any new authentication flow; any in-app UI surfacing `acquisition_provenance`; any change to the rendered `This Weekend` UI, conflict computation, or conflict presentation; a local/staging Supabase environment (Section 1); and any new React component-testing framework or dependency (Section 9). This slice only measures; it does not change what a parent sees.

## 9. Required tests — Stage 1, offline only

Automated, offline tests (no database connection, run as part of the ordinary local test suite) cover extracted, non-database logic only:

- the `recordWeeklyEngagement` orchestrator from Section 6, using fake/injected `resolveViewer`, `callRpc`, and `log`: `callRpc` is invoked with the resolved viewer and exactly the three sanitized payload values and nothing else; a rejected `callRpc` or resolved RPC error produces exactly one `log` call and no throw; a successful call produces no `log` call; a rejected `resolveViewer` also produces exactly one `log` call (via the outer catch) and no throw — note this case is exercised in tests by injecting a throwing fake, but the real `resolveCorralioViewer` does not throw on failure; this test covers the catch path rather than a guarantee about the real resolver; `callRpc` is never invoked when `resolveViewer` returns null or returns an authenticated viewer whose `householdId` is null;
- `resolveAcquisitionProvenanceCookie()` from Section 4: `'ti_weekend_planner_opt_in'` recognized, any other string or absent cookie returns null;
- middleware: `src=ti_weekend_planner_opt_in` sets the cookie with the specified attributes; any other value or a missing param does not set or clear it;
- the existing shared `fetchIcsSchedule` boundary, using injected `lookupHost` and `fetchImpl` fakes: the prescribed `ftp://slice42a.invalid/synthetic.ics` UAT input returns `unsupported_protocol` without calling either fake, proving the first-mutation attribution check cannot perform DNS or HTTP access;
- regression coverage for existing `This Weekend`, conflict, family, lifecycle, connection/replacement, and refresh/recovery suites — confirm nothing in this slice touches their behavior.

**Do not write a parallel TypeScript reimplementation of the SQL `usage_week_start` truncation, accumulate-merge, or validation logic solely to claim offline coverage of it.** That logic lives in and is owned by the RPC; a hand-ported TypeScript copy would drift from the real implementation over time and prove nothing about the actual function. Its correctness is established by the Stage 2 SQL verification scripts in Section 11, against the applied schema — not by an automated offline test.

**Do not add a React component-testing framework (e.g. React Testing Library, jsdom-based mount tests) solely to unit-test the `ThisWeekend` mount effect.** If the repository does not already have one in routine use, that firing behavior — fires exactly once per mount, does not re-fire on unrelated state changes, does not fire on hover/prefetch — is required to be verified through the mandatory browser/DB UAT in Section 13 instead, and the report must say explicitly that it was verified that way rather than by an automated component test.

Also run TypeScript, lint, the production build, and `git diff --check` as part of Stage 1.

## 10. Two-phase completion — do not skip Stage 2, and do not attempt it yourself

This slice has two stages, matching this repository's established Corralio practice (Section 1), and only the second one can produce a `COMPLETE LOCALLY` verdict:

- **Stage 1 (implement and validate offline — you do all of this):** write both migrations, the RPC/trigger changes, the middleware/cookie/helper/action/effect code, the report script, the read-only catalog-verification script and rollback-only behavioral-verification script (Section 11), and the offline tests from Section 9; run them along with TypeScript, lint, and the production build. Commit this work locally. This stage can be fully correct and still not be "done" — none of it proves the migrations actually apply cleanly against the real schema, that the constraints and triggers behave as designed, or that the effect fires (and doesn't fire) exactly when Section 6 requires.
- **Human action between stages (not yours to perform):** a human operator applies both migrations to the Corralio production Supabase project — the same project, the same manual process, used for every prior slice. Stop here and report Stage 1 complete, naming exactly what needs to be applied and in what order (weekly-engagement migration, then acquisition-provenance migration, since the latter's `drop function` should follow the former only if there is any ordering dependency you find during implementation — state explicitly whether one exists).
- **Stage 2 (verify for real, after the human confirms application):** run the rollback-only behavioral-verification script against the now-applied schema, then the disposable-fixture UAT in Section 13, and report the actual results.

If you reach a stopping point after Stage 1 only, the correct verdict is `SLICE 4.2A NOT READY` (or, if the remaining work is narrowly scoped and known, `SLICE 4.2A READY AFTER LISTED FIXES` naming exactly what Stage 2 work remains) — never `SLICE 4.2A COMPLETE LOCALLY`. Offline tests passing is necessary but not sufficient for completion, and applying either migration yourself is out of scope regardless of how confident you are that Stage 1 is correct.

## 11. Verification scripts (Stage 1 — write now; Stage 2 — run against the applied schema)

Write, but do not run against a live database until Stage 2:

- a read-only catalog-verification script confirming both migrations landed as specified: the table, its check constraint, its RLS/grant state; the `corralio_households` column and its check constraint; the lock trigger (`corralio_households_lock_acquisition_provenance`) existence and its trigger function's `postgres` ownership; the weekly-engagement RPC's ownership, `SECURITY DEFINER`, locked search path, and grants; and `corralio_ensure_owner_household`'s new two-argument signature, ownership, `SECURITY DEFINER`, locked search path, and grants — matching the existing catalog-verification convention used by every prior slice;
- a rollback-only behavioral-verification script, run inside a transaction that ends in `ROLLBACK` (matching the exact pattern already used for this repo's prior slices — e.g. the corrected Slice 3.3 verification, which "reached ROLLBACK" after asserting synthetic claims stayed isolated from real production rows), exercising: the RPC's Section 5 validation branches (each raise condition actually raises); the zero-active-schedule safe no-op; the accumulate-merge semantics, including a same-week mixed verified-and-unavailable case; the acquisition-provenance insert-only behavior and the trigger rejecting a direct `UPDATE`; and that none of this touches any pre-existing production household, source, or event row.

## 12. Authorized disposable UAT

This prompt authorizes creating and cleaning up two disposable synthetic Corralio Auth identities plus their household/membership fixtures, scoped narrowly to this slice, against the same production project every prior slice's UAT has used (Section 1, Section 10) — never a separate database. Do not reuse, modify, or delete the established smoke authentication identity.

Create the two disposable identities through the approved service-role Supabase Auth admin boundary (`auth.admin.createUser`) with unique synthetic email addresses reserved for this UAT, generated high-entropy passwords, and `email_confirm: true`; do not send magic links or other email. Use one controlled UAT harness with `try/finally`: keep passwords and synthetic email addresses in process memory only, and immediately append each successfully created Auth user ID (but no credential or email) to a mode-`0600` cleanup ledger under `/tmp` so an interrupted run can still target only the exact disposable identities. **The harness must suppress the raw `createUser` API response** — extract only the user ID (to write to the cleanup ledger) and discard the rest of the response object immediately; do not log or print the response, because it contains the synthetic email address and other identity fields. Never place credentials, email addresses, or Auth IDs in the repository, notes, command output, screenshots, browser logs, or final report. If the Auth admin boundary is unavailable or the exact synthetic identities cannot be created safely, stop Stage 2 and report the blocker rather than substituting a real user or sending email.

Use two identities because a single identity's household is created once and `acquisition_provenance` becomes immutable at that moment — one identity cannot prove both paths:

- **Identity A (direct path):** in a fresh browser context that has never carried the `corralio_acq_src` cookie, sign in with the synthetic password and let the first mutation create the household. Confirm `acquisition_provenance = 'direct'`.
- **Identity B (invited path):** in a separate fresh browser context — the cookie is deliberately valid for 30 days, so reusing Identity A's context or any context that previously visited `/?src=ti_weekend_planner_opt_in` would contaminate the result — visit `/?src=ti_weekend_planner_opt_in` first, sign in with the synthetic password, and let the first mutation create the household. Confirm `acquisition_provenance = 'ti_weekend_planner_opt_in'`.

Exercise each identity's first household-creating mutation through the real `connectSchedule` → `supabaseStore.ts` → `resolveOwnerContext()` path without performing DNS or HTTP access: submit the syntactically valid but unsupported-protocol URL `ftp://slice42a.invalid/synthetic.ics`. Owner resolution occurs before schedule URL validation in the existing ingestion pipeline; `fetchIcsSchedule` rejects `ftp:` locally as `unsupported_protocol` before hostname lookup or `fetch`. The focused Stage 1 fake-dependency test proves neither boundary can be called for this input; during UAT, also confirm there is no outbound HTTP request. The resulting user-safe connection error is expected and is not a failed HTTP request or UAT failure. Then insert the actual `.invalid` fixture sources/events only through the controlled database boundary. Do not use an `http:` or `https:` `.invalid` URL for this first-mutation check, because that would still attempt hostname resolution.

Produce at least one real conflict and one candidate-limit-reached case across these fixtures if practical, or document a reason the 200-row boundary case cannot be exercised without disproportionate fixture size. All retained fixture source URLs must use inert `.invalid` hosts and must never pass through the ingestion or refresh pipeline.

Cleanup is part of the authorization and part of the pass/fail result: first delete only the two recorded disposable households through the approved service-role boundary and confirm zero remaining household, membership, child, team, source, event, and weekly-engagement rows for their exact IDs; then delete only the two recorded disposable Auth users through `auth.admin.deleteUser`; finally, independently confirm both exact Auth IDs are absent and the established smoke identity is still present and unchanged. Remove the temporary ID-only cleanup ledger after those checks. If exact-ID cleanup or independent zero-row confirmation fails, the slice cannot receive a complete verdict.

## 13. Browser verification (Stage 2 — mandatory for completion)

Using the disposable fixtures, against the applied migrations:

- confirm a real navigation to `/` (not a hover/prefetch) produces exactly one row in `corralio_weekly_engagement` for the fixture household at the current `usage_week_start`, with `first_viewed_at` set;
- confirm a second real navigation the same week updates `last_viewed_at` without changing `first_viewed_at` or duplicating the row;
- confirm the conflict fields match what Section 5's accumulation rule predicts for the fixture's conflict state, including a mixed-week case if the fixture can produce one (a verified view followed by a candidate-limit-reached view, or vice versa) — confirm the row ends up with both a non-null conflict outcome and `conflict_check_unavailable = true`;
- confirm hovering a nav link to `/` without clicking produces **zero** new or updated rows (Section 6) — report what was empirically observed about prefetch, but the pass/fail condition is the row count, not a claim about RSC internals;
- confirm Identity A's **first household-creating mutation** (the prescribed unsupported-protocol schedule-connection attempt — do not assume creation happens at sign-in/authentication alone; `resolveCorralioViewer()` only reads existing membership and creates nothing) results in `acquisition_provenance = 'direct'`, Identity B's equivalent first mutation after visiting the `?src=` link results in `'ti_weekend_planner_opt_in'`, the expected user-safe connection error occurs with no outbound request (backed by Section 9's injected-boundary proof that neither DNS lookup nor fetch is reachable for this input), and a direct `UPDATE` attempt against either fixture household's `acquisition_provenance` is rejected by the trigger;
- confirm the invitee's first mutation is correctly attributed specifically via `resolveOwnerContext()` in `supabaseStore.ts` (schedule connection), not only via `getOwnerContext()` — this is the path Section 4 flags as previously missed, and confirms empirically that `cookies()` is in fact readable from `supabaseStore.ts`'s call context (Section 4) — report what was found if it is not;
- confirm no unexpected console error, page error, or failed request occurs, and that the rendered `This Weekend` page is visually and functionally unchanged from Slice 4.2;
- after browser checks, perform the exact household/Auth cleanup and independent absence checks from Section 12, including preservation of the established smoke identity.

## 14. Automated verification

Stage 1: focused tests for the new orchestrator/action/helpers and the network-free unsupported-protocol boundary (Section 9) — not the mount effect itself, which Section 9 explicitly defers to Stage 2 UAT — plus the full existing Corralio suite, TypeScript, lint, production build, and `git diff --check`, all offline. Stage 2: the SQL verification scripts from Section 11 and the browser UAT from Section 13, against the applied production schema, run manually and reported separately from Stage 1's results. Do not perform any outbound feed DNS/HTTP request or invoke production cron at any point.

## 15. Notes

Update `apps/corralio/notes.md` and `docs/notes.md` at both stages. Record: the activation-derivation decision and why no activation events were added; the ownership decision on `ri_analytics_events`/PostHog and why; the exact accumulation and validation semantics, including the mixed verified-and-unavailable case, the full non-null requirements, and the zero-active-schedule safe no-op; the UTC-week-vs-browser-local-weekend distinction; the retention decision (indefinite, cascade-delete only, no pruning job); the acquisition-provenance mechanism (column, trigger, RPC drop/recreate, both call sites, middleware cookie) and its immutability guarantees; the non-blocking-but-logged write-failure handling; what the prefetch/`revalidatePath` empirical checks actually found, worded as a row-count outcome rather than an RSC-internals claim; the two-disposable-Auth-identity fixture design, network-free unsupported-protocol first-mutation check, exact household/Auth cleanup, independent zero-row/identity confirmation, and preservation of the established smoke identity; checks actually run, explicitly distinguishing Stage 1 (offline, committed immediately) from the human-application step from Stage 2 (applied + UAT, committed or amended after); and the explicit Slice 4.3 deferral (leave-by/directions signals land on this same foundation next, not in this slice). Do not record credentials, synthetic Auth IDs or email addresses, real household data, event details, source URLs, or any invitee-identifying information.

## 16. Commit and final report

After Stage 1: inspect the complete diff, preserve unrelated worktree changes, stage only Slice 4.2A files — **including this prompt file itself** (`docs/prompts/corralio-slice-4.2a-core-usage-measurement.md`) — and commit locally without pushing, then stop and report exactly what needs manual production application before Stage 2 can run. Suggested Stage 1 commit:

```text
feat(corralio): add core weekly usage measurement and acquisition provenance (stage 1)
```

After a human confirms both migrations are applied and you complete Stage 2, commit any fixes found and update notes with the Stage 2 results.

Report: prerequisites; audit findings, including the empirical prefetch/revalidation verification worded as a row-count outcome and the confirmation of both `corralio_ensure_owner_household` call sites; storage decision rationale; exact schema/RPC/accumulation/validation behavior for both the weekly-engagement and acquisition-provenance objects, including the `drop function` rationale; call-site placement and why; the non-blocking-but-logged failure handling; report script contents; the two-identity UAT fixture design and cleanup; checks actually run, clearly separated by stage; explicit deferrals; and exactly one verdict:

- `SLICE 4.2A COMPLETE LOCALLY` (only if Stage 2 — human-applied migrations plus the Section 13 browser/DB UAT and Section 11 rollback-only verification — actually ran)
- `SLICE 4.2A READY AFTER LISTED FIXES`
- `SLICE 4.2A NOT READY`

## Final restrictions

- Verify prerequisites first, including independently confirming this repo's actual migration-application process (Section 1) before relying on this prompt's description of it.
- Derive activation from existing table state; do not instrument it.
- Do not write to `ri_analytics_events`, PostHog, or any third-party vendor.
- Keep the analytics week separate from the product's browser-local weekend boundary; do not add a second timezone model to the rendered product.
- Never record `false`/`0` for an unverifiable conflict check — use null plus the unavailable flag, and remember a household-week can be both verified and unavailable at once.
- Fire the write from the client, once per real mount, never from server render.
- The RPC must also require at least one currently active schedule source; a zero-schedule household is always a safe no-op even if an authenticated caller invokes the RPC directly.
- Revoke `PUBLIC`, `anon`, and (for the table) all row access explicitly; validate every payload field's non-null-ness and semantic consistency inside the RPC, using explicit `is null`/`is not null` checks, and back that with a table constraint.
- Changing `corralio_ensure_owner_household`'s argument list requires `drop function` before `create` — never rely on `create or replace` alone to change a function's signature, and never insert a literal `NULL` into a `not null` column expecting the column default to apply.
- Update **both** `corralio_ensure_owner_household` call sites (`getOwnerContext()` and `supabaseStore.ts`'s `resolveOwnerContext()`) to pass the acquisition-provenance cookie value — missing either one breaks attribution for a real invitee path.
- `acquisition_provenance` is household-level, set only at first creation (which may be the first schedule connection, not sign-in), immutable afterward (RPC-enforced and trigger-enforced), and carries no TI IDs, planner-session IDs, or other TI-linking data.
- Weekly engagement rows are retained for the life of the household with no separate pruning job.
- Write failures stay non-blocking to the user but must emit one sanitized, payload-free server-side log line — not silent, not a new vendor.
- Stage 2 may create only the two explicitly authorized disposable Auth identities through the admin boundary; it must send no email, expose no credentials, delete both exact households and Auth identities afterward, independently confirm their absence, and preserve the established smoke identity.
- Do not add a React component-testing framework for the mount-effect behavior; verify it through mandatory Stage 2 browser/DB UAT instead. Do not hand-port SQL merge/validation logic into TypeScript solely to claim offline test coverage of it.
- Empirically verify prefetch behavior, but gate correctness on zero rows written, not on an internal-mechanics claim.
- There is no local/dev database; do not create one. Stage 1 (offline implementation and tests) alone is never sufficient for a `COMPLETE LOCALLY` verdict, and applying either migration is a human's job, never yours — Stage 2 (human-applied migrations plus real browser/DB UAT and rollback-only SQL verification) is mandatory and happens only after that human step.
- Commit this prompt file itself alongside the slice's code and migrations.
- No child/team/event/location/source-URL data reaches the new tables under any circumstance.
- No dashboard, vendor, or full Slice 4.6 scope.
- Do not perform outbound feed DNS/HTTP requests, invoke production cron, push, or deploy. The prescribed unsupported-protocol first-mutation check must reject locally before either network boundary.
- Stop after Slice 4.2A.
