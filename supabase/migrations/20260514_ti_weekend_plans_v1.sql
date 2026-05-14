-- TI Weekend Plans (v1): persisted weekend planning objects (no schedule/calendar)
-- - One active plan per user+tournament (partial unique index)
-- - Optional single selected venue anchor
-- - Notes/status for future management

create table if not exists public.ti_weekend_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  selected_venue_id uuid references public.venues(id) on delete set null,
  title text,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ti_weekend_plans_status_check check (status in ('active', 'archived'))
);

create index if not exists ti_weekend_plans_user_id_idx on public.ti_weekend_plans (user_id);
create index if not exists ti_weekend_plans_tournament_id_idx on public.ti_weekend_plans (tournament_id);
create index if not exists ti_weekend_plans_selected_venue_id_idx on public.ti_weekend_plans (selected_venue_id);

-- Enforce one active plan per user+tournament.
create unique index if not exists ti_weekend_plans_one_active_per_tournament_idx
  on public.ti_weekend_plans (user_id, tournament_id)
  where status = 'active';

-- Keep updated_at fresh if the shared trigger helper exists.
do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    if not exists (
      select 1 from pg_trigger where tgname = 'trg_ti_weekend_plans_updated_at'
    ) then
      create trigger trg_ti_weekend_plans_updated_at
        before update on public.ti_weekend_plans
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- RLS: users can manage only their own plans.
alter table public.ti_weekend_plans enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ti_weekend_plans'
      and policyname = 'ti_weekend_plans_select_own'
  ) then
    create policy ti_weekend_plans_select_own
      on public.ti_weekend_plans
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ti_weekend_plans'
      and policyname = 'ti_weekend_plans_insert_own'
  ) then
    create policy ti_weekend_plans_insert_own
      on public.ti_weekend_plans
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ti_weekend_plans'
      and policyname = 'ti_weekend_plans_update_own'
  ) then
    create policy ti_weekend_plans_update_own
      on public.ti_weekend_plans
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ti_weekend_plans'
      and policyname = 'ti_weekend_plans_delete_own'
  ) then
    create policy ti_weekend_plans_delete_own
      on public.ti_weekend_plans
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

