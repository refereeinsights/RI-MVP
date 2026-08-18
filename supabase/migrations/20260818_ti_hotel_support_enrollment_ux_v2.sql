-- Tournament Hotel Support enrollment UX/evidence v2.
-- This migration does not activate Hotel Program routing or rewrite immutable evidence.

do $$
begin
  if to_regclass('public.ti_hotel_support_acceptances') is null then
    raise exception 'Hotel Support enrollment foundation is not applied';
  end if;

  if exists (
    select 1
    from public.ti_hotel_support_acceptances
    where expected_recipient_type = 'individual'
  ) then
    raise exception 'individual Hotel Support recipient evidence exists; migration requires manual review';
  end if;
end;
$$;

alter table public.ti_hotel_support_acceptances
  add column confirmation_version text not null default 'five_checkbox_v1';

-- Future inserts must always declare their evidence model explicitly.
alter table public.ti_hotel_support_acceptances
  alter column confirmation_version drop default,
  alter column confirm_no_guarantee drop not null,
  alter column confirm_eligible_attribution drop not null;

alter table public.ti_hotel_support_acceptances
  drop constraint ti_hotel_support_acceptances_recipient_type_check,
  add constraint ti_hotel_support_acceptances_recipient_type_check
    check (expected_recipient_type in ('tournament_organization', 'nonprofit_booster', 'business', 'other'));

alter table public.ti_hotel_support_acceptances
  drop constraint ti_hotel_support_acceptances_confirmations_check,
  add constraint ti_hotel_support_acceptances_confirmations_check
    check (
      (
        confirmation_version = 'five_checkbox_v1'
        and confirm_authority is true
        and confirm_housing_eligibility is true
        and confirm_no_guarantee is true
        and confirm_eligible_attribution is true
        and confirm_terms is true
      )
      or
      (
        confirmation_version = 'three_checkbox_v2'
        and confirm_authority is true
        and confirm_housing_eligibility is true
        and confirm_no_guarantee is null
        and confirm_eligible_attribution is null
        and confirm_terms is true
      )
    ),
  add constraint ti_hotel_support_acceptances_terms_confirmation_version_check
    check (
      (confirmation_version = 'five_checkbox_v1' and terms_version = 'tournament_hotel_support_v1')
      or
      (confirmation_version = 'three_checkbox_v2' and terms_version = 'tournament_hotel_support_v2')
    );

comment on column public.ti_hotel_support_acceptances.confirmation_version is
  'Evidence model: five_checkbox_v1 records five direct confirmations; three_checkbox_v2 records three direct confirmations and relies on the canonical accepted terms for no-guarantee and eligible-attribution evidence.';
comment on column public.ti_hotel_support_acceptances.confirm_no_guarantee is
  'Direct v1 confirmation. NULL for three_checkbox_v2 because the concept is accepted through the canonical versioned terms, not a separate checkbox.';
comment on column public.ti_hotel_support_acceptances.confirm_eligible_attribution is
  'Direct v1 confirmation. NULL for three_checkbox_v2 because the concept is accepted through the canonical versioned terms, not a separate checkbox.';

-- Preserve the v1 signature and evidence behavior after confirmation_version
-- loses its default by inserting the v1 evidence model explicitly.
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
  if not (
    p_confirm_authority is true
    and p_confirm_housing_eligibility is true
    and p_confirm_no_guarantee is true
    and p_confirm_eligible_attribution is true
    and p_confirm_terms is true
  ) then
    raise exception 'All confirmations are required' using errcode = '23514';
  end if;
  if p_expected_recipient_type not in ('tournament_organization', 'nonprofit_booster', 'business', 'other') then
    raise exception 'Invalid expected recipient type' using errcode = '22023';
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
    confirmation_version,
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
    'five_checkbox_v1',
    p_confirm_authority,
    p_confirm_housing_eligibility,
    p_confirm_no_guarantee,
    p_confirm_eligible_attribution,
    p_confirm_terms
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

create or replace function public.submit_ti_hotel_support_enrollment_v2(
  p_token_hash text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_contact_title text,
  p_expected_recipient_type text,
  p_expected_recipient_name text,
  p_confirm_authority boolean,
  p_confirm_housing_eligibility boolean,
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
  v_terms_version constant text := 'tournament_hotel_support_v2';
  v_terms_sha256 text;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;

  if not (
    p_confirm_authority is true
    and p_confirm_housing_eligibility is true
    and p_confirm_terms is true
  ) then
    raise exception 'All displayed confirmations are required' using errcode = '23514';
  end if;

  if p_expected_recipient_type not in ('tournament_organization', 'nonprofit_booster', 'business', 'other') then
    raise exception 'Invalid expected recipient type' using errcode = '22023';
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

  v_terms_sha256 := case v_invitation.offered_rate_cents
    when 500 then '85f870fea59e35e8f42362662ea969a0ec17723ab5128994e6332b26304c96d8'
    when 1000 then '3382fa937abc7a0d841d1766ad8d18b6250151267138846f9149516178ffaa8c'
    else null
  end;
  if v_terms_sha256 is null then
    raise exception 'Unsupported Hotel Support rate' using errcode = '22023';
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
    confirmation_version,
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
    'three_checkbox_v2',
    p_confirm_authority,
    p_confirm_housing_eligibility,
    null,
    null,
    p_confirm_terms
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

revoke all on function public.submit_ti_hotel_support_enrollment_v2(
  text, text, text, text, text, text, text, boolean, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.submit_ti_hotel_support_enrollment_v2(
  text, text, text, text, text, text, text, boolean, boolean, boolean
) to service_role;

comment on function public.submit_ti_hotel_support_enrollment_v2(
  text, text, text, text, text, text, text, boolean, boolean, boolean
) is 'Atomically consumes a Hotel Support invitation and stores three-checkbox v2 acceptance evidence using canonical rate-specific terms hashes.';
