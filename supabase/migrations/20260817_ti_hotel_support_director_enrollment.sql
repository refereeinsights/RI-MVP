-- TI Tournament Hotel Support director enrollment pilot.
--
-- IMPORTANT: This migration is intentionally unapplied. The local applications use the
-- production database, so a founder must review and apply it manually before browser UAT.

create table if not exists public.ti_hotel_support_invitations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid null references public.tournaments(id) on delete set null,
  token_hash text not null unique,
  offered_rate_cents integer not null,
  state text not null default 'active',
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_by uuid null references auth.users(id) on delete set null,
  revoked_at timestamptz null,
  consumed_at timestamptz null,
  constraint ti_hotel_support_invitations_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint ti_hotel_support_invitations_rate_check
    check (offered_rate_cents in (500, 1000)),
  constraint ti_hotel_support_invitations_state_check
    check (state in ('active', 'consumed', 'revoked')),
  constraint ti_hotel_support_invitations_expiry_check
    check (expires_at > created_at),
  constraint ti_hotel_support_invitations_state_fields_check
    check (
      (state = 'active' and revoked_at is null and consumed_at is null)
      or (state = 'revoked' and revoked_at is not null and consumed_at is null)
      or (state = 'consumed' and consumed_at is not null and revoked_at is null)
    )
);

create unique index if not exists ti_hotel_support_invitations_one_active_per_tournament_idx
  on public.ti_hotel_support_invitations (tournament_id)
  where state = 'active';

create index if not exists ti_hotel_support_invitations_tournament_created_idx
  on public.ti_hotel_support_invitations (tournament_id, created_at desc);

