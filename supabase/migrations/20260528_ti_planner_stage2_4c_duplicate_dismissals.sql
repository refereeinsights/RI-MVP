-- TI Weekend Planner (Stage 2.4C): per-user duplicate suggestion dismissals ("Keep separate").
--
-- Why:
-- - Stage 2.4C surfaces possible duplicates but does not merge yet.
-- - Users need "Keep separate" to persist and prevent repeated prompting for the same pair.
-- - This table stores only stable pair keys; it does NOT hide events.

create table if not exists public.planner_event_duplicate_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pair_key_a text not null,
  pair_key_b text not null,
  created_at timestamptz not null default now(),
  constraint planner_event_duplicate_dismissals_pair_not_equal_check
    check (pair_key_a <> pair_key_b)
);

grant select, insert, update, delete on table public.planner_event_duplicate_dismissals to authenticated;
grant select, insert, update, delete on table public.planner_event_duplicate_dismissals to service_role;

create unique index if not exists planner_event_duplicate_dismissals_unique_idx
  on public.planner_event_duplicate_dismissals (user_id, pair_key_a, pair_key_b);

create index if not exists planner_event_duplicate_dismissals_user_created_at_idx
  on public.planner_event_duplicate_dismissals (user_id, created_at);

alter table public.planner_event_duplicate_dismissals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='planner_event_duplicate_dismissals'
      and policyname='planner_event_duplicate_dismissals_select_own'
  ) then
    create policy planner_event_duplicate_dismissals_select_own
      on public.planner_event_duplicate_dismissals
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='planner_event_duplicate_dismissals'
      and policyname='planner_event_duplicate_dismissals_insert_own'
  ) then
    create policy planner_event_duplicate_dismissals_insert_own
      on public.planner_event_duplicate_dismissals
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='planner_event_duplicate_dismissals'
      and policyname='planner_event_duplicate_dismissals_update_own'
  ) then
    create policy planner_event_duplicate_dismissals_update_own
      on public.planner_event_duplicate_dismissals
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='planner_event_duplicate_dismissals'
      and policyname='planner_event_duplicate_dismissals_delete_own'
  ) then
    create policy planner_event_duplicate_dismissals_delete_own
      on public.planner_event_duplicate_dismissals
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

