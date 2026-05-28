# TournamentInsights Planner — Stage 2.4A Discovery Report
Cross-Calendar Duplicate Detection + Manual Merge (Recommended)

Date: 2026-05-28  
Scope: discovery/planning only (no implementation)

## 1) Summary recommendation

- Implement cross-calendar merge as **manual-only** with “Merge (Recommended)” suggestions for high-confidence matches.
- Add a **refresh-proof suppression model** keyed on **source identity** (at least `source_id + source_event_uid`) because refresh can recreate source-linked rows after user deletion.
- Do duplicate candidate detection **client-side first** (range-bounded, ≤200 events already fetched) using existing event + sources data the planner already loads; optionally evolve to a server helper later.
- Merge should create a **new manual canonical event**, then suppress source-linked duplicates (never delete source events), and ensure refresh + event list filtering do not re-surface suppressed rows.

## 2) Files/routes/tables discovered

**DB migrations / schema**
- `supabase/migrations/20260526_ti_planner_stage1.sql`
- `supabase/migrations/20260526_ti_planner_stage1_stage2_ready.sql`
- `supabase/migrations/20260526_ti_planner_stage2_ics_unique_uid.sql`
- `supabase/migrations/20260526_ti_planner_stage2_sources_unique_url.sql`
- `supabase/migrations/20260528_ti_planner_stage2_sources_unique_url_full.sql`

**Shared planner UI**
- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
- `apps/ti-web/app/_components/planner/Planner.module.css`
- Canonical entrypoint: `apps/ti-web/app/weekend-planner/page.tsx` (renders `PlannerClient`)
- Compatibility redirect: `apps/ti-web/app/planner/page.tsx` (redirect-only)

**Planner APIs (Next.js App Router route handlers)**
- `apps/ti-web/app/api/planner/events/route.ts` (GET ranged events, POST create)
- `apps/ti-web/app/api/planner/events/[id]/route.ts` (PATCH update, DELETE)
- `apps/ti-web/app/api/planner/events/[id]/duplicate/route.ts` (POST duplicate manual-only)
- `apps/ti-web/app/api/planner/sources/import-ics/route.ts` (POST import)
- `apps/ti-web/app/api/planner/sources/[id]/refresh/route.ts` (POST refresh)
- `apps/ti-web/app/api/planner/sources/route.ts` (GET sources list)

**ICS import/refresh library**
- `apps/ti-web/lib/planner/ics-import.ts`
- Types: `apps/ti-web/lib/planner/types.ts`
- Fixtures: `apps/ti-web/lib/planner/__fixtures__/`

**UAT docs**
- Primary production-safe framework: `docs/weekend-planner-uat.md`
- ICS checklist (Stage 2): `docs/qa/ti-planner-ics-uat.md`

## 3) Current planner event model

Table: `public.planner_events` (Stage 1)
- Migration: `supabase/migrations/20260526_ti_planner_stage1.sql`
- PK: `id uuid primary key default gen_random_uuid()`
- Ownership: `user_id uuid not null references auth.users(id) on delete cascade`
- Key fields:
  - `title text not null`
  - `event_type text not null default 'game'`
  - `team_name text`, `opponent_name text`
  - `tournament_id uuid null references public.tournaments(id)`
  - `venue_id uuid null references public.venues(id)`
  - `field_label text`
  - `address_text text`, `city text`, `state text`
  - `starts_at timestamptz not null`, `ends_at timestamptz`
  - `timezone text`
  - `notes text`
  - `source_type text not null default 'manual'`
  - `source_id uuid null` (links to `planner_event_sources.id` for ICS)
  - `source_event_uid text` (added Stage 1→2 readiness)
- Indexes:
  - `planner_events_user_id_starts_at_idx (user_id, starts_at)`
  - `planner_events_weekend_id_idx (weekend_id)`
  - `planner_events_venue_id_idx (venue_id)`
  - `planner_events_source_uid_idx (user_id, source_id, source_event_uid)` (Stage 2 readiness)
  - Unique: `planner_events_source_uid_unique_idx (user_id, source_id, source_event_uid) WHERE source_event_uid IS NOT NULL` (Stage 2)
