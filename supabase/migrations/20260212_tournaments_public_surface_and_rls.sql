-- Lock down tournaments base table and expose a constrained public surface.

alter table if exists public.tournaments enable row level security;

do $$
declare
  pol record;
begin
  -- Remove any existing tournaments policies except the admin-all policy.
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournaments'
      and policyname <> 'admin_all_tournaments'
  loop
    execute format('drop policy if exists %I on public.tournaments', pol.policyname);
  end loop;

  if not exists (select 1 from pg_policies where policyname = 'admin_all_tournaments') then
    create policy admin_all_tournaments
      on public.tournaments
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;

create or replace view public.tournaments_public
with (security_invoker = true) as
select
  id,
  slug,
  name,
  sport,
  level,
  state,
  city,
  zip,
  start_date,
  end_date,
  source_url,
  official_website_url,
  summary,
  referee_contact,
  tournament_director,
  venue,
  address,
  updated_at
from public.tournaments
where status = 'published'
  and is_canonical = true;

revoke all on table public.tournaments_public from public;
revoke all on table public.tournaments_public from anon;
revoke all on table public.tournaments_public from authenticated;
grant select on table public.tournaments_public to service_role;
