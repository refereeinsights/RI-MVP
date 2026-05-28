-- TI Weekend Planner (Stage 2.4B): refresh-proof event suppressions.
--
-- Why:
-- - Future manual merge will create a canonical manual event and suppress source-linked duplicates.
-- - ICS refresh can recreate source-linked rows after deletion, so suppression must be keyed by
--   (user_id, source_id, source_event_uid), not only planner_events.id.
--
-- Notes:
-- - This table does not delete source events; it only records suppressions.
-- - Visibility filtering is enforced at read time in the app/API layer (Stage 2.4B).

create table if not exists public.planner_event_suppressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  source_id uuid null references public.planner_event_sources(id) on delete set null,
  source_event_uid text null,
  event_id uuid null references public.planner_events(id) on delete set null,
  merged_into_event_id uuid null references public.planner_events(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint planner_event_suppressions_reason_check
    check (reason in ('merged_duplicate', 'kept_separate')),
  constraint planner_event_suppressions_merged_requires_source_identity_check
    check ((reason <> 'merged_duplicate') or (source_id is not null and source_event_uid is not null))
);

grant select, insert, update, delete on table public.planner_event_suppressions to authenticated;
grant select, insert, update, delete on table public.planner_event_suppressions to service_role;

create index if not exists planner_event_suppressions_user_id_idx
  on public.planner_event_suppressions (user_id);

create index if not exists planner_event_suppressions_user_source_uid_idx
  on public.planner_event_suppressions (user_id, source_id, source_event_uid);

create index if not exists planner_event_suppressions_user_event_id_idx
  on public.planner_event_suppressions (user_id, event_id);

create index if not exists planner_event_suppressions_user_merged_into_idx
  on public.planner_event_suppressions (user_id, merged_into_event_id);

create index if not exists planner_event_suppressions_user_reason_created_at_idx
  on public.planner_event_suppressions (user_id, reason, created_at);

create unique index if not exists planner_event_suppressions_source_identity_unique_idx
  on public.planner_event_suppressions (user_id, source_id, source_event_uid, reason)
  where source_id is not null and source_event_uid is not null;

alter table public.planner_event_suppressions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='planner_event_suppressions'
      and policyname='planner_event_suppressions_select_own'
  ) then
    create policy planner_event_suppressions_select_own
      on public.planner_event_suppressions
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='planner_event_suppressions'
      and policyname='planner_event_suppressions_insert_own'
  ) then
    create policy planner_event_suppressions_insert_own
      on public.planner_event_suppressions
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='planner_event_suppressions'
      and policyname='planner_event_suppressions_update_own'
  ) then
    create policy planner_event_suppressions_update_own
      on public.planner_event_suppressions
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='planner_event_suppressions'
      and policyname='planner_event_suppressions_delete_own'
  ) then
    create policy planner_event_suppressions_delete_own
      on public.planner_event_suppressions
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