- RLS:
  - select/insert/update/delete policies scoped to `auth.uid() = user_id` (Stage 1 migration).

TypeScript types:
- `apps/ti-web/lib/planner/types.ts`
  - `PlannerEventRow` mirrors columns including `source_type`, `source_id`, optional `source_event_uid`.

## 4) Current calendar source model

Table: `public.planner_event_sources` (Stage 1)
- Migration: `supabase/migrations/20260526_ti_planner_stage1.sql`
- PK: `id uuid primary key default gen_random_uuid()`
- Ownership: `user_id uuid not null references auth.users(id) on delete cascade`
- Key fields:
  - `source_type text not null` (ICS uses `'ics'`)
  - `source_name text`, `team_name text`
  - `source_url text` (stored but not returned by `GET /api/planner/sources`)
  - reliability fields: `last_synced_at`, `sync_status`, `sync_error`
- Indexes:
  - `planner_event_sources_user_id_idx (user_id)`
  - Unique indexes for ICS sources per user/url:
    - `planner_event_sources_unique_url_idx (user_id, source_type, source_url)` (Stage 2)
    - `planner_event_sources_unique_url_full_idx (user_id, source_type, source_url)` (Stage 2 fix for Supabase upsert `ON CONFLICT`)
- RLS:
  - select/insert/update/delete policies scoped to `auth.uid() = user_id` (Stage 1 migration).

UI source type in PlannerClient:
- `PlannerSourceRow` defined in `apps/ti-web/app/_components/planner/PlannerClient.tsx` includes:
  - `id, source_type, source_name, team_name, last_synced_at, sync_status, sync_error, created_at`

## 5) Current refresh/upsert flow

Import API:
- `POST /api/planner/sources/import-ics` → `apps/ti-web/app/api/planner/sources/import-ics/route.ts`
- Calls `importIcsToPlanner({ mode: "import" })`.

Refresh API:
- `POST /api/planner/sources/[id]/refresh` → `apps/ti-web/app/api/planner/sources/[id]/refresh/route.ts`
- Calls `refreshIcsSource({ userId, sourceId })`.

Core library functions:
- `importIcsToPlanner` and `refreshIcsSource` in `apps/ti-web/lib/planner/ics-import.ts`
- Identity:
  - Within a given source (`source_id`), events are deduped by `source_event_uid`.
  - Refresh does **not** delete missing feed events.
  - Refresh updates **source-managed** fields only (preserves protected user fields like `venue_id`, `field_label` if already set, non-empty `notes`, etc.).

Stage 2.3 behaviors (already implemented):
- Refresh response includes:
  - `imported`, `updated`, `skipped`, `changed`, optional capped `changedEvents`
- `changed` is computed by comparing source-managed fields (title/time/location/team/timezone).
- On refresh failure:
  - `sync_status = 'error'`, `sync_error` is user-safe
  - `last_synced_at` is NOT updated (so stale detection remains meaningful)

**Critical discovery outcome for Stage 2.4 suppression**
- Refresh can **recreate** a source-linked event row:
  - `importIcsToPlanner` loads existing UIDs from `planner_events` for that `source_id`.
  - If a user deletes an imported event row, its `source_event_uid` no longer exists in DB.
  - Next refresh treats that ICS UID as “new” and inserts a new row.
- Therefore suppression keyed only on `planner_events.id` is insufficient. Suppression must be refresh-proof using at least:
  - `(user_id, source_id, source_event_uid)` (preferred), and optionally
  - a stable fingerprint if UID is missing (rare) or if non-ICS sources are added later.

## 6) Current event query/list flow

Canonical SSR entrypoint:
- `apps/ti-web/app/weekend-planner/page.tsx`
  - If authed, it SSR-preloads up to 250 events for first paint.
  - But the client is authoritative for ranged lens fetch.

