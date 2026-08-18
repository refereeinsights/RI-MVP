-- Corralio Slice 2: minimal household-owned schedule foundation.
--
-- Applied manually to the production Supabase project on 2026-08-18 and verified
-- with the rollback-only authorization script. Do not rerun it manually.
--
-- Deliberately deferred:
-- - account/household deletion semantics and ownerless-household cleanup
-- - imported-event suppression
-- - collaboration, ingestion, refresh jobs, and product UI

create extension if not exists "pgcrypto";

create table public.corralio_households (
  id uuid primary key default gen_random_uuid(),
  display_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corralio_households_display_name_check
    check (display_name is null or length(btrim(display_name)) between 1 and 100)
);

create table public.corralio_household_members (
  household_id uuid not null
    references public.corralio_households(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  role text not null default 'owner',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  constraint corralio_household_members_role_check check (role = 'owner'),
  constraint corralio_household_members_status_check check (status = 'active')
);

-- V1 permits one active owner household per Auth user. The partial shape makes the
-- single-owner assumption explicit and allows a future collaboration migration to
-- revise roles/statuses without changing household identity.
create unique index corralio_household_members_one_active_owner_per_user_idx
  on public.corralio_household_members (user_id)
  where role = 'owner' and status = 'active';

create index corralio_household_members_household_status_idx
  on public.corralio_household_members (household_id, status, user_id);

create table public.corralio_children (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null
    references public.corralio_households(id) on delete cascade,
  display_name text not null,
  color_token text not null,
  sort_order integer not null default 0,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corralio_children_display_name_check
    check (length(btrim(display_name)) between 1 and 80),
  constraint corralio_children_color_token_check
    check (color_token in ('forest', 'ocean', 'amber', 'violet', 'rose', 'teal')),
  constraint corralio_children_sort_order_check check (sort_order >= 0),
  constraint corralio_children_household_id_id_unique unique (household_id, id)
);

create index corralio_children_household_sort_idx
  on public.corralio_children (household_id, archived_at, sort_order, created_at);

create table public.corralio_teams (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null
    references public.corralio_households(id) on delete cascade,
  child_id uuid not null,
  display_name text not null,
  sport text null,
  sort_order integer not null default 0,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corralio_teams_display_name_check
    check (length(btrim(display_name)) between 1 and 100),
  constraint corralio_teams_sport_check
    check (sport is null or length(btrim(sport)) between 1 and 60),
  constraint corralio_teams_sort_order_check check (sort_order >= 0),
  constraint corralio_teams_household_id_id_unique unique (household_id, id),
  constraint corralio_teams_child_household_fk
    foreign key (household_id, child_id)
    references public.corralio_children(household_id, id)
    on delete restrict
);

create index corralio_teams_household_child_sort_idx
  on public.corralio_teams (household_id, child_id, archived_at, sort_order, created_at);

create table public.corralio_schedule_sources (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null
    references public.corralio_households(id) on delete cascade,
  source_type text not null default 'ics',
  display_name text not null,
  source_url text not null,
  child_id uuid null,
  team_id uuid null,
  sync_status text not null default 'pending',
  last_synced_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corralio_schedule_sources_type_check check (source_type = 'ics'),
  constraint corralio_schedule_sources_display_name_check
    check (length(btrim(display_name)) between 1 and 100),
  constraint corralio_schedule_sources_url_check
    check (
      length(source_url) between 1 and 2048
      and source_url ~* '^(https?|webcal)://'
    ),
  constraint corralio_schedule_sources_assignment_check
    check (num_nonnulls(child_id, team_id) <= 1),
  constraint corralio_schedule_sources_sync_status_check
    check (sync_status in ('pending', 'success', 'error', 'disconnected')),
  constraint corralio_schedule_sources_household_id_id_unique unique (household_id, id),
  constraint corralio_schedule_sources_child_household_fk
    foreign key (household_id, child_id)
    references public.corralio_children(household_id, id)
    on delete restrict,
  constraint corralio_schedule_sources_team_household_fk
    foreign key (household_id, team_id)
    references public.corralio_teams(household_id, id)
    on delete restrict
);

create index corralio_schedule_sources_household_created_idx
  on public.corralio_schedule_sources (household_id, created_at);

create table public.corralio_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null
    references public.corralio_households(id) on delete cascade,
  origin_type text not null,
  schedule_source_id uuid null,
  source_event_uid text null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz null,
  timezone text null,
  child_id uuid null,
  team_id uuid null,
  source_location_text text null,
  display_location_text text null,
  field_label text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corralio_events_origin_type_check check (origin_type in ('manual', 'ics')),
  constraint corralio_events_title_check check (length(btrim(title)) between 1 and 140),
  constraint corralio_events_time_check check (ends_at is null or ends_at >= starts_at),
  constraint corralio_events_timezone_check
    check (timezone is null or length(btrim(timezone)) between 1 and 64),
  constraint corralio_events_assignment_check check (num_nonnulls(child_id, team_id) <= 1),
  constraint corralio_events_source_identity_check
    check (
      (origin_type = 'manual' and schedule_source_id is null and source_event_uid is null)
      or
      (origin_type = 'ics' and schedule_source_id is not null and length(btrim(source_event_uid)) between 1 and 512)
    ),
  constraint corralio_events_source_location_check
    check (source_location_text is null or length(source_location_text) <= 1000),
  constraint corralio_events_display_location_check
    check (display_location_text is null or length(display_location_text) <= 400),
  constraint corralio_events_field_label_check
    check (field_label is null or length(field_label) <= 80),
  constraint corralio_events_notes_check check (notes is null or length(notes) <= 4000),
  constraint corralio_events_source_household_fk
    foreign key (household_id, schedule_source_id)
    references public.corralio_schedule_sources(household_id, id)
    on delete cascade,
  constraint corralio_events_child_household_fk
    foreign key (household_id, child_id)
    references public.corralio_children(household_id, id)
    on delete restrict,
  constraint corralio_events_team_household_fk
    foreign key (household_id, team_id)
    references public.corralio_teams(household_id, id)
    on delete restrict
);

