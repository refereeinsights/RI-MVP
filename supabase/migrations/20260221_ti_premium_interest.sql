create table if not exists public.ti_premium_interest (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.ti_premium_interest enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ti_premium_interest'
      and policyname = 'premium_interest_insert_anon'
  ) then
    create policy premium_interest_insert_anon
      on public.ti_premium_interest
      for insert
      with check (email is not null);
  end if;
end $$;
