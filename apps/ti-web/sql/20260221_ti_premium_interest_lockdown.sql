-- TI premium-interest table lockdown (insert-only via RLS).
-- Apply manually in Supabase SQL editor.

create table if not exists public.ti_premium_interest (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.ti_premium_interest enable row level security;

-- Allow inserts from anyone (anon or authenticated).
drop policy if exists "ti_premium_interest_insert" on public.ti_premium_interest;
create policy "ti_premium_interest_insert"
on public.ti_premium_interest
for insert
with check (email is not null);

-- Ensure there are no read/write mutation policies exposed to anon/authenticated.
drop policy if exists "ti_premium_interest_select" on public.ti_premium_interest;
drop policy if exists "ti_premium_interest_update" on public.ti_premium_interest;
drop policy if exists "ti_premium_interest_delete" on public.ti_premium_interest;
drop policy if exists "premium_interest_insert_anon" on public.ti_premium_interest;

grant insert on public.ti_premium_interest to anon, authenticated;
revoke select, update, delete on public.ti_premium_interest from anon, authenticated;

-- Verification checklist:
-- 1) Confirm RLS enabled:
--    select relrowsecurity
--    from pg_class
--    where relname = 'ti_premium_interest';
--
-- 2) Confirm policies (should be insert only):
--    select polname, polcmd
--    from pg_policy
--    join pg_class on pg_policy.polrelid = pg_class.oid
--    where pg_class.relname = 'ti_premium_interest';
--
-- 3) Confirm no select policy:
--    select polname
--    from pg_policy
--    join pg_class on pg_policy.polrelid = pg_class.oid
--    where pg_class.relname = 'ti_premium_interest'
--      and polcmd = 'r';

