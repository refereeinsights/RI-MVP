-- Shared: email suppressions (TI + RI)
--
-- Minimal, explicit suppression list for cross-app email preflight.
-- Intended use:
-- - marketing/admin blasts: suppress if suppress_marketing OR suppress_all
-- - transactional/user-initiated emails: suppress only if suppress_all

create table if not exists public.email_suppressions (
  email text primary key,
  suppress_marketing boolean not null default true,
  suppress_all boolean not null default false,
  reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_suppressions_email_nonempty check (length(trim(email)) > 3)
);

create index if not exists email_suppressions_suppress_marketing_idx
  on public.email_suppressions (suppress_marketing)
  where suppress_marketing = true;

create index if not exists email_suppressions_suppress_all_idx
  on public.email_suppressions (suppress_all)
  where suppress_all = true;

-- Maintain updated_at if the helper exists in this project.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at' and pg_function_is_visible(oid)) then
    drop trigger if exists set_email_suppressions_updated_at on public.email_suppressions;
    create trigger set_email_suppressions_updated_at
      before update on public.email_suppressions
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.email_suppressions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'admin_all_email_suppressions') then
    create policy admin_all_email_suppressions
      on public.email_suppressions
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

revoke all on table public.email_suppressions from public;
revoke all on table public.email_suppressions from anon;
revoke all on table public.email_suppressions from authenticated;

grant select, insert, update, delete on table public.email_suppressions to service_role;

