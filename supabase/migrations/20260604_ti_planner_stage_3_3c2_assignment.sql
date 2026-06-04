-- TI Weekend Planner (Stage 3.3C-2): optional child/team assignment for sources and manual events.
-- Imported events continue to derive family context from source assignment at render time only.

alter table public.planner_event_sources
  add column if not exists child_profile_id uuid,
  add column if not exists team_profile_id uuid;

alter table public.planner_events
  add column if not exists child_profile_id uuid,
  add column if not exists team_profile_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_event_sources_child_profile_fk'
  ) then
    alter table public.planner_event_sources
      add constraint planner_event_sources_child_profile_fk
      foreign key (child_profile_id)
      references public.planner_children(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_event_sources_team_profile_fk'
  ) then
    alter table public.planner_event_sources
      add constraint planner_event_sources_team_profile_fk
      foreign key (team_profile_id)
      references public.planner_teams(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_events_child_profile_fk'
  ) then
    alter table public.planner_events
      add constraint planner_events_child_profile_fk
      foreign key (child_profile_id)
      references public.planner_children(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_events_team_profile_fk'
  ) then
    alter table public.planner_events
      add constraint planner_events_team_profile_fk
      foreign key (team_profile_id)
      references public.planner_teams(id)
      on delete set null;
  end if;
end $$;

create index if not exists planner_event_sources_user_child_profile_idx
  on public.planner_event_sources (user_id, child_profile_id);

create index if not exists planner_event_sources_user_team_profile_idx
  on public.planner_event_sources (user_id, team_profile_id);

create index if not exists planner_events_user_child_profile_idx
  on public.planner_events (user_id, child_profile_id);

create index if not exists planner_events_user_team_profile_idx
  on public.planner_events (user_id, team_profile_id);