Client fetching and range logic:
- `apps/ti-web/app/_components/planner/PlannerClient.tsx`
  - Calls `GET /api/planner/events` with:
    - `from` inclusive and `to` exclusive (`starts_at >= from && starts_at < to`)
    - `includePast=false`
    - `types` for Season filters
    - `limit=200`
  - Also calls `GET /api/planner/sources` (limit 50).
  - Groups by day key derived from `starts_at` using safe timezone fallback.

Event API:
- `apps/ti-web/app/api/planner/events/route.ts` (GET/POST)
  - Auth via `createSupabaseServerClient().auth.getUser()`
  - Ownership enforced by query `.eq("user_id", user.id)`
  - Range-bounded query params already exist (good foundation for Stage 2.4).

Implications for duplicate detection:
- The planner already has everything needed client-side:
  - A bounded list of events (≤200).
  - A bounded list of sources (≤50) mapping `source_id` → `source_name/team_name`.
- Candidate detection can run client-side without adding heavy new queries.

## 7) Auth/ownership patterns

API routes consistently:
- Create supabase server client: `createSupabaseServerClient()` from `apps/ti-web/lib/supabaseServer`
- Read user: `supabase.auth.getUser()`
- Return 401 JSON on missing user.
- Enforce ownership in DB ops with `.eq("user_id", user.id)` and, when relevant, `.eq("id", paramId)`.

No Zod-based validation patterns observed in planner routes; they use small helper functions (asString/isIsoDateTime/clamp/etc.).

## 8) Manual event creation/editing patterns

Manual create:
- `POST /api/planner/events` → inserts `source_type: "manual"` and does not set `source_id/source_event_uid`.

Manual edit:
- `PATCH /api/planner/events/[id]` updates allowed fields and enforces ownership.

Manual duplicate:
- `POST /api/planner/events/[id]/duplicate` duplicates **manual-only** events server-side and resets source linkage to manual.

Implication for merge:
- Merge should create a manual event using the same “manual” conventions:
  - `source_type = 'manual'`, `source_id = null`, `source_event_uid = null`.

## 9) Recommended suppression model

Recommendation: **new table** (preferred) to keep planner_events stable and preserve auditability.

Proposed table: `public.planner_event_suppressions`

Minimum fields (refresh-proof):
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `reason text not null` (initial allowed values: `'merged_duplicate'`, `'kept_separate'`)
- `source_id uuid null` (for source-linked events; equals `planner_event_sources.id`)
- `source_event_uid text null` (for source-linked events; equals `planner_events.source_event_uid`)
- `event_id uuid null references public.planner_events(id) on delete cascade` (best-effort link to current row, optional)
- `merged_into_event_id uuid null references public.planner_events(id) on delete set null` (manual canonical event)
- `created_at timestamptz not null default now()`

Indexes/uniques:
- Unique constraint for ICS suppression identity:
  - `(user_id, source_id, source_event_uid, reason)` where `source_id/source_event_uid` are not null
- Optional unique for manual/manual suppression:
  - pair-key-based dismissals (see section 12)

RLS:
- Enable RLS; policies identical pattern:
  - select/insert/update/delete limited to `auth.uid() = user_id`.

Filtering rule (future Stage 2.4B):
- Hide events in the planner list if:
  - `source_type='ics' AND source_id/source_event_uid` exists in suppressions for user/reason in (`merged_duplicate`, `kept_separate`), OR
  - `event_id` is suppressed (fallback).

Why this model:
- Survives refresh row recreation (source identity persists even if row id changes).
- Doesn’t mutate planner_events schema in a way that complicates existing inserts/updates.

## 10) Recommended duplicate detection design (where it lives)

Start with client-side derived candidates:
- Location: `apps/ti-web/app/_components/planner/PlannerClient.tsx` (or an extracted helper under `apps/ti-web/lib/planner/duplicates.ts`).
- Input: the already fetched `events` (≤200) + `sources` (≤50).
- Output: for each event, up to 1–3 candidate events.

Why client-side first:
- No new endpoints required for initial UX.
- Bounded dataset makes O(n²) acceptable (200 → 40k comparisons).
- Avoids exposing raw IDs in UI; the UI can show only title/time/source name.

Optional later evolution:
- Server helper or endpoint that accepts `(from,to,types,limit)` and returns candidates; useful if we need more data or want consistent scoring.

