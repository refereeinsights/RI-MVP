-- TI auth/account foundation table, trigger, and RLS policies.

create table if not exists public.ti_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  status text not null default 'active',

  plan text not null default 'free',
  subscription_status text not null default 'none',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,

  stripe_customer_id text,
  stripe_subscription_id text,

  terms_accepted_at timestamptz,
  marketing_opt_in boolean not null default false,

  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_ti_users_updated_at on public.ti_users;
create trigger trg_ti_users_updated_at
before update on public.ti_users
for each row execute function public.set_updated_at();

create or replace function public.handle_new_ti_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ti_users (id, email, first_seen_at, last_seen_at)
  values (new.id, new.email, now(), now())
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_ti on auth.users;
create trigger on_auth_user_created_ti
after insert on auth.users
for each row execute function public.handle_new_ti_user();

alter table public.ti_users enable row level security;
grant select, insert, update on public.ti_users to authenticated;

create unique index if not exists ti_users_email_unique
on public.ti_users (lower(email))
where email is not null;

drop policy if exists "ti_users_select_own" on public.ti_users;
create policy "ti_users_select_own"
on public.ti_users for select
using (auth.uid() = id);

drop policy if exists "ti_users_update_own" on public.ti_users;
create policy "ti_users_update_own"
on public.ti_users for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "ti_users_insert_own" on public.ti_users;
create policy "ti_users_insert_own"
on public.ti_users for insert
with check (auth.uid() = id);
