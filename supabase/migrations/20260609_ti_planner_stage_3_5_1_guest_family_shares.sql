-- TI Weekend Planner (Stage 3.5-1): Weekend Pro guest family schedule sharing.
-- Notes:
-- - `scope_target_id` is intentionally polymorphic and cannot use a single FK because future rows
--   may target either planner_children or planner_teams depending on scope_type.
-- - `scope_target_id` therefore remains a nullable UUID validated by DB checks + future app logic.
-- - `rotated_at` records the last time the guest token was regenerated.
-- - `updated_at` records any row modification more generally.

create table if not exists public.planner_guest_shares (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  scope_type text not null,
  scope_target_id uuid null,
  token_nonce text not null,
  token_hash text not null,
  active boolean not null default true,
  revoked_at timestamptz null,
  rotated_at timestamptz null,
  last_accessed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_guest_shares_scope_type_check check (scope_type in ('family', 'child', 'team')),
  constraint planner_guest_shares_family_scope_target_check check (
    (scope_type = 'family' and scope_target_id is null)
    or (scope_type <> 'family' and scope_target_id is not null)
  ),
  constraint planner_guest_shares_token_nonce_not_blank check (length(trim(token_nonce)) > 0),
  constraint planner_guest_shares_token_hash_hex_check check (token_hash ~ '^[0-9a-f]{64}$')
);

grant select, insert, update, delete on table public.planner_guest_shares to authenticated;
grant select, insert, update, delete on table public.planner_guest_shares to service_role;

create index if not exists planner_guest_shares_owner_scope_idx
  on public.planner_guest_shares (owner_user_id, scope_type, updated_at desc);

create unique index if not exists planner_guest_shares_token_hash_unique_idx
  on public.planner_guest_shares (token_hash);

create unique index if not exists planner_guest_shares_active_family_per_owner_idx
  on public.planner_guest_shares (owner_user_id)
  where active = true and scope_type = 'family';

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'trg_planner_guest_shares_updated_at') then
      create trigger trg_planner_guest_shares_updated_at
        before update on public.planner_guest_shares
        for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

alter table public.planner_guest_shares enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_guest_shares' and policyname='planner_guest_shares_select_own') then
    create policy planner_guest_shares_select_own
      on public.planner_guest_shares
      for select
      using (auth.uid() = owner_user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_guest_shares' and policyname='planner_guest_shares_insert_own') then
    create policy planner_guest_shares_insert_own
      on public.planner_guest_shares
      for insert
      with check (auth.uid() = owner_user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_guest_shares' and policyname='planner_guest_shares_update_own') then
    create policy planner_guest_shares_update_own
      on public.planner_guest_shares
      for update
      using (auth.uid() = owner_user_id)
      with check (auth.uid() = owner_user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='planner_guest_shares' and policyname='planner_guest_shares_delete_own') then
    create policy planner_guest_shares_delete_own
      on public.planner_guest_shares
      for delete
      using (auth.uid() = owner_user_id);
  end if;
end $$;
