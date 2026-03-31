-- Shared: TI admin email templates (managed from RI admin tools)
--
-- Stores reusable subject/body templates for admin sends to TI users.
-- Intended for marketing/admin-blast emails (suppression-aware; one-click unsubscribe links).

create table if not exists public.ti_admin_email_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz null,
  name text not null,
  kind text not null default 'marketing',
  subject text not null,
  body text not null,
  constraint ti_admin_email_templates_name_nonempty check (length(trim(name)) > 0),
  constraint ti_admin_email_templates_kind_allowed check (kind in ('marketing', 'transactional'))
);

create index if not exists ti_admin_email_templates_updated_at_idx
  on public.ti_admin_email_templates (updated_at desc);

create index if not exists ti_admin_email_templates_last_used_at_idx
  on public.ti_admin_email_templates (last_used_at desc);

-- Maintain updated_at if the helper exists in this project.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at' and pg_function_is_visible(oid)) then
    drop trigger if exists set_ti_admin_email_templates_updated_at on public.ti_admin_email_templates;
    create trigger set_ti_admin_email_templates_updated_at
      before update on public.ti_admin_email_templates
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.ti_admin_email_templates enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'admin_all_ti_admin_email_templates') then
    create policy admin_all_ti_admin_email_templates
      on public.ti_admin_email_templates
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

revoke all on table public.ti_admin_email_templates from public;
revoke all on table public.ti_admin_email_templates from anon;
revoke all on table public.ti_admin_email_templates from authenticated;

grant select, insert, update, delete on table public.ti_admin_email_templates to service_role;