create table if not exists public.ti_hotel_support_acceptances (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique
    references public.ti_hotel_support_invitations(id) on delete restrict,
  tournament_id uuid null,
  tournament_name_snapshot text not null,
  tournament_start_date_snapshot date null,
  tournament_end_date_snapshot date null,
  tournament_city_snapshot text null,
  tournament_state_snapshot text null,
  offered_rate_cents integer not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text null,
  contact_title text null,
  expected_recipient_type text not null,
  expected_recipient_name text not null,
  terms_version text not null,
  terms_content_sha256 text not null,
  accepted_at timestamptz not null default now(),
  confirm_authority boolean not null,
  confirm_housing_eligibility boolean not null,
  confirm_no_guarantee boolean not null,
  confirm_eligible_attribution boolean not null,
  confirm_terms boolean not null,
  created_at timestamptz not null default now(),
  constraint ti_hotel_support_acceptances_rate_check
    check (offered_rate_cents in (500, 1000)),
  constraint ti_hotel_support_acceptances_recipient_type_check
    check (expected_recipient_type in ('tournament_organization', 'nonprofit_booster', 'business', 'individual', 'other')),
  constraint ti_hotel_support_acceptances_terms_hash_check
    check (terms_content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint ti_hotel_support_acceptances_field_lengths_check
    check (
      length(btrim(contact_name)) between 1 and 160
      and length(btrim(contact_email)) between 3 and 320
      and (contact_phone is null or length(btrim(contact_phone)) between 1 and 50)
      and (contact_title is null or length(btrim(contact_title)) between 1 and 120)
      and length(btrim(expected_recipient_name)) between 1 and 200
    ),
  constraint ti_hotel_support_acceptances_confirmations_check
    check (
      confirm_authority
      and confirm_housing_eligibility
      and confirm_no_guarantee
      and confirm_eligible_attribution
      and confirm_terms
    )
);

create index if not exists ti_hotel_support_acceptances_tournament_rate_idx
  on public.ti_hotel_support_acceptances (tournament_id, offered_rate_cents, accepted_at desc);

create table if not exists public.ti_hotel_support_enrollment_reviews (
  enrollment_id uuid primary key
    references public.ti_hotel_support_acceptances(id) on delete restrict,
  status text not null default 'submitted',
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  review_note text null,
  created_at timestamptz not null default now(),
  constraint ti_hotel_support_enrollment_reviews_status_check
    check (status in ('submitted', 'approved', 'declined')),
  constraint ti_hotel_support_enrollment_reviews_fields_check
    check (
      (status = 'submitted' and reviewed_by is null and reviewed_at is null)
      or (status in ('approved', 'declined') and reviewed_by is not null and reviewed_at is not null)
    )
);

create index if not exists ti_hotel_support_enrollment_reviews_status_idx
  on public.ti_hotel_support_enrollment_reviews (status, created_at desc);

create table if not exists public.ti_hotel_support_enrollment_audit (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid null,
  invitation_id uuid null references public.ti_hotel_support_invitations(id) on delete restrict,
  enrollment_id uuid null references public.ti_hotel_support_acceptances(id) on delete restrict,
  action text not null,
  resulting_state text not null,
  actor_admin_id uuid null references auth.users(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ti_hotel_support_enrollment_audit_action_check
    check (action in ('invitation_created', 'invitation_replaced', 'invitation_revoked', 'enrollment_submitted', 'enrollment_approved', 'enrollment_declined'))
);

create index if not exists ti_hotel_support_enrollment_audit_tournament_created_idx
  on public.ti_hotel_support_enrollment_audit (tournament_id, created_at desc);

comment on table public.ti_hotel_support_invitations is
  'Service-role-only Hotel Support bearer invitations. Only SHA-256 token hashes are stored.';
comment on table public.ti_hotel_support_acceptances is
  'Immutable director acceptance evidence. Mutable administrative state is stored separately.';
comment on table public.ti_hotel_support_enrollment_reviews is
  'Mutable founder review decision for one immutable Hotel Support acceptance.';
comment on table public.ti_hotel_support_enrollment_audit is
  'Append-only administrative and submission audit trail for Hotel Support enrollment.';

create or replace function public.prevent_ti_hotel_support_immutable_change_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Hotel Support acceptance and audit evidence is immutable'
    using errcode = '55000';
end;
$$;

revoke all on function public.prevent_ti_hotel_support_immutable_change_v1() from public, anon, authenticated;
grant execute on function public.prevent_ti_hotel_support_immutable_change_v1() to service_role;

drop trigger if exists ti_hotel_support_acceptances_immutable_v1
  on public.ti_hotel_support_acceptances;
create trigger ti_hotel_support_acceptances_immutable_v1
  before update or delete on public.ti_hotel_support_acceptances
  for each row execute function public.prevent_ti_hotel_support_immutable_change_v1();

drop trigger if exists ti_hotel_support_enrollment_audit_immutable_v1
  on public.ti_hotel_support_enrollment_audit;
create trigger ti_hotel_support_enrollment_audit_immutable_v1
  before update or delete on public.ti_hotel_support_enrollment_audit
  for each row execute function public.prevent_ti_hotel_support_immutable_change_v1();

create or replace function public.enforce_ti_hotel_support_review_transition_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status <> 'submitted' then
    raise exception 'Reviewed Hotel Support enrollment decisions are terminal'
      using errcode = '55000';
  end if;
  if new.status not in ('approved', 'declined') then
    raise exception 'Hotel Support enrollment must be approved or declined'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_ti_hotel_support_review_transition_v1() from public, anon, authenticated;
grant execute on function public.enforce_ti_hotel_support_review_transition_v1() to service_role;

drop trigger if exists ti_hotel_support_enrollment_reviews_transition_v1
  on public.ti_hotel_support_enrollment_reviews;
create trigger ti_hotel_support_enrollment_reviews_transition_v1
  before update on public.ti_hotel_support_enrollment_reviews
  for each row execute function public.enforce_ti_hotel_support_review_transition_v1();

create or replace function public.enforce_ti_tournament_support_enrollment_guard_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_requires_enrollment boolean := false;
begin
  if new.program_type = 'tournament_support' and new.status = 'active' then
    if tg_op = 'INSERT' then
      v_requires_enrollment := true;
    else
      v_requires_enrollment :=
        old.program_type is distinct from 'tournament_support'
        or old.status is distinct from 'active'
        or old.rate_cents is distinct from new.rate_cents;
    end if;
  end if;

  if v_requires_enrollment and not exists (
       select 1
       from public.ti_hotel_support_acceptances a
       join public.ti_hotel_support_enrollment_reviews r on r.enrollment_id = a.id
       where a.tournament_id = new.tournament_id
         and a.offered_rate_cents = new.rate_cents
         and r.status = 'approved'
     )
  then
    raise exception 'Active Tournament Support requires an approved same-rate director enrollment'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_ti_tournament_support_enrollment_guard_v1() from public, anon, authenticated;
grant execute on function public.enforce_ti_tournament_support_enrollment_guard_v1() to service_role;

drop trigger if exists ti_tournament_hotel_program_enrollment_guard_v1
  on public.ti_tournament_hotel_programs;
create trigger ti_tournament_hotel_program_enrollment_guard_v1
  before insert or update on public.ti_tournament_hotel_programs
  for each row execute function public.enforce_ti_tournament_support_enrollment_guard_v1();

create or replace function public.create_ti_hotel_support_invitation_v1(
  p_tournament_id uuid,
  p_offered_rate_cents integer,
  p_token_hash text,
  p_expires_at timestamptz,
  p_admin_id uuid
)
returns table(invitation_id uuid, invitation_expires_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_invitation_id uuid;
  v_revoked_id uuid;
begin
  if p_offered_rate_cents not in (500, 1000) then
    raise exception 'Unsupported Hotel Support rate' using errcode = '22023';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation token hash' using errcode = '22023';
  end if;
  if p_expires_at <= now() then
    raise exception 'Invitation expiry must be in the future' using errcode = '22023';
  end if;
  if not exists (select 1 from public.tournaments where id = p_tournament_id) then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  for v_revoked_id in
    update public.ti_hotel_support_invitations
      set state = 'revoked', revoked_by = p_admin_id, revoked_at = now()
      where tournament_id = p_tournament_id and state = 'active'
      returning id
  loop
    insert into public.ti_hotel_support_enrollment_audit (
      tournament_id, invitation_id, action, resulting_state, actor_admin_id
    ) values (
      p_tournament_id, v_revoked_id, 'invitation_replaced', 'revoked', p_admin_id
    );
  end loop;

  insert into public.ti_hotel_support_invitations (
    tournament_id, token_hash, offered_rate_cents, state, created_by, expires_at
  ) values (
    p_tournament_id, p_token_hash, p_offered_rate_cents, 'active', p_admin_id, p_expires_at
  ) returning id into v_invitation_id;

  insert into public.ti_hotel_support_enrollment_audit (
    tournament_id, invitation_id, action, resulting_state, actor_admin_id,
    detail
  ) values (
    p_tournament_id, v_invitation_id, 'invitation_created', 'active', p_admin_id,
    jsonb_build_object('offered_rate_cents', p_offered_rate_cents, 'expires_at', p_expires_at)
  );

  return query select v_invitation_id, p_expires_at;
end;
$$;

create or replace function public.revoke_ti_hotel_support_invitation_v1(
  p_invitation_id uuid,
  p_admin_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tournament_id uuid;
begin
  update public.ti_hotel_support_invitations
    set state = 'revoked', revoked_by = p_admin_id, revoked_at = now()
    where id = p_invitation_id and state = 'active'
    returning tournament_id into v_tournament_id;
  if not found then return false; end if;

  insert into public.ti_hotel_support_enrollment_audit (
    tournament_id, invitation_id, action, resulting_state, actor_admin_id
  ) values (
    v_tournament_id, p_invitation_id, 'invitation_revoked', 'revoked', p_admin_id
  );
  return true;
end;
$$;

create or replace function public.submit_ti_hotel_support_enrollment_v1(
  p_token_hash text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_contact_title text,
  p_expected_recipient_type text,
  p_expected_recipient_name text,
  p_confirm_authority boolean,
  p_confirm_housing_eligibility boolean,
  p_confirm_no_guarantee boolean,
  p_confirm_eligible_attribution boolean,
  p_confirm_terms boolean
)
returns table(result_status text, enrollment_id uuid, tournament_name text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_invitation public.ti_hotel_support_invitations%rowtype;
  v_tournament public.tournaments%rowtype;
  v_enrollment_id uuid;
  v_existing_name text;
  v_terms_version constant text := 'tournament_hotel_support_v1';
  v_terms_sha256 constant text := '061b23e19d783841f3600ce7967b06545e0dc6f6d8e42435830ff09bca9fe33c';
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;
  if not (p_confirm_authority and p_confirm_housing_eligibility and p_confirm_no_guarantee and p_confirm_eligible_attribution and p_confirm_terms) then
    raise exception 'All confirmations are required' using errcode = '23514';
  end if;

  select i.* into v_invitation
  from public.ti_hotel_support_invitations i
  where i.token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'Invalid invitation' using errcode = 'P0002';
  end if;

  if v_invitation.state = 'consumed' then
    select a.id, a.tournament_name_snapshot
      into v_enrollment_id, v_existing_name
    from public.ti_hotel_support_acceptances a
    where a.invitation_id = v_invitation.id;
    if found then
      return query select 'already_submitted'::text, v_enrollment_id, v_existing_name;
      return;
    end if;
    raise exception 'Consumed invitation has no acceptance' using errcode = '23514';
  end if;

  if v_invitation.state <> 'active' or v_invitation.expires_at <= now() then
    raise exception 'Invitation is unavailable' using errcode = 'P0001';
  end if;

  select t.* into v_tournament
  from public.tournaments t
  where t.id = v_invitation.tournament_id;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  insert into public.ti_hotel_support_acceptances (
    invitation_id,
    tournament_id,
    tournament_name_snapshot,
    tournament_start_date_snapshot,
    tournament_end_date_snapshot,
    tournament_city_snapshot,
    tournament_state_snapshot,
    offered_rate_cents,
    contact_name,
    contact_email,
    contact_phone,
    contact_title,
    expected_recipient_type,
    expected_recipient_name,
    terms_version,
    terms_content_sha256,
    confirm_authority,
    confirm_housing_eligibility,
    confirm_no_guarantee,
    confirm_eligible_attribution,
    confirm_terms
  ) values (
    v_invitation.id,
    v_invitation.tournament_id,
    v_tournament.name,
    v_tournament.start_date,
    v_tournament.end_date,
    v_tournament.city,
    v_tournament.state,
    v_invitation.offered_rate_cents,
    btrim(p_contact_name),
    lower(btrim(p_contact_email)),
    nullif(btrim(p_contact_phone), ''),
    nullif(btrim(p_contact_title), ''),
    p_expected_recipient_type,
    btrim(p_expected_recipient_name),
    v_terms_version,
    v_terms_sha256,
    true,
    true,
    true,
    true,
    true
  ) returning id into v_enrollment_id;

  insert into public.ti_hotel_support_enrollment_reviews (enrollment_id, status)
  values (v_enrollment_id, 'submitted');

  update public.ti_hotel_support_invitations
    set state = 'consumed', consumed_at = now()
    where id = v_invitation.id;

  insert into public.ti_hotel_support_enrollment_audit (
    tournament_id, invitation_id, enrollment_id, action, resulting_state
  ) values (
    v_invitation.tournament_id, v_invitation.id, v_enrollment_id, 'enrollment_submitted', 'submitted'
  );

  return query select 'submitted'::text, v_enrollment_id, v_tournament.name;
end;
$$;

create or replace function public.review_ti_hotel_support_enrollment_v1(
  p_enrollment_id uuid,
  p_decision text,
  p_review_note text,
  p_admin_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tournament_id uuid;
  v_invitation_id uuid;
begin
  if p_decision not in ('approved', 'declined') then
    raise exception 'Invalid enrollment decision' using errcode = '22023';
  end if;

  select a.tournament_id, a.invitation_id
    into v_tournament_id, v_invitation_id
  from public.ti_hotel_support_acceptances a
  where a.id = p_enrollment_id;
  if not found then return false; end if;

  update public.ti_hotel_support_enrollment_reviews
    set status = p_decision,
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        review_note = nullif(btrim(p_review_note), '')
    where enrollment_id = p_enrollment_id and status = 'submitted';
  if not found then return false; end if;

  insert into public.ti_hotel_support_enrollment_audit (
    tournament_id, invitation_id, enrollment_id, action, resulting_state, actor_admin_id
  ) values (
    v_tournament_id,
    v_invitation_id,
    p_enrollment_id,
    case when p_decision = 'approved' then 'enrollment_approved' else 'enrollment_declined' end,
    p_decision,
    p_admin_id
  );
  return true;
end;
$$;

alter table public.ti_hotel_support_invitations enable row level security;
alter table public.ti_hotel_support_acceptances enable row level security;
alter table public.ti_hotel_support_enrollment_reviews enable row level security;
alter table public.ti_hotel_support_enrollment_audit enable row level security;

revoke all on table public.ti_hotel_support_invitations from public, anon, authenticated;
revoke all on table public.ti_hotel_support_acceptances from public, anon, authenticated;
revoke all on table public.ti_hotel_support_enrollment_reviews from public, anon, authenticated;
revoke all on table public.ti_hotel_support_enrollment_audit from public, anon, authenticated;

grant select, insert, update on table public.ti_hotel_support_invitations to service_role;
grant select, insert on table public.ti_hotel_support_acceptances to service_role;
grant select, insert, update on table public.ti_hotel_support_enrollment_reviews to service_role;
grant select, insert on table public.ti_hotel_support_enrollment_audit to service_role;

revoke all on function public.create_ti_hotel_support_invitation_v1(uuid, integer, text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.revoke_ti_hotel_support_invitation_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.submit_ti_hotel_support_enrollment_v1(text, text, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.review_ti_hotel_support_enrollment_v1(uuid, text, text, uuid) from public, anon, authenticated;

grant execute on function public.create_ti_hotel_support_invitation_v1(uuid, integer, text, timestamptz, uuid) to service_role;
grant execute on function public.revoke_ti_hotel_support_invitation_v1(uuid, uuid) to service_role;
grant execute on function public.submit_ti_hotel_support_enrollment_v1(text, text, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean) to service_role;
grant execute on function public.review_ti_hotel_support_enrollment_v1(uuid, text, text, uuid) to service_role;