create unique index corralio_events_imported_identity_idx
  on public.corralio_events (household_id, schedule_source_id, source_event_uid)
  where origin_type = 'ics';

create index corralio_events_household_starts_idx
  on public.corralio_events (household_id, starts_at, id);

create index corralio_events_household_child_starts_idx
  on public.corralio_events (household_id, child_id, starts_at)
  where child_id is not null;

create index corralio_events_household_team_starts_idx
  on public.corralio_events (household_id, team_id, starts_at)
  where team_id is not null;

comment on table public.corralio_households is
  'Private Corralio family-planning boundary. V1 authorization is derived from active membership.';
comment on table public.corralio_household_members is
  'V1 supports one active owner per household and one active owner household per user. Collaboration is deferred.';
comment on column public.corralio_schedule_sources.source_url is
  'Sensitive calendar-feed URL. Authenticated clients have no SELECT privilege; writes use narrowly granted RPCs.';
comment on table public.corralio_events is
  'Household-owned manual and imported schedule events. Imported rows are client read-only.';

create function public.corralio_set_updated_at_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

revoke all on function public.corralio_set_updated_at_v1()
  from public, anon, authenticated;
grant execute on function public.corralio_set_updated_at_v1() to service_role;

create trigger corralio_households_set_updated_at
  before update on public.corralio_households
  for each row execute function public.corralio_set_updated_at_v1();
create trigger corralio_children_set_updated_at
  before update on public.corralio_children
  for each row execute function public.corralio_set_updated_at_v1();
create trigger corralio_teams_set_updated_at
  before update on public.corralio_teams
  for each row execute function public.corralio_set_updated_at_v1();
create trigger corralio_schedule_sources_set_updated_at
  before update on public.corralio_schedule_sources
  for each row execute function public.corralio_set_updated_at_v1();
create trigger corralio_events_set_updated_at
  before update on public.corralio_events
  for each row execute function public.corralio_set_updated_at_v1();

alter table public.corralio_households enable row level security;
alter table public.corralio_household_members enable row level security;
alter table public.corralio_children enable row level security;
alter table public.corralio_teams enable row level security;
alter table public.corralio_schedule_sources enable row level security;
alter table public.corralio_events enable row level security;

