-- TI Weekend Planner (Stage 3.3C-1): child/team profile foundation.
-- Purpose:
-- - add user-owned planner child/team entities
-- - keep the rollout optional
-- - do not yet assign planner events or planner sources to child/team

create extension if not exists "pgcrypto";

do $$
begin
  if to_regprocedure('public.set_updated_at()') is null then
    create or replace function public.set_updated_at() returns trigger as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$ language plpgsql;
  end if;
end $$;

create table if not exists public.planner_children (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_children_display_name_not_blank check (length(trim(display_name)) > 0),
  constraint planner_children_display_name_len check (char_length(display_name) <= 80),
  constraint planner_children_sort_order_nonnegative check (sort_order >= 0),
  constraint planner_children_id_user_unique unique (id, user_id)
);

create table if not exists public.planner_teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null,
  display_name text not null,
  sport text not null,
  season_label text,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_teams_display_name_not_blank check (length(trim(display_name)) > 0),
  constraint planner_teams_display_name_len check (char_length(display_name) <= 100),
  constraint planner_teams_sport_not_blank check (length(trim(sport)) > 0),
  constraint planner_teams_sport_len check (char_length(sport) <= 40),
  constraint planner_teams_season_label_len check (season_label is null or char_length(season_label) <= 40),
  constraint planner_teams_sort_order_nonnegative check (sort_order >= 0),
  constraint planner_teams_child_fk
    foreign key (child_id, user_id)
    references public.planner_children(id, user_id)
    on delete restrict
);

grant select, insert, update, delete on table public.planner_children to authenticated;
grant select, insert, update, delete on table public.planner_children to service_role;

grant select, insert, update, delete on table public.planner_teams to authenticated;
grant select, insert, update, delete on table public.planner_teams to service_role;

create index if not exists planner_children_user_id_sort_order_idx
  on public.planner_children (user_id, sort_order, created_at);

create index if not exists planner_teams_user_id_child_sort_order_idx
  on public.planner_teams (user_id, child_id, sort_order, created_at);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'trg_planner_children_updated_at') then
      create trigger trg_planner_children_updated_at
        before update on public.planner_children
        for each row execute function public.set_updated_at();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'trg_planner_teams_updated_at') then
      create trigger trg_planner_teams_updated_at
        before update on public.planner_teams
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

alter table public.planner_children enable row level security;
alter table public.planner_teams enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_children' and policyname='planner_children_select_own') then
    create policy planner_children_select_own on public.planner_children for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_children' and policyname='planner_children_insert_own') then
    create policy planner_children_insert_own on public.planner_children for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_children' and policyname='planner_children_update_own') then
    create policy planner_children_update_own on public.planner_children for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_children' and policyname='planner_children_delete_own') then
    create policy planner_children_delete_own on public.planner_children for delete using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_teams' and policyname='planner_teams_select_own') then
    create policy planner_teams_select_own on public.planner_teams for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_teams' and policyname='planner_teams_insert_own') then
    create policy planner_teams_insert_own on public.planner_teams for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_teams' and policyname='planner_teams_update_own') then
    create policy planner_teams_update_own on public.planner_teams for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_teams' and policyname='planner_teams_delete_own') then
    create policy planner_teams_delete_own on public.planner_teams for delete using (auth.uid() = user_id);
  end if;
end $$;
