-- TI Weekend Planner (Stage 3.5-1B): Weekend Pro private family iCal subscription feeds.
-- Notes:
-- - `scope_target_id` remains polymorphic for future `child` / `team` scoped feeds.
-- - `token_nonce` + `token_version_nonce` allow deterministic server-side reconstruction
--   without persisting raw bearer tokens.
-- - `last_accessed_at` is optional operational metadata and should be throttled in app code.

create table if not exists public.planner_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  feed_type text not null default 'ical',
  scope_type text not null,
  scope_target_id uuid null,
  token_nonce text not null,
  token_version_nonce text not null,
  token_hash text not null,
  active boolean not null default true,
  revoked_at timestamptz null,
  rotated_at timestamptz null,
  last_accessed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_calendar_feeds_feed_type_check check (feed_type in ('ical')),
  constraint planner_calendar_feeds_scope_type_check check (scope_type in ('family', 'child', 'team')),
  constraint planner_calendar_feeds_family_scope_target_check check (
    (scope_type = 'family' and scope_target_id is null)
    or (scope_type <> 'family' and scope_target_id is not null)
  ),
  constraint planner_calendar_feeds_token_nonce_not_blank check (length(trim(token_nonce)) > 0),
  constraint planner_calendar_feeds_token_version_nonce_not_blank check (length(trim(token_version_nonce)) > 0),
  constraint planner_calendar_feeds_token_hash_hex_check check (token_hash ~ '^[0-9a-f]{64}$')
);

grant select, insert, update, delete on table public.planner_calendar_feeds to authenticated;
grant select, insert, update, delete on table public.planner_calendar_feeds to service_role;

create index if not exists planner_calendar_feeds_owner_scope_idx
  on public.planner_calendar_feeds (owner_user_id, feed_type, scope_type, updated_at desc);

create unique index if not exists planner_calendar_feeds_token_hash_unique_idx
  on public.planner_calendar_feeds (token_hash);

create unique index if not exists planner_calendar_feeds_active_family_per_owner_idx
  on public.planner_calendar_feeds (owner_user_id)
  where active = true and feed_type = 'ical' and scope_type = 'family';

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'trg_planner_calendar_feeds_updated_at') then
      create trigger trg_planner_calendar_feeds_updated_at
        before update on public.planner_calendar_feeds
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

alter table public.planner_calendar_feeds enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_calendar_feeds' and policyname='planner_calendar_feeds_select_own') then
    create policy planner_calendar_feeds_select_own
      on public.planner_calendar_feeds
      for select
      using (auth.uid() = owner_user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_calendar_feeds' and policyname='planner_calendar_feeds_insert_own') then
    create policy planner_calendar_feeds_insert_own
      on public.planner_calendar_feeds
      for insert
      with check (auth.uid() = owner_user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_calendar_feeds' and policyname='planner_calendar_feeds_update_own') then
    create policy planner_calendar_feeds_update_own
      on public.planner_calendar_feeds
      for update
      using (auth.uid() = owner_user_id)
      with check (auth.uid() = owner_user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_calendar_feeds' and policyname='planner_calendar_feeds_delete_own') then
    create policy planner_calendar_feeds_delete_own
      on public.planner_calendar_feeds
      for delete
      using (auth.uid() = owner_user_id);
  end if;
end $$;