-- Start from explicit denial. Grants below expose only the intended operations.
revoke all on table public.corralio_households from public, anon, authenticated;
revoke all on table public.corralio_household_members from public, anon, authenticated;
revoke all on table public.corralio_children from public, anon, authenticated;
revoke all on table public.corralio_teams from public, anon, authenticated;
revoke all on table public.corralio_schedule_sources from public, anon, authenticated;
revoke all on table public.corralio_events from public, anon, authenticated;

grant select on table public.corralio_households to authenticated;
grant update (display_name) on table public.corralio_households to authenticated;
grant select on table public.corralio_household_members to authenticated;
grant select, insert, update on table public.corralio_children to authenticated;
grant select, insert, update on table public.corralio_teams to authenticated;

-- RLS limits rows; this column allowlist independently keeps source_url unreadable.
grant select (
  id,
  household_id,
  source_type,
  display_name,
  child_id,
  team_id,
  sync_status,
  last_synced_at,
  created_at,
  updated_at
) on table public.corralio_schedule_sources to authenticated;
grant delete on table public.corralio_schedule_sources to authenticated;

grant select, insert, update, delete on table public.corralio_events to authenticated;

grant select, insert, update, delete on table public.corralio_households to service_role;
grant select, insert, update, delete on table public.corralio_household_members to service_role;
grant select, insert, update, delete on table public.corralio_children to service_role;
grant select, insert, update, delete on table public.corralio_teams to service_role;
grant select, insert, update, delete on table public.corralio_schedule_sources to service_role;
grant select, insert, update, delete on table public.corralio_events to service_role;

create policy corralio_household_members_select_own
  on public.corralio_household_members
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy corralio_households_select_member
  on public.corralio_households
  for select to authenticated
  using (
    exists (
      select 1
      from public.corralio_household_members member
      where member.household_id = corralio_households.id
        and member.user_id = (select auth.uid())
        and member.role = 'owner'
        and member.status = 'active'
    )
  );

create policy corralio_households_update_member
  on public.corralio_households
  for update to authenticated
  using (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_households.id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_households.id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  );

create policy corralio_children_select_member
  on public.corralio_children for select to authenticated
  using (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_children.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  );
create policy corralio_children_insert_member
  on public.corralio_children for insert to authenticated
  with check (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_children.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  );
create policy corralio_children_update_member
  on public.corralio_children for update to authenticated
  using (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_children.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_children.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  );

create policy corralio_teams_select_member
  on public.corralio_teams for select to authenticated
  using (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_teams.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  );
create policy corralio_teams_insert_member
  on public.corralio_teams for insert to authenticated
  with check (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_teams.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  );
create policy corralio_teams_update_member
  on public.corralio_teams for update to authenticated
  using (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_teams.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_teams.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  );

create policy corralio_schedule_sources_select_member
  on public.corralio_schedule_sources for select to authenticated
  using (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_schedule_sources.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  );
create policy corralio_schedule_sources_delete_member
  on public.corralio_schedule_sources for delete to authenticated
  using (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_schedule_sources.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  );

create policy corralio_events_select_member
  on public.corralio_events for select to authenticated
  using (
    exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_events.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  );
create policy corralio_events_insert_manual_member
  on public.corralio_events for insert to authenticated
  with check (
    origin_type = 'manual'
    and schedule_source_id is null
    and source_event_uid is null
    and exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_events.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  );
create policy corralio_events_update_manual_member
  on public.corralio_events for update to authenticated
  using (
    origin_type = 'manual'
    and exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_events.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  )
  with check (
    origin_type = 'manual'
    and schedule_source_id is null
    and source_event_uid is null
    and exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_events.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  );
create policy corralio_events_delete_manual_member
  on public.corralio_events for delete to authenticated
  using (
    origin_type = 'manual'
    and exists (
      select 1 from public.corralio_household_members member
      where member.household_id = corralio_events.household_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.status = 'active'
    )
  );

