begin;

create table if not exists public.referral_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  referral_code text not null references public.referral_codes(code) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'signed_up' check (status in ('signed_up','activated')),
  unique (referred_user_id)
);

create index if not exists referrals_referrer_id_idx on public.referrals (referrer_id);
create index if not exists referrals_referred_user_id_idx on public.referrals (referred_user_id);

alter table public.referral_codes enable row level security;

create policy referral_codes_select_own
  on public.referral_codes
  for select
  using (auth.uid() = user_id);

create policy referral_codes_insert_own
  on public.referral_codes
  for insert
  with check (auth.uid() = user_id);

create policy referral_codes_update_own
  on public.referral_codes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.referrals enable row level security;

create policy referrals_select_own
  on public.referrals
  for select
  using (auth.uid() = referrer_id or auth.uid() = referred_user_id);

commit;