## 11) Recommended merge endpoint design (future)

New endpoint:
- `POST /api/planner/events/merge` → `apps/ti-web/app/api/planner/events/merge/route.ts`

Request body (internal IDs allowed, but never display them):
- `primary_event_id: string`
- `merge_event_ids: string[]`
- `field_winners?: { ... }` (only needed when conflicts exist)

Server responsibilities:
- Auth required; ownership enforced by selecting all involved events with `.eq("user_id", user.id)` and `.in("id", allIds)`.
- Create a new manual event row (union of fields; reset source linkage).
- Insert suppression rows for each merged source-linked event (and optionally manual duplicates) using refresh-proof identity:
  - For ICS events: write `(source_id, source_event_uid)` suppression.
  - Also write `event_id` if present for convenience.
- Return `{ ok: true, event: newManualEvent, suppressed: [...] }` with user-safe fields only.

## 12) Recommended Keep separate / dismiss design

Keep separate should prevent repeated prompts for the same pair unless materially changed.

Minimal viable storage:
- Reuse `planner_event_suppressions` with `reason='kept_separate'` but store a **pair key** instead of suppressing visibility.

Option A (new table, clearer semantics):
- `planner_event_duplicate_dismissals`:
  - `id, user_id, a_key, b_key, created_at`
  - Unique on `(user_id, a_key, b_key)`

Stable keys:
- For ICS events: `ics:<source_id>:<source_event_uid>`
- For manual events: `manual:<event_id>` (ok because manual ids won’t be recreated by refresh)
- For future-proofing: consider `manual_fingerprint:<hash>` if manual copies get re-created.

Sorting:
- Store keys in sorted order so pair matching is commutative.

Option B (single suppression table):
- Add optional columns to suppressions:
  - `dismissed_pair_key_a`, `dismissed_pair_key_b`
This keeps migration count down but mixes concerns.

## 13) Recommended UAT additions (future)

Where to document:
- Primary checklist: `docs/weekend-planner-uat.md`
- ICS-specific: `docs/qa/ti-planner-ics-uat.md`

Future UAT scenarios:
- Import two calendars with overlapping events (team + tournament fixtures).
- Confirm “Possible duplicate” appears and “Merge (Recommended)” only for high confidence.
- Merge creates a new manual event; source-linked duplicates suppressed/hidden.
- Refresh does not re-show suppressed duplicates.
- Notes/venue/tournament selections preserved.
- Keep separate persists (no repeated prompting).

## 14) Risks and open questions

- Identity: some calendars may omit UID or change UID behavior across seasons; we currently generate a stable UID fallback hash, but confirm it remains stable across refresh for that source.
- Timezone normalization: candidate matching “same day” needs consistent timezone handling; use the existing safe timezone fallback patterns.
- Location quality: many events have weak/no address_text; matching needs to work when location is empty (but reduce false positives).
- UX: avoid noisy duplicate banners; provide clear dismiss.
- Data volume: season view may have many events; keep detection bounded (current limit=200 helps).

## 15) Proposed implementation stages (2.4B–2.4E)

**Stage 2.4B — Suppression persistence + filtering**
- Add suppression schema + RLS + indexes.
- Update `GET /api/planner/events` (and/or client filtering) to hide suppressed events.
- Ensure refresh does not resurrect suppressed source identity into the visible list (filter at read-time; optionally also skip inserts if suppressed identity exists).

**Stage 2.4C — Duplicate candidate detection**
- Add client-side detection helper using bounded events + sources.
- Add UI affordance: “Possible duplicate” and “Merge (Recommended)” for high-confidence matches.
- Implement “Keep separate” dismissal persistence (pair-key based).

**Stage 2.4D — Manual merge endpoint**
- Add `POST /api/planner/events/merge`.
- Create new manual event and write suppressions.
- Return user-safe response.

**Stage 2.4E — Merge UI + UAT**
- Merge confirmation UI with conflict resolution (field winners).
- Ensure post-merge navigation/edit flow feels safe.
- Update UAT docs and add/extend fixtures if needed.