create or replace function public.corralio_ensure_owner_household(
  p_display_name text default null
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

  insert into public.corralio_households (display_name)
  values (v_display_name)
  returning id into v_household_id;

  insert into public.corralio_household_members (household_id, user_id, role, status)
  values (v_household_id, v_user_id, 'owner', 'active');

  return v_household_id;
end;
$function$;

create or replace function public.corralio_create_schedule_source(
  p_household_id uuid,
  p_display_name text,
  p_source_url text,
  p_child_id uuid default null,
  p_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_source_id uuid;
  v_display_name text := btrim(p_display_name);
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.corralio_household_members member
    where member.household_id = p_household_id
      and member.user_id = v_user_id
      and member.role = 'owner'
      and member.status = 'active'
  ) then
    raise exception 'Household access denied' using errcode = '42501';
  end if;

  if v_display_name is null or length(v_display_name) not between 1 and 100 then
    raise exception 'Schedule source name is invalid' using errcode = '22001';
  end if;

  if p_source_url is null
     or length(p_source_url) not between 1 and 2048
     or p_source_url !~* '^(https?|webcal)://' then
    raise exception 'Schedule source URL is invalid' using errcode = '22023';
  end if;

  if num_nonnulls(p_child_id, p_team_id) > 1 then
    raise exception 'Choose at most one child or team assignment' using errcode = '23514';
  end if;

  if p_child_id is not null and not exists (
    select 1 from public.corralio_children child
    where child.household_id = p_household_id
      and child.id = p_child_id
  ) then
    raise exception 'Schedule source assignment is invalid' using errcode = '23503';
  end if;

  if p_team_id is not null and not exists (
    select 1 from public.corralio_teams team
    where team.household_id = p_household_id
      and team.id = p_team_id
  ) then
    raise exception 'Schedule source assignment is invalid' using errcode = '23503';
  end if;

  insert into public.corralio_schedule_sources (
    household_id,
    source_type,
    display_name,
    source_url,
    child_id,
    team_id
  )
  values (
    p_household_id,
    'ics',
    v_display_name,
    p_source_url,
    p_child_id,
    p_team_id
  )
  returning id into v_source_id;

  return v_source_id;
end;
$function$;

create or replace function public.corralio_replace_schedule_source_url(
  p_source_id uuid,
  p_source_url text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if p_source_url is null
     or length(p_source_url) not between 1 and 2048
     or p_source_url !~* '^(https?|webcal)://' then
    raise exception 'Schedule source URL is invalid' using errcode = '22023';
  end if;

  update public.corralio_schedule_sources source
  set source_url = p_source_url
  where source.id = p_source_id
    and exists (
      select 1 from public.corralio_household_members member
      where member.household_id = source.household_id
        and member.user_id = v_user_id
        and member.role = 'owner'
        and member.status = 'active'
    );

  if not found then
    raise exception 'Schedule source not found or access denied' using errcode = '42501';
  end if;
end;
$function$;

revoke all on function public.corralio_ensure_owner_household(text)
  from public, anon, authenticated;
revoke all on function public.corralio_create_schedule_source(uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.corralio_replace_schedule_source_url(uuid, text)
  from public, anon, authenticated;

grant execute on function public.corralio_ensure_owner_household(text) to authenticated;
grant execute on function public.corralio_create_schedule_source(uuid, text, text, uuid, uuid)
  to authenticated;
grant execute on function public.corralio_replace_schedule_source_url(uuid, text)
  to authenticated;

grant execute on function public.corralio_ensure_owner_household(text) to service_role;
grant execute on function public.corralio_create_schedule_source(uuid, text, text, uuid, uuid)
  to service_role;
grant execute on function public.corralio_replace_schedule_source_url(uuid, text)
  to service_role;

comment on function public.corralio_ensure_owner_household(text) is
  'Idempotently creates the authenticated user V1 owner household under an advisory transaction lock.';
comment on function public.corralio_create_schedule_source(uuid, text, text, uuid, uuid) is
  'Authorized write boundary for a sensitive calendar source URL. Returns only the new source ID.';
comment on function public.corralio_replace_schedule_source_url(uuid, text) is
  'Authorized write-only replacement of a household calendar source URL; never returns the URL.';
