begin;

alter table if exists public.profiles
  add column if not exists contact_terms_accepted_at timestamptz;

create table if not exists public.contact_access_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,
  assignor_id uuid not null,
  ip_hash text,
  user_agent_hash text
);

create table if not exists public.assignor_claim_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  assignor_id uuid not null,
  requester_email text not null,
  request_type text not null check (request_type in ('claim','remove','correction')),
  message text,
  status text not null default 'new' check (status in ('new','in_review','resolved','rejected')),
  admin_notes text
);

create table if not exists public.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  ip_hash text,
  key text not null
);

create index if not exists contact_access_log_assignor_id_idx on public.contact_access_log (assignor_id);
create index if not exists contact_access_log_user_id_idx on public.contact_access_log (user_id);
create index if not exists contact_access_log_created_at_idx on public.contact_access_log (created_at);

create index if not exists assignor_claim_requests_status_idx on public.assignor_claim_requests (status);
create index if not exists assignor_claim_requests_created_at_idx on public.assignor_claim_requests (created_at);

create index if not exists rate_limit_events_user_key_created_idx on public.rate_limit_events (user_id, key, created_at);
create index if not exists rate_limit_events_ip_key_created_idx on public.rate_limit_events (ip_hash, key, created_at);

create or replace function public.mask_email(email text)
returns text
language sql
immutable
as $$
  select case
    when email is null then null
    when position('@' in email) = 0 then 'hidden'
    else
      left(email, 1) || '***@' || split_part(email, '@', 2)
  end;
$$;

create or replace function public.mask_phone(phone text)
returns text
language sql
immutable
as $$
  select case
    when phone is null then null
    when length(regexp_replace(phone, '\\D', '', 'g')) < 4 then 'hidden'
    else
      '(***) ***-' || right(regexp_replace(phone, '\\D', '', 'g'), 4)
  end;
$$;

create or replace function public.assignor_directory_public_fn()
returns table (
  id uuid,
  display_name text,
  base_city text,
  base_state text,
  last_seen_at timestamptz,
  confidence numeric,
  masked_email text,
  masked_phone text
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    a.display_name,
    a.base_city,
    a.base_state,
    a.last_seen_at,
    a.confidence,
    public.mask_email(email_contact.value) as masked_email,
    public.mask_phone(phone_contact.value) as masked_phone
  from public.assignors a
  left join lateral (
    select c.value
    from public.assignor_contacts c
    where c.assignor_id = a.id
      and lower(coalesce(c.type, c.contact_type, '')) = 'email'
    order by c.is_primary desc nulls last
    limit 1
  ) as email_contact on true
  left join lateral (
    select c.value
    from public.assignor_contacts c
    where c.assignor_id = a.id
      and lower(coalesce(c.type, c.contact_type, '')) = 'phone'
    order by c.is_primary desc nulls last
    limit 1
  ) as phone_contact on true
  where a.review_status = 'approved';
$$;

create or replace view public.assignor_directory_public as
  select * from public.assignor_directory_public_fn();

grant execute on function public.assignor_directory_public_fn() to anon, authenticated;
grant execute on function public.mask_email(text) to anon, authenticated;
grant execute on function public.mask_phone(text) to anon, authenticated;
grant select on public.assignor_directory_public to anon, authenticated;

alter table public.assignors enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assignors'
      and policyname = 'assignors_select_public'
  ) then
    create policy assignors_select_public
      on public.assignors
      for select
      using (review_status = 'approved');
  end if;
end $$;

alter table public.assignor_contacts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assignor_contacts'
      and policyname = 'assignor_contacts_select_terms'
  ) then
    create policy assignor_contacts_select_terms
      on public.assignor_contacts
      for select
      using (
        auth.role() = 'authenticated'
        and exists (
          select 1
          from public.profiles p
          where p.user_id = auth.uid()
            and (
              p.contact_terms_accepted_at is not null
              or p.role = 'admin'
            )
        )
      );
  end if;
end $$;

alter table public.contact_access_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contact_access_log'
      and policyname = 'contact_access_log_insert_self'
  ) then
    create policy contact_access_log_insert_self
      on public.contact_access_log
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contact_access_log'
      and policyname = 'contact_access_log_admin_select'
  ) then
    create policy contact_access_log_admin_select
      on public.contact_access_log
      for select
      using (
        exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid() and p.role = 'admin'
        )
      );
  end if;
end $$;

alter table public.assignor_claim_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assignor_claim_requests'
      and policyname = 'assignor_claim_requests_insert_public'
  ) then
    create policy assignor_claim_requests_insert_public
      on public.assignor_claim_requests
      for insert
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assignor_claim_requests'
      and policyname = 'assignor_claim_requests_admin_select'
  ) then
    create policy assignor_claim_requests_admin_select
      on public.assignor_claim_requests
      for select
      using (
        exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid() and p.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assignor_claim_requests'
      and policyname = 'assignor_claim_requests_admin_update'
  ) then
    create policy assignor_claim_requests_admin_update
      on public.assignor_claim_requests
      for update
      using (
        exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid() and p.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid() and p.role = 'admin'
        )
      );
  end if;
end $$;

alter table public.rate_limit_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'rate_limit_events'
      and policyname = 'rate_limit_events_insert_self'
  ) then
    create policy rate_limit_events_insert_self
      on public.rate_limit_events
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'rate_limit_events'
      and policyname = 'rate_limit_events_admin_select'
  ) then
    create policy rate_limit_events_admin_select
      on public.rate_limit_events
      for select
      using (
        exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid() and p.role = 'admin'
        )
      );
  end if;
end $$;

commit;
